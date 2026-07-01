import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const { buildDeploymentNotificationEmail, escapeNotificationHtml } =
  await import('../../apps/worker/src/notification/deployment-notification.js');

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

  it('is invoked after activation and rollback without blocking worker completion', () => {
    assert.match(activateJob, /notifyDeploymentResult\(\{/);
    assert.match(rollbackJob, /notifyDeploymentResult\(\{/);
    assert.match(notificationSource, /Failures are logged but never rethrown/);
    assert.match(
      notificationSource,
      /logger\.warn\('\[notification\] Error sending deployment notification'/,
    );
  });
});
