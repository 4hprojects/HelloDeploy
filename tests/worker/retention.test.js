import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment, Project } from '@hellodeploy/database';
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

  it('keeps an image still referenced by a live rollback deployment', async () => {
    const project = await createProject();
    // Oldest release; a rollback (seq 5) reuses its image tag.
    await createDeployment(project._id, {
      sequenceNumber: 1,
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-shared',
      activeContainerId: 'container-1',
    });
    for (let seq = 2; seq <= 4; seq++) {
      await createDeployment(project._id, {
        sequenceNumber: seq,
        status: DeploymentStatus.HEALTHY,
        imageTag: `img-${seq}`,
        activeContainerId: `container-${seq}`,
      });
    }
    await createDeployment(project._id, {
      sequenceNumber: 5,
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-shared',
      activeContainerId: 'container-5',
    });
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    // seq 1 and 2 are excess; img-shared survives because seq 5 still uses it
    assert.deepEqual(stub.removedImages, ['img-2']);
  });

  it("never cleans the project's active deployment even beyond the limit", async () => {
    const project = await createProject();
    const [oldest] = await seedHealthyReleases(project._id, 5);
    await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: oldest._id } });
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    assert.deepEqual(stub.removedImages, ['img-2']);
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
