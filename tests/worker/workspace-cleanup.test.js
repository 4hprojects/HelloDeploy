import assert from 'node:assert/strict';
import { lutimes, mkdtemp, mkdir, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';

import { cleanupAbandonedBuildWorkspaces } from '../../apps/worker/src/deployment/cleanup.js';

const cleanup = [];
afterEach(async () =>
  Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))),
);

describe('abandoned build workspace cleanup', () => {
  it('removes only direct children older than the configured age', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hellodeploy-builds-'));
    cleanup.push(root);
    const oldDir = join(root, 'old-deployment');
    const freshDir = join(root, 'fresh-deployment');
    await mkdir(oldDir);
    await mkdir(freshDir);
    const now = Date.now();
    await utimes(oldDir, new Date(now - 10_000), new Date(now - 10_000));

    const removed = await cleanupAbandonedBuildWorkspaces(root, 5_000, now);
    assert.equal(removed, 1);
    assert.deepEqual(await readdir(root), ['fresh-deployment']);
  });

  it('unlinks an old symlink without touching its external target', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hellodeploy-builds-'));
    const outside = await mkdtemp(join(tmpdir(), 'hellodeploy-outside-'));
    cleanup.push(root, outside);
    await writeFile(join(outside, 'keep.txt'), 'safe');
    const link = join(root, 'abandoned-link');
    await symlink(outside, link);
    const now = Date.now();
    await lutimes(link, new Date(now - 10_000), new Date(now - 10_000));

    await cleanupAbandonedBuildWorkspaces(root, 5_000, now);
    assert.deepEqual(await readdir(root), []);
    assert.deepEqual(await readdir(outside), ['keep.txt']);
  });

  it('is a no-op when the build root does not exist', async () => {
    assert.equal(
      await cleanupAbandonedBuildWorkspaces(join(tmpdir(), 'missing-hellodeploy-root'), 1),
      0,
    );
  });
});
