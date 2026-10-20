import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment, Quota } from '@hellodeploy/database';
import { DeploymentStatus, QuotaScope } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

// Cleanup deletes registry manifests only in the platform's own repository.
process.env.USER_IMAGE_REGISTRY = 'ghcr.io/example/apps';
const { handleCleanupReleases } =
  await import('../../apps/worker/src/jobs/cleanup-releases.job.js');

function makeDeps() {
  const removedImages = [];
  const removedManifests = [];
  return {
    removedImages,
    removedManifests,
    deps: {
      stopAndRemoveContainer: async () => {},
      removeDockerImage: async (tag) => removedImages.push(tag),
      deleteRegistryManifest: async (ref) => (removedManifests.push(ref), true),
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

  it('deletes a trimmed release manifest once across sweeps', async () => {
    const project = await createProject();
    for (let seq = 1; seq <= 4; seq++) {
      await createDeployment(project._id, {
        sequenceNumber: seq,
        status: DeploymentStatus.HEALTHY,
        imageTag: `img-${seq}`,
        imageRef: `ghcr.io/example/apps:release-${seq}@sha256:${String(seq).repeat(64)}`,
        imageDigest: `sha256:${String(seq).repeat(64)}`,
      });
    }
    const { deps, removedManifests } = makeDeps();
    await handleCleanupReleases({ data: {} }, deps);
    await handleCleanupReleases({ data: {} }, deps);
    assert.equal(removedManifests.length, 1);
  });

  it('stops rescanning an abandoned prebuilt owner image', async () => {
    const project = await createProject();
    const failed = await createDeployment(project._id, {
      status: DeploymentStatus.FAILED,
      completedAt: new Date(0),
      imageRef: `docker.io/library/nginx@sha256:${'e'.repeat(64)}`,
      imageDigest: `sha256:${'e'.repeat(64)}`,
    });
    const { deps } = makeDeps();
    await handleCleanupReleases({ data: {} }, deps);
    const fresh = await Deployment.findById(failed._id).lean();
    assert.equal(fresh.imageRef ?? null, null);
  });

  it('removes the local copy of a trimmed prebuilt owner image', async () => {
    const project = await createProject();
    const refs = [];
    for (let seq = 1; seq <= 4; seq++) {
      const ref = `docker.io/library/nginx@sha256:${String(seq).repeat(64)}`;
      refs.push(ref);
      await createDeployment(project._id, {
        sequenceNumber: seq,
        status: DeploymentStatus.HEALTHY,
        imageTag: `img-${seq}`,
        imageRef: ref,
        imageDigest: `sha256:${String(seq).repeat(64)}`,
      });
    }
    const { deps, removedImages } = makeDeps();
    await handleCleanupReleases({ data: {} }, deps);
    assert.equal(removedImages.includes(refs[0]), true);
  });
});
