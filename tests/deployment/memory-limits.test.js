import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

process.env.BUILD_MEMORY_MB = '2048';
process.env.RUNTIME_MEMORY_MB = '512';

const { env } = await import('../../apps/worker/src/config/env.js');

const { createDockerBuildArgs } = await import('../../apps/worker/src/deployment/build.js');
const runtime = await readFile(
  new URL('../../apps/worker/src/runtime.js', import.meta.url),
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
  it('sizes the default-builder memory flag from configuration', () => {
    const args = createDockerBuildArgs({ contextDir: '/c', imageTag: 't', buildMemoryMb: 2048 });
    assert.equal(args[args.indexOf('--memory') + 1], '2048m');
  });

  it('applies the configured limit to the dedicated builder container at startup', () => {
    assert.match(
      runtime,
      /ensureBuildBuilder\(\{\s*name: env\.BUILD_BUILDER_NAME,\s*memoryMb: env\.BUILD_MEMORY_MB/,
    );
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
