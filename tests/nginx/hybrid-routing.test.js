import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const pipeline = await readFile(
  new URL('../../apps/worker/src/deployment/pipeline.js', import.meta.url),
  'utf8',
);
const maintenanceJob = await readFile(
  new URL('../../apps/worker/src/jobs/set-project-maintenance.job.js', import.meta.url),
  'utf8',
);
const stopJob = await readFile(
  new URL('../../apps/worker/src/jobs/stop-project.job.js', import.meta.url),
  'utf8',
);
const workerConfig = await readFile(
  new URL('../../apps/worker/src/config/env.js', import.meta.url),
  'utf8',
);

describe('application routing domain', () => {
  it('routes deployment lifecycle operations through DEPLOYMENT_DOMAIN', () => {
    for (const source of [pipeline, maintenanceJob, stopJob]) {
      assert.match(source, /env\.DEPLOYMENT_DOMAIN/);
      assert.doesNotMatch(source, /env\.PLATFORM_DOMAIN/);
    }
  });

  it('retains PLATFORM_DOMAIN as the backward-compatible worker fallback', () => {
    assert.match(workerConfig, /'DEPLOYMENT_DOMAIN'/);
    assert.match(
      workerConfig,
      /deploymentDomainRaw = optional\('DEPLOYMENT_DOMAIN', platformDomainRaw\)/,
    );
  });
});
