import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const {
  buildDeploymentNotificationEmail,
  escapeNotificationHtml,
  shouldSendDeploymentNotification,
} = await import('../../apps/worker/src/notification/deployment-notification.js');

const activateJob = await readFile(
  new URL('../../apps/worker/src/jobs/activate-release.job.js', import.meta.url),
  'utf8',
);

const rollbackJob = await readFile(
  new URL('../../apps/worker/src/jobs/rollback-release.job.js', import.meta.url),
  'utf8',
);

const notificationSource = await readFile(
  new URL('../../apps/worker/src/notification/deployment-notification.js', import.meta.url),
  'utf8',
);

const pipelineSource = await readFile(
  new URL('../../apps/worker/src/deployment/pipeline.js', import.meta.url),
  'utf8',
);

describe('deployment notifications', () => {
  it('escapes HTML interpolated into notification bodies', () => {
    assert.equal(
      escapeNotificationHtml(`<script>"x"&'</script>`),
      '&lt;script&gt;&quot;x&quot;&amp;&#39;&lt;/script&gt;',
    );
  });

  it('builds successful deployment emails with short commit and dashboard link', () => {
    const email = buildDeploymentNotificationEmail(
      {
        projectName: 'Safe App',
        projectSlug: 'safe-app',
        sequenceNumber: 12,
        status: 'HEALTHY',
        commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
        platformDomain: 'deploy.example.test',
      },
      { email: 'owner@example.test', name: 'Owner' },
    );

    assert.equal(email.to, 'owner@example.test');
    assert.match(email.subject, /Deployment #12 succeeded/);
    assert.match(email.html, /abcdef1/);
    assert.match(email.html, /https:\/\/deploy\.example\.test\/projects\/safe-app\/deployments/);
    assert.match(email.text, /succeeded \(commit abcdef1\)/);
  });

  it('builds failed deployment emails without injecting failure HTML', () => {
    const email = buildDeploymentNotificationEmail(
      {
        projectName: '<b>App</b>',
        projectSlug: 'app',
        sequenceNumber: 13,
        status: 'FAILED',
        commitSha: '1111111234567890abcdef1234567890abcdef12',
        failureCode: 'BUILD_FAILED',
        failureSummary: '<img src=x onerror=alert(1)>',
        platformDomain: 'deploy.example.test',
      },
      { email: 'owner@example.test', name: '<Admin>' },
    );

    assert.match(email.subject, /Deployment #13 failed/);
    assert.match(email.html, /&lt;Admin&gt;/);
    assert.match(email.html, /&lt;b&gt;App&lt;\/b&gt;/);
    assert.match(email.html, /BUILD_FAILED/);
    assert.doesNotMatch(email.html, /<img/);
    assert.match(email.text, /failed \(commit 1111111\)/);
  });

  it('leads a failed deployment email with plain-language copy, not the raw failure code', () => {
    const email = buildDeploymentNotificationEmail(
      {
        projectName: 'App',
        projectSlug: 'app',
        sequenceNumber: 14,
        status: 'FAILED',
        commitSha: '2222222234567890abcdef1234567890abcdef12',
        failureCode: 'BUILD_FAILED',
        failureSummary: 'npm ERR! missing script: build',
        platformDomain: 'deploy.example.test',
      },
      { email: 'owner@example.test', name: 'Owner' },
    );

    assert.match(email.html, /Your app failed to build\./);
    assert.match(email.text, /Your app failed to build\./);
    // Raw code/summary still present, but only as a secondary "technical details" line.
    assert.match(email.html, /Technical details.*BUILD_FAILED/s);
  });

  it('honors ALL, FAILURE_ONLY, and NONE notification preferences', () => {
    assert.equal(shouldSendDeploymentNotification('ALL', 'HEALTHY'), true);
    assert.equal(shouldSendDeploymentNotification('ALL', 'FAILED'), true);
    assert.equal(shouldSendDeploymentNotification('FAILURE_ONLY', 'HEALTHY'), false);
    assert.equal(shouldSendDeploymentNotification('FAILURE_ONLY', 'FAILED'), true);
    assert.equal(shouldSendDeploymentNotification('NONE', 'HEALTHY'), false);
    assert.equal(shouldSendDeploymentNotification('NONE', 'FAILED'), false);
  });

  it('uses firstName for the greeting and strips subject control characters', () => {
    const email = buildDeploymentNotificationEmail(
      {
        projectName: 'Safe\r\nBcc: injected@example.test',
        projectSlug: 'safe-app',
        sequenceNumber: 15,
        status: 'HEALTHY',
        commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
        platformDomain: 'deploy.example.test',
      },
      { email: 'owner@example.test', firstName: 'Ada', name: 'Wrong name' },
    );
    assert.match(email.html, /Hi Ada,/);
    assert.doesNotMatch(email.html, /Wrong name/);
    assert.doesNotMatch(email.subject, /[\r\n]/);
  });

  it('is durably attempted after activation and rollback without changing deployment results', () => {
    // Both jobs wire the notifier into the shared pipeline, which awaits the
    // durable record while containing notification failures.
    assert.match(activateJob, /notifyDeploymentResult,/);
    assert.match(rollbackJob, /notifyDeploymentResult,/);
    assert.match(pipelineSource, /\.notifyDeploymentResult\(\{/);
    assert.match(pipelineSource, /await deps\.notifyDeploymentResult/);
    assert.match(pipelineSource, /Notification failure must never change the terminal deployment/);
    assert.match(notificationSource, /Failures are logged but never rethrown/);
    assert.match(
      notificationSource,
      /logger\.warn\('\[notification\] Error sending deployment notification'/,
    );
  });
});
