import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const deploymentController = await readFile(
  new URL('../../apps/web/src/controllers/deployment.controller.js', import.meta.url),
  'utf8',
);

const deploymentDetail = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
  'utf8',
);

const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

const buildJob = await readFile(
  new URL('../../apps/worker/src/jobs/build-deployment.job.js', import.meta.url),
  'utf8',
);

const activateJob = await readFile(
  new URL('../../apps/worker/src/jobs/activate-release.job.js', import.meta.url),
  'utf8',
);

const pipeline = await readFile(
  new URL('../../apps/worker/src/deployment/pipeline.js', import.meta.url),
  'utf8',
);

describe('deployment log viewer safety', () => {
  it('stores deployment event messages through the redaction helper', () => {
    // logEvent lives in the shared pipeline; both jobs source it from there.
    assert.match(pipeline, /messageRedacted: redactLogLine\(message\)/);
    assert.match(buildJob, /import \{[^}]*logEvent[^}]*\} from '\.\.\/deployment\/pipeline\.js'/);
    assert.match(
      activateJob,
      /import \{[\s\S]*?logEvent[\s\S]*?\} from '\.\.\/deployment\/pipeline\.js'/,
    );
  });

  it('streams only redacted event messages to the browser', () => {
    assert.match(deploymentController, /message: ev\.messageRedacted/);
    assert.doesNotMatch(deploymentController, /message: ev\.message[,}]/);
  });

  it('renders stored log messages from the redacted field', () => {
    assert.match(deploymentDetail, /<%= ev\.messageRedacted %>/);
    assert.doesNotMatch(deploymentDetail, /<%- ev\.messageRedacted %>/);
    assert.doesNotMatch(deploymentDetail, /<%= ev\.message %>/);
  });

  it('appends live log messages with textContent instead of HTML injection', () => {
    assert.match(appJs, /document\.createElement\('div'\)/);
    assert.match(appJs, /message\.textContent = ev\.message \|\| ''/);
    assert.doesNotMatch(deploymentDetail, /innerHTML/);
  });
});
