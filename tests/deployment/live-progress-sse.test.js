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

describe('live deployment progress SSE', () => {
  it('exposes deployment logs as an event-stream with buffering disabled', () => {
    assert.match(deploymentController, /Content-Type', 'text\/event-stream'/);
    assert.match(deploymentController, /Cache-Control', 'no-cache'/);
    assert.match(deploymentController, /X-Accel-Buffering', 'no'/);
    assert.match(deploymentController, /res\.flushHeaders\(\)/);
  });

  it('sends existing and new redacted log events followed by terminal status', () => {
    assert.match(deploymentController, /sendEvent\('log'/);
    assert.match(deploymentController, /message: ev\.messageRedacted/);
    assert.match(deploymentController, /DeploymentEvent\.find/);
    assert.match(deploymentController, /_id: \{ \$gt: lastId \}/);
    assert.match(deploymentController, /sendEvent\('status', \{ status: dep\.status \}\)/);
    assert.match(deploymentController, /res\.end\(\)/);
  });

  it('times out long streams without failing the deployment page', () => {
    assert.match(deploymentController, /SSE_MAX_DURATION_MS/);
    assert.match(
      deploymentController,
      /sendEvent\('timeout', \{ message: 'Log stream timed out\.' \}\)/,
    );
    assert.match(deploymentController, /catch \{\n {6}\/\/ Non-fatal/);
  });

  it('connects the browser log viewer through EventSource and safe DOM updates', () => {
    assert.match(deploymentDetail, /data-stream-url=/);
    assert.match(appJs, /new EventSource\(output\.dataset\.streamUrl\)/);
    assert.match(appJs, /source\.addEventListener\('log'/);
    assert.match(appJs, /source\.addEventListener\('status'/);
    assert.match(appJs, /source\.addEventListener\('timeout'/);
    assert.match(appJs, /message\.textContent = ev\.message \|\| ''/);
    assert.doesNotMatch(deploymentDetail, /innerHTML/);
  });
});
