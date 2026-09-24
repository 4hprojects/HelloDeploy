import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

process.env.BUILD_MEMORY_MB = '2048';
process.env.RUNTIME_MEMORY_MB = '512';

const { env } = await import('../../apps/worker/src/config/env.js');

const build = await readFile(
  new URL('../../apps/worker/src/deployment/build.js', import.meta.url),
  'utf8',
);
const buildJob = await readFile(
  new URL('../../apps/worker/src/jobs/build-deployment.job.js', import.meta.url),
  'utf8',
);
const pipeline = await readFile(
  new URL('../../apps/worker/src/deployment/pipeline.js', import.meta.url),
  'utf8',
);
const rollbackJob = await readFile(
  new URL('../../apps/worker/src/jobs/rollback-release.job.js', import.meta.url),
  'utf8',
);

describe('docker build memory limit', () => {
  it('sizes the build cgroup from configuration rather than a fixed ceiling', () => {
    assert.match(build, /'--memory',\s*`\$\{buildMemoryMb\}m`/);
  });

  it('supplies the configured limit from the build job', () => {
    assert.match(buildJob, /buildMemoryMb: env\.BUILD_MEMORY_MB/);
  });

  it('reads the configured build ceiling as a number', () => {
    assert.equal(env.BUILD_MEMORY_MB, 2048);
  });
});

describe('deployed container memory limit', () => {
  it('reads the configured runtime ceiling as a number', () => {
    assert.equal(env.RUNTIME_MEMORY_MB, 512);
  });

  it('sizes the release default from configuration rather than a fixed ceiling', () => {
    assert.match(pipeline, /export const DEFAULT_MEMORY_MB = env\.RUNTIME_MEMORY_MB;/);
  });

  it('falls back to that default when a job sends no explicit limits', () => {
    assert.match(pipeline, /memoryMb: resourceLimits\?\.memoryMb \?\? DEFAULT_MEMORY_MB/);
  });

  it('leaves rollbacks on that fallback rather than pinning a stale limit', () => {
    assert.doesNotMatch(rollbackJob, /resourceLimits/);
  });
});
