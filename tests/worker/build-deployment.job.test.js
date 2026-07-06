import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment, createRepository } from '../helpers/worker-fixtures.js';

const { handleBuildDeployment } =
  await import('../../apps/worker/src/jobs/build-deployment.job.js');

/** All boundaries succeed; every call is recorded for behavioral assertions. */
function makeDeps(overrides = {}) {
  const calls = { builds: [], removedImages: [], cleanedWorkspaces: [], enqueued: [] };
  const deps = {
    getInstallationToken: async () => 'ghs_test-token',
    cloneExactCommit: async () => {},
    prepareBuildContext: async () => {},
    writeDockerfile: async () => {},
    buildDockerImage: async (opts) => calls.builds.push(opts),
    removeDockerImage: async (tag) => calls.removedImages.push(tag),
    cleanupBuildWorkspace: async (dir) => calls.cleanedWorkspaces.push(dir),
    enqueueActivateRelease: async (payload, jobId) => calls.enqueued.push({ payload, jobId }),
    ...overrides,
  };
  return { deps, calls };
}

function makeJob(project, repo, deployment, extra = {}) {
  return {
    data: {
      projectId: project._id.toString(),
      deploymentId: deployment._id.toString(),
      commitSha: deployment.commitSha,
      repositoryId: repo._id.toString(),
      runtimeType: 'NODEJS',
      imageTag: `hd-${project.slug}-1`,
      correlationId: 'test',
      ...extra,
    },
  };
}

async function seed() {
  const project = await createProject();
  const repo = await createRepository(project._id);
  const deployment = await createDeployment(project._id);
  return { project, repo, deployment };
}

describe('build-deployment job', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('moves the deployment to DEPLOYING with the image tag on success', async () => {
    const { project, repo, deployment } = await seed();
    const { deps } = makeDeps();
    await handleBuildDeployment(makeJob(project, repo, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.DEPLOYING);
    assert.equal(fresh.imageTag, `hd-${project.slug}-1`);
  });

  it('enqueues activation for the built deployment', async () => {
    const { project, repo, deployment } = await seed();
    const { deps, calls } = makeDeps();
    await handleBuildDeployment(makeJob(project, repo, deployment), deps);
    assert.equal(calls.enqueued[0]?.jobId, `activate-${deployment._id}`);
  });

  it('cleans up the build workspace on success', async () => {
    const { project, repo, deployment } = await seed();
    const { deps, calls } = makeDeps();
    await handleBuildDeployment(makeJob(project, repo, deployment), deps);
    assert.equal(calls.cleanedWorkspaces.length, 1);
  });

  it('passes noCache through to the docker build', async () => {
    const { project, repo, deployment } = await seed();
    const { deps, calls } = makeDeps();
    await handleBuildDeployment(makeJob(project, repo, deployment, { noCache: true }), deps);
    assert.equal(calls.builds[0]?.noCache, true);
  });

  it('defaults noCache to false when absent from the payload', async () => {
    const { project, repo, deployment } = await seed();
    const { deps, calls } = makeDeps();
    await handleBuildDeployment(makeJob(project, repo, deployment), deps);
    assert.equal(calls.builds[0]?.noCache, false);
  });

  it('marks BUILD_FAILED and removes the partial image when the build throws', async () => {
    const { project, repo, deployment } = await seed();
    const { deps, calls } = makeDeps({
      buildDockerImage: async () => {
        throw new Error('compile error');
      },
    });
    await handleBuildDeployment(makeJob(project, repo, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.FAILED);
    assert.equal(fresh.failureCode, 'BUILD_FAILED');
    assert.deepEqual(calls.removedImages, [`hd-${project.slug}-1`]);
  });

  it('marks ACTIVATION_ENQUEUE_FAILED when activation cannot be queued', async () => {
    const { project, repo, deployment } = await seed();
    const { deps } = makeDeps({
      enqueueActivateRelease: async () => {
        throw new Error('queue not initialized');
      },
    });
    await handleBuildDeployment(makeJob(project, repo, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'ACTIVATION_ENQUEUE_FAILED');
  });

  it('removes the built image when activation cannot be queued', async () => {
    const { project, repo, deployment } = await seed();
    const { deps, calls } = makeDeps({
      enqueueActivateRelease: async () => {
        throw new Error('queue not initialized');
      },
    });
    await handleBuildDeployment(makeJob(project, repo, deployment), deps);
    assert.deepEqual(calls.removedImages, [`hd-${project.slug}-1`]);
  });

  it('sends per-deployment resource limits in the activation payload', async () => {
    const { project, repo, deployment } = await seed();
    const { deps, calls } = makeDeps();
    await handleBuildDeployment(makeJob(project, repo, deployment), deps);
    assert.deepEqual(calls.enqueued[0]?.payload.resourceLimits, {
      memoryMb: 256,
      cpuCores: 0.25,
      pidsLimit: 100,
    });
  });

  it('marks CLONE_FAILED and never builds when the clone throws', async () => {
    const { project, repo, deployment } = await seed();
    const { deps, calls } = makeDeps({
      cloneExactCommit: async () => {
        throw new Error('commit not found');
      },
    });
    await handleBuildDeployment(makeJob(project, repo, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'CLONE_FAILED');
    assert.equal(calls.builds.length, 0);
  });

  it('marks REPO_ACCESS_REVOKED when the repository is revoked', async () => {
    const { project, deployment } = await seed();
    const revokedRepo = await createRepository(project._id, {
      accessStatus: 'REVOKED',
      githubRepoId: 999,
      nodeId: 'R_revoked',
    });
    const { deps } = makeDeps();
    await handleBuildDeployment(makeJob(project, revokedRepo, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'REPO_ACCESS_REVOKED');
  });

  it('skips deployments that are no longer QUEUED', async () => {
    const { project, repo } = await seed();
    const cancelled = await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.CANCELLED,
    });
    const { deps, calls } = makeDeps();
    await handleBuildDeployment(makeJob(project, repo, cancelled), deps);
    const fresh = await Deployment.findById(cancelled._id).lean();
    assert.equal(fresh.status, DeploymentStatus.CANCELLED);
    assert.equal(calls.builds.length, 0);
  });
});
