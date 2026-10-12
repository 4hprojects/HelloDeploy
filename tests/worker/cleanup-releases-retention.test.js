import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Quota } from '@hellodeploy/database';
import { DeploymentStatus, QuotaScope } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { handleCleanupReleases } =
  await import('../../apps/worker/src/jobs/cleanup-releases.job.js');

function makeDeps() {
  const removedImages = [];
  return {
    removedImages,
    deps: {
      stopAndRemoveContainer: async () => {},
      removeDockerImage: async (tag) => removedImages.push(tag),
      cleanupAbandonedBuildWorkspaces: async () => 0,
      pruneDanglingImages: async () => 0,
    },
  };
}

async function seedHealthyReleases(projectId, count) {
  for (let seq = 1; seq <= count; seq++) {
    await createDeployment(projectId, {
      sequenceNumber: seq,
      status: DeploymentStatus.HEALTHY,
      imageTag: `img-${projectId}-${seq}`,
    });
  }
}

describe('cleanup-releases job — HEALTHY release trimming', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('keeps as many releases as the project maxRollbackReleases quota allows', async () => {
    const project = await createProject();
    await Quota.create({
      scopeType: QuotaScope.PROJECT,
      scopeId: project._id,
      maxRollbackReleases: 5,
    });
    await seedHealthyReleases(project._id, 5);
    const { deps, removedImages } = makeDeps();
    await handleCleanupReleases({ data: {} }, deps);
    assert.deepEqual(removedImages, []);
  });

  it('trims releases of a deleted project to the plan default', async () => {
    const orphanProjectId = objectId();
    await seedHealthyReleases(orphanProjectId, 4);
    const { deps, removedImages } = makeDeps();
    await handleCleanupReleases({ data: {} }, deps);
    assert.deepEqual(removedImages, [`img-${orphanProjectId}-1`]);
  });
});
