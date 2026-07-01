import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const deploymentDetail = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
  'utf8',
);

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

describe('deployment timeline UI', () => {
  it('normalizes deployment statuses and worker event stages into one timeline', () => {
    assert.match(
      deploymentDetail,
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
    assert.match(deploymentDetail, /function updateTimeline\(ev\)/);
    assert.match(deploymentDetail, /stage\.classList\.add\('deployment-stage--active'\)/);
    assert.match(deploymentDetail, /document\.createElement\('span'\)/);
    assert.match(deploymentDetail, /message\.textContent = ev\.message \|\| ''/);
    assert.doesNotMatch(deploymentDetail, /line\.innerHTML/);
  });

  it('uses matching deployment-stage modifier classes in CSS', () => {
    assert.match(componentsCss, /\.deployment-stage--complete/);
    assert.match(componentsCss, /\.deployment-stage--active/);
    assert.match(componentsCss, /\.deployment-stage--failed/);
    assert.match(componentsCss, /\.deployment-stage__message/);
    assert.match(componentsCss, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  });
});
