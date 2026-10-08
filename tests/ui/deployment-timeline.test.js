import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ejs from 'ejs';

const deploymentDetail = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
  'utf8',
);

const deploymentDetailPath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
);

const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

const at = (time) => new Date(`2026-10-08T15:${time}.000Z`);
const healthyEvents = [
  {
    stage: 'VALIDATE',
    level: 'INFO',
    messageRedacted: 'Validation started.',
    createdAt: at('02:05'),
  },
  {
    stage: 'BUILD',
    level: 'INFO',
    messageRedacted: 'Starting docker build.',
    createdAt: at('02:20'),
  },
  {
    stage: 'DEPLOY',
    level: 'INFO',
    messageRedacted: 'Deployment HEALTHY. Container: web-1 on port 10010.',
    createdAt: at('03:01'),
  },
];

function renderDeployment(overrides = {}) {
  return ejs.renderFile(deploymentDetailPath, {
    project: { slug: 'hellorun', activeDeploymentId: 'd1' },
    membership: { role: 'OWNER' },
    deployment: {
      _id: 'd1',
      sequenceNumber: 6,
      status: 'HEALTHY',
      commitSha: '9b98765abc',
      triggerType: 'MANUAL',
      startedAt: at('02:00'),
      completedAt: at('04:10'),
      ...overrides.deployment,
    },
    events: overrides.events ?? healthyEvents,
    isCurrentRelease: true,
    failureCopy: overrides.failureCopy ?? null,
    rollbackSource: null,
    statusPresentation: (_kind, status) => ({ label: status, hint: '', tone: 'healthy' }),
    csrfToken: 'test-token',
  });
}

function stepFor(html, key) {
  return html.match(
    new RegExp(`<li class="deploy-step[^"]*" data-stage-key="${key}"[\\s\\S]*?</li>`),
  )[0];
}

describe('deployment timeline UI', () => {
  it('normalizes deployment statuses and worker event stages into one timeline', () => {
    assert.match(
      appJs,
      /const eventStageToStatus = \{ VALIDATE: 'VALIDATING', BUILD: 'BUILDING', DEPLOY: 'DEPLOYING' \}/,
    );
    assert.match(deploymentDetail, /key: 'VALIDATING', label: 'Validate'/);
    assert.match(deploymentDetail, /key: 'BUILDING', label: 'Build'/);
    assert.match(deploymentDetail, /key: 'DEPLOYING', label: 'Deploy'/);
    assert.match(deploymentDetail, /latestErrorEvent/);
    assert.match(deploymentDetail, /failedStageKey/);
  });

  it('renders accessible stepper hooks for state, status, meta, and detail', () => {
    assert.match(deploymentDetail, /Deployment Timeline/);
    assert.match(deploymentDetail, /data-stage-key="<%= stage\.key %>"/);
    assert.match(deploymentDetail, /deploy-step--<%= state %>/);
    assert.match(deploymentDetail, /class="sr-only" data-stage-status/);
    assert.match(deploymentDetail, /data-stage-meta/);
    assert.match(deploymentDetail, /aria-live="polite" data-stage-detail-lines>/);
  });

  it('updates the live timeline without injecting log HTML', () => {
    assert.match(appJs, /function updateTimeline\(ev\)/);
    assert.match(appJs, /setStageState\(stage, 'active', 'In progress'\)/);
    assert.match(appJs, /document\.createElement\('span'\)/);
    assert.match(appJs, /message\.textContent = ev\.message \|\| ''/);
    assert.doesNotMatch(appJs, /lines\.innerHTML|line\.innerHTML|meta\.innerHTML/);
    assert.doesNotMatch(appJs, /line\.innerHTML/);
  });

  it('shows only the glyph that matches each step state', () => {
    assert.match(
      componentsCss,
      /\.deploy-step--pending \.deploy-step__glyph--pending,\s*\.deploy-step--active \.deploy-step__glyph--active,\s*\.deploy-step--complete \.deploy-step__glyph--complete,\s*\.deploy-step--failed \.deploy-step__glyph--failed \{\s*display: block;/,
    );
  });

  it('lays the five steps out in one row on wider screens', () => {
    assert.match(
      componentsCss,
      /\.deploy-stepper \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/,
    );
  });

  it('marks the status-dependent regions for refresh while leaving the log output alone', () => {
    const regions = [...deploymentDetail.matchAll(/data-deployment-refresh="([a-z-]+)"/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(regions, ['header', 'result', 'summary', 'timeline', 'log-status']);
  });

  it('marks every earlier stage complete when the live timeline advances', () => {
    assert.match(
      appJs,
      /timelineOrder\.slice\(0, stageIndex\)\.forEach[\s\S]*?setStageState\(earlier, 'complete', 'Complete'\)/,
    );
  });

  it('never moves the live timeline back to an earlier stage', () => {
    assert.match(appJs, /if \(stageIndex < 0 \|\| stageIndex < furthestStageIndex\)/);
  });

  it('draws the line into a step from its state rather than separate connector elements', () => {
    assert.match(componentsCss, /\.deploy-step--complete::before,\s*\.deploy-step--active::before/);
  });

  it('shows how long each finished stage took', async () => {
    const html = await renderDeployment();
    assert.match(stepFor(html, 'BUILDING'), /data-stage-meta>41s</);
  });

  it('describes the live release in the console instead of repeating the deploy log', async () => {
    const html = await renderDeployment();
    assert.match(html, /deploy-console__line--info">Release is live and serving traffic\.</);
  });

  it('stops the console cursor once the deployment is live', async () => {
    const html = await renderDeployment();
    assert.doesNotMatch(html, /deploy-console--running/);
  });

  it('tails only the last three log lines of the running stage', async () => {
    const html = await renderDeployment({
      deployment: { status: 'BUILDING', completedAt: null },
      events: [
        healthyEvents[0],
        ...['#1 load', '#2 metadata', '#3 context', '#4 workdir', '#5 copy'].map((msg, i) => ({
          stage: 'BUILD',
          level: 'INFO',
          messageRedacted: msg,
          createdAt: at(`02:2${i}`),
        })),
      ],
    });
    const lines = [...html.matchAll(/class="deploy-console__line[^"]*">([^<]*)</g)].map(
      (m) => m[1],
    );
    assert.deepEqual(lines, ['#3 context', '#4 workdir', '#5 copy']);
  });

  it('colours the failing log line as an error in the console', async () => {
    const html = await renderDeployment({
      deployment: { status: 'FAILED' },
      events: [
        ...healthyEvents.slice(0, 2),
        {
          stage: 'BUILD',
          level: 'ERROR',
          messageRedacted: 'npm ci failed.',
          createdAt: at('02:50'),
        },
      ],
    });
    assert.match(html, /deploy-console__line--error">npm ci failed\.</);
  });

  it('keeps the live console to the most recent lines', () => {
    assert.match(
      appJs,
      /while \(lines\.children\.length > CONSOLE_LINE_LIMIT\) \{\s*lines\.firstElementChild\.remove\(\);/,
    );
  });

  it('writes live console lines as text, never as markup', () => {
    assert.match(appJs, /line\.textContent = ev\.message \|\| '';\s*lines\.append\(line\);/);
  });

  it('marks the failing stage with the failed state', async () => {
    const html = await renderDeployment({
      deployment: { status: 'FAILED' },
      events: [
        ...healthyEvents.slice(0, 2),
        {
          stage: 'BUILD',
          level: 'ERROR',
          messageRedacted: 'npm ci failed.',
          createdAt: at('02:50'),
        },
      ],
    });
    assert.match(stepFor(html, 'BUILDING'), /class="deploy-step deploy-step--failed"/);
  });

  it('counts the running step up from its recorded start', () => {
    assert.match(
      appJs,
      /document\.querySelector\('\.deploy-step--active\[data-stage-started-at\]'\)/,
    );
  });

  it('exposes the start time so an in-progress duration can count up', () => {
    assert.match(
      deploymentDetail,
      /data-detail-duration data-started-at="<%= new Date\(deployment\.startedAt\)\.toISOString\(\) %>"/,
    );
  });
});
