import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { cleanupOldReleases } = await import('../../apps/worker/src/deployment/retention.js');

function makeDockerStub() {
  const removedContainers = [];
  const removedImages = [];
  return {
    removedContainers,
    removedImages,
    deps: {
      stopAndRemoveContainer: async (id) => removedContainers.push(id),
      removeDockerImage: async (tag) => removedImages.push(tag),
    },
  };
}

async function seedHealthyReleases(projectId, count) {
  const deployments = [];
  for (let seq = 1; seq <= count; seq++) {
    deployments.push(
      await createDeployment(projectId, {
        sequenceNumber: seq,
        status: DeploymentStatus.HEALTHY,
        imageTag: `img-${seq}`,
        activeContainerId: `container-${seq}`,
      }),
    );
  }
  return deployments;
}

describe('retention — cleanupOldReleases', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('does nothing when at or below the retention limit', async () => {
    const project = await createProject();
    await seedHealthyReleases(project._id, 3);
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    assert.equal(stub.removedImages.length, 0);
  });

  it('removes only the oldest releases beyond the newest three', async () => {
    const project = await createProject();
    await seedHealthyReleases(project._id, 5);
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    assert.deepEqual(stub.removedImages.sort(), ['img-1', 'img-2']);
  });

  it('stops the containers of cleaned-up releases', async () => {
    const project = await createProject();
    await seedHealthyReleases(project._id, 4);
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    assert.deepEqual(stub.removedContainers, ['container-1']);
  });

  it('clears activeContainerId on cleaned-up records', async () => {
    const project = await createProject();
    const [oldest] = await seedHealthyReleases(project._id, 4);
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    const fresh = await Deployment.findById(oldest._id).lean();
    assert.equal(fresh.activeContainerId, null);
  });

  it('keeps cleaning remaining releases when one container removal throws', async () => {
    const project = await createProject();
    await seedHealthyReleases(project._id, 5);
    const removedImages = [];
    await cleanupOldReleases(project._id, {
      stopAndRemoveContainer: async () => {
        throw new Error('docker down');
      },
      removeDockerImage: async (tag) => removedImages.push(tag),
    });
    assert.deepEqual(removedImages.sort(), ['img-1', 'img-2']);
  });

  it('does not touch non-HEALTHY deployments regardless of count', async () => {
    const project = await createProject();
    for (let seq = 1; seq <= 6; seq++) {
      await createDeployment(project._id, {
        sequenceNumber: seq,
        status: DeploymentStatus.FAILED,
        imageTag: `failed-img-${seq}`,
      });
    }
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    assert.equal(stub.removedImages.length, 0);
  });
});
