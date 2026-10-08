import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const deploymentDetail = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
  'utf8',
);

const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

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

  it('renders accessible stage summaries with status, message, and time hooks', () => {
    assert.match(deploymentDetail, /Deployment Timeline/);
    assert.match(deploymentDetail, /data-stage-key="<%= stage\.key %>"/);
    assert.match(deploymentDetail, /deployment-stage--<%= state %>/);
    assert.match(deploymentDetail, /data-stage-status/);
    assert.match(deploymentDetail, /data-stage-message/);
    assert.match(deploymentDetail, /data-stage-time/);
  });

  it('updates the live timeline without injecting log HTML', () => {
    assert.match(appJs, /function updateTimeline\(ev\)/);
    assert.match(appJs, /setStageState\(stage, 'active', 'In progress'\)/);
    assert.match(appJs, /document\.createElement\('span'\)/);
    assert.match(appJs, /message\.textContent = ev\.message \|\| ''/);
    assert.doesNotMatch(appJs, /line\.innerHTML/);
  });

  it('uses matching deployment-stage modifier classes in CSS', () => {
    assert.match(componentsCss, /\.deployment-stage--complete/);
    assert.match(componentsCss, /\.deployment-stage--active/);
    assert.match(componentsCss, /\.deployment-stage--failed/);
    assert.match(componentsCss, /\.deployment-stage__message/);
    assert.match(componentsCss, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
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

  it('fills the connectors leading up to the active stage', () => {
    assert.match(appJs, /connector\.classList\.toggle\('connector--complete', i < stageIndex\)/);
  });

  it('exposes the start time so an in-progress duration can count up', () => {
    assert.match(
      deploymentDetail,
      /data-detail-duration data-started-at="<%= new Date\(deployment\.startedAt\)\.toISOString\(\) %>"/,
    );
  });
});
