import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment, Project, Quota } from '@hellodeploy/database';
import { DeploymentStatus, QuotaScope } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

// Retention deletes registry manifests only in the platform's own repository.
process.env.USER_IMAGE_REGISTRY = 'ghcr.io/example/apps';
const { cleanupOldReleases } = await import('../../apps/worker/src/deployment/retention.js');

function makeDockerStub() {
  const removedContainers = [];
  const removedImages = [];
  const removedManifests = [];
  return {
    removedContainers,
    removedImages,
    removedManifests,
    deps: {
      stopAndRemoveContainer: async (id) => removedContainers.push(id),
      removeDockerImage: async (tag) => removedImages.push(tag),
      deleteRegistryManifest: async (ref) => removedManifests.push(ref),
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

  it('keeps more releases when the owner quota raises maxRollbackReleases', async () => {
    const project = await createProject();
    await Quota.create({
      scopeType: QuotaScope.USER,
      scopeId: project.ownerId,
      maxRollbackReleases: 5,
    });
    await seedHealthyReleases(project._id, 5);
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    assert.deepEqual(stub.removedImages, []);
  });

  it('keeps fewer releases when the project quota lowers maxRollbackReleases', async () => {
    const project = await createProject();
    await Quota.create({
      scopeType: QuotaScope.PROJECT,
      scopeId: project._id,
      maxRollbackReleases: 1,
    });
    await seedHealthyReleases(project._id, 3);
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    assert.deepEqual(stub.removedImages.sort(), ['img-1', 'img-2']);
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

  it('deletes a GHCR manifest only when no retained release references its digest', async () => {
    const project = await createProject();
    const sharedDigest = `sha256:${'a'.repeat(64)}`;
    for (let seq = 1; seq <= 4; seq++) {
      await createDeployment(project._id, {
        sequenceNumber: seq,
        status: DeploymentStatus.HEALTHY,
        imageTag: `img-${seq}`,
        imageRef: `ghcr.io/example/apps:release-${seq}@${
          seq === 1 || seq === 4 ? sharedDigest : `sha256:${String(seq).repeat(64)}`
        }`,
        imageDigest: seq === 1 || seq === 4 ? sharedDigest : `sha256:${String(seq).repeat(64)}`,
      });
    }
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    assert.deepEqual(stub.removedManifests, []);
  });

  it('records a deleted manifest so later sweeps do not delete it again', async () => {
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
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    await cleanupOldReleases(project._id, stub.deps);
    assert.equal(stub.removedManifests.length, 1);
  });

  it('removes the local copy and the record identity once a manifest is deleted', async () => {
    const project = await createProject();
    const created = [];
    for (let seq = 1; seq <= 4; seq++) {
      created.push(
        await createDeployment(project._id, {
          sequenceNumber: seq,
          status: DeploymentStatus.HEALTHY,
          imageTag: `img-${seq}`,
          imageRef: `ghcr.io/example/apps:release-${seq}@sha256:${String(seq).repeat(64)}`,
          imageDigest: `sha256:${String(seq).repeat(64)}`,
        }),
      );
    }
    const stub = makeDockerStub();
    await cleanupOldReleases(project._id, stub.deps);
    const retired = await Deployment.findById(created[0]._id).lean();
    assert.deepEqual(
      [stub.removedImages.includes(created[0].imageRef), retired.imageTag ?? null],
      [true, null],
    );
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
