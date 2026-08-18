import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';

const { handleCleanupReleases } =
  await import('../../apps/worker/src/jobs/cleanup-releases.job.js');

describe('cleanup-releases job — dangling image prune', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('runs the dangling-image prune sweep on every cleanup pass', async () => {
    let pruneCalls = 0;
    const deps = {
      stopAndRemoveContainer: async () => {},
      removeDockerImage: async () => true,
      cleanupAbandonedBuildWorkspaces: async () => 0,
      pruneDanglingImages: async () => {
        pruneCalls += 1;
        return 3;
      },
    };

    await handleCleanupReleases({ data: {} }, deps);

    assert.equal(pruneCalls, 1);
  });
});
