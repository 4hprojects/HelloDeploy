import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

// Enable the nginx path so route activation/failure behavior is exercised.
process.env.NGINX_ENABLED = 'true';

import { Deployment, Project } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { handleActivateRelease } =
  await import('../../apps/worker/src/jobs/activate-release.job.js');

/** All boundaries succeed; every call is recorded for behavioral assertions. */
function makeDeps(overrides = {}) {
  const calls = {
    startedContainers: [],
    stoppedContainers: [],
    removedImages: [],
    activatedRoutes: [],
    retentionRuns: [],
  };
  const deps = {
    allocatePort: async () => 10001,
    ensureNetwork: async () => {},
    startContainer: async (opts) => {
      calls.startedContainers.push(opts);
      return 'container-id-new';
    },
    inspectContainer: async () => ({ status: 'running', running: true, exitCode: 0 }),
    stopAndRemoveContainer: async (id) => calls.stoppedContainers.push(id),
    httpHealthCheck: async () => ({ healthy: true, finalStatus: 200 }),
    removeDockerImage: (tag) => {
      calls.removedImages.push(tag);
      return Promise.resolve();
    },
    getProjectEnvVars: async () => ({ APP_SECRET: 'shhh' }),
    activateRoute: async (opts) => calls.activatedRoutes.push(opts),
    notifyDeploymentResult: async () => {},
    cleanupOldReleases: async (projectId) => calls.retentionRuns.push(projectId),
    startupDelayMs: 0,
    ...overrides,
  };
  return { deps, calls };
}

function makeJob(project, deployment) {
  return {
    data: {
      projectId: project._id.toString(),
      deploymentId: deployment._id.toString(),
      correlationId: 'test',
    },
  };
}

async function seed(projectOverrides = {}) {
  const project = await createProject(projectOverrides);
  const deployment = await createDeployment(project._id, {
    status: DeploymentStatus.DEPLOYING,
    imageTag: 'img-new',
  });
  return { project, deployment };
}

describe('activate-release job', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('marks the deployment HEALTHY with its container on success', async () => {
    const { project, deployment } = await seed();
    const { deps } = makeDeps();
    await handleActivateRelease(makeJob(project, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.HEALTHY);
    assert.equal(fresh.activeContainerId, 'container-id-new');
  });

  it('points the project at the new deployment on success', async () => {
    const { project, deployment } = await seed();
    const { deps } = makeDeps();
    await handleActivateRelease(makeJob(project, deployment), deps);
    const freshProject = await Project.findById(project._id).lean();
    assert.equal(freshProject.activeDeploymentId.toString(), deployment._id.toString());
  });

  it('activates an nginx route for the project subdomain', async () => {
    const { project, deployment } = await seed();
    const { deps, calls } = makeDeps();
    await handleActivateRelease(makeJob(project, deployment), deps);
    assert.equal(calls.activatedRoutes[0]?.slug, project.slug);
  });

  it('stops the previous active container after a successful swap', async () => {
    const project = await createProject();
    const oldDeployment = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-old',
      activeContainerId: 'container-id-old',
    });
    await Project.updateOne(
      { _id: project._id },
      { $set: { activeDeploymentId: oldDeployment._id } },
    );
    const freshProject = await Project.findById(project._id);
    const deployment = await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.DEPLOYING,
      imageTag: 'img-new',
    });
    const { deps, calls } = makeDeps();
    await handleActivateRelease(makeJob(freshProject, deployment), deps);
    assert.deepEqual(calls.stoppedContainers, ['container-id-old']);
  });

  it('runs retention cleanup after a successful activation', async () => {
    const { project, deployment } = await seed();
    const { deps, calls } = makeDeps();
    await handleActivateRelease(makeJob(project, deployment), deps);
    assert.equal(calls.retentionRuns.length, 1);
  });

  it('passes the decrypted secrets and static port rules to the container', async () => {
    const { project, deployment } = await seed({ runtimeType: 'REACT' });
    const { deps, calls } = makeDeps();
    await handleActivateRelease(makeJob(project, deployment), deps);
    assert.equal(calls.startedContainers[0]?.appPort, 8080);
    assert.deepEqual(calls.startedContainers[0]?.envVars, { APP_SECRET: 'shhh' });
  });

  it('fails with PORT_ALLOCATION_FAILED when no port is available', async () => {
    const { project, deployment } = await seed();
    const { deps } = makeDeps({
      allocatePort: async () => {
        throw new Error('No available ports in allocation range.');
      },
    });
    await handleActivateRelease(makeJob(project, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'PORT_ALLOCATION_FAILED');
  });

  it('fails with CONTAINER_CRASHED_ON_STARTUP and stops the candidate when it exits', async () => {
    const { project, deployment } = await seed();
    const { deps, calls } = makeDeps({
      inspectContainer: async () => ({ status: 'exited', running: false, exitCode: 137 }),
    });
    await handleActivateRelease(makeJob(project, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'CONTAINER_CRASHED_ON_STARTUP');
    assert.equal(calls.stoppedContainers.length, 1);
  });

  it('removes the freshly built image when activation fails', async () => {
    const { project, deployment } = await seed();
    const { deps, calls } = makeDeps({
      httpHealthCheck: async () => ({ healthy: false, error: 'connection refused' }),
    });
    await handleActivateRelease(makeJob(project, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'HEALTH_CHECK_FAILED');
    assert.deepEqual(calls.removedImages, ['img-new']);
  });

  it('fails with NGINX_ROUTE_FAILED and stops the candidate when routing fails', async () => {
    const { project, deployment } = await seed();
    const { deps, calls } = makeDeps({
      activateRoute: async () => {
        throw new Error('nginx -t failed');
      },
    });
    await handleActivateRelease(makeJob(project, deployment), deps);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'NGINX_ROUTE_FAILED');
    assert.equal(calls.stoppedContainers.length, 1);
  });

  it('leaves the existing HEALTHY deployment untouched when the candidate fails', async () => {
    const project = await createProject();
    const oldDeployment = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-old',
      activeContainerId: 'container-id-old',
    });
    await Project.updateOne(
      { _id: project._id },
      { $set: { activeDeploymentId: oldDeployment._id } },
    );
    const deployment = await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.DEPLOYING,
      imageTag: 'img-new',
    });
    const { deps, calls } = makeDeps({
      httpHealthCheck: async () => ({ healthy: false, error: 'timeout' }),
    });
    await handleActivateRelease(makeJob(project, deployment), deps);
    const oldFresh = await Deployment.findById(oldDeployment._id).lean();
    assert.equal(oldFresh.status, DeploymentStatus.HEALTHY);
    assert.ok(!calls.stoppedContainers.includes('container-id-old'));
  });

  it('skips deployments that are not in DEPLOYING state', async () => {
    const project = await createProject();
    const deployment = await createDeployment(project._id, {
      status: DeploymentStatus.FAILED,
      imageTag: 'img-new',
    });
    const { deps, calls } = makeDeps();
    await handleActivateRelease(makeJob(project, deployment), deps);
    assert.equal(calls.startedContainers.length, 0);
  });
});
