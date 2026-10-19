import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const { createIsolatedDockerConfig } = await import('../../apps/worker/src/deployment/build.js');

async function workerDockerConfig() {
  const dir = await mkdtemp(join(tmpdir(), 'hellodeploy-docker-config-'));
  await mkdir(join(dir, 'buildx'));
  await mkdir(join(dir, 'cli-plugins'));
  await writeFile(
    join(dir, 'config.json'),
    JSON.stringify({ auths: { 'ghcr.io': { auth: 'cGxhdGZvcm06bG9naW4=' } } }),
  );
  return dir;
}

// Owner Dockerfiles run owner code on the builder, and buildx hands the
// client's registry credentials to the builder for any pull.
describe('createIsolatedDockerConfig', () => {
  it('carries no registry credentials', async () => {
    const source = await workerDockerConfig();
    const parent = await mkdtemp(join(tmpdir(), 'hellodeploy-isolated-'));
    const isolated = await createIsolatedDockerConfig(parent, source);
    const config = JSON.parse(await readFile(join(isolated, 'config.json'), 'utf8'));
    assert.deepEqual(config, { auths: {} });
    await rm(source, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  });

  it('keeps the builder definition so buildx still reaches the remote builder', async () => {
    const source = await workerDockerConfig();
    const parent = await mkdtemp(join(tmpdir(), 'hellodeploy-isolated-'));
    const isolated = await createIsolatedDockerConfig(parent, source);
    assert.deepEqual(
      [await readlink(join(isolated, 'buildx')), await readlink(join(isolated, 'cli-plugins'))],
      [join(source, 'buildx'), join(source, 'cli-plugins')],
    );
    await rm(source, { recursive: true, force: true });
    await rm(parent, { recursive: true, force: true });
  });
});
