import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

process.env.NGINX_ENABLED = 'true';

import { Deployment, Project } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { handleStopProject } = await import('../../apps/worker/src/jobs/stop-project.job.js');

function makeDeps(overrides = {}) {
  const calls = { stoppedContainers: [], activatedRoutes: [] };
  const deps = {
    stopAndRemoveContainer: async (id) => calls.stoppedContainers.push(id),
    activateRoute: async (opts) => calls.activatedRoutes.push(opts),
    ...overrides,
  };
  return { deps, calls };
}

function makeJob(project) {
  return { data: { projectId: project._id.toString() } };
}

describe('stop-project job', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('stops the active container', async () => {
    const project = await createProject();
    const deployment = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'container-live',
    });
    await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: deployment._id } });
    const { deps, calls } = makeDeps();

    await handleStopProject(makeJob(project), deps);

    assert.deepEqual(calls.stoppedContainers, ['container-live']);
  });

  it('marks the previously active deployment ROLLED_BACK', async () => {
    const project = await createProject();
    const deployment = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'container-live',
    });
    await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: deployment._id } });
    const { deps } = makeDeps();

    await handleStopProject(makeJob(project), deps);

    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.ROLLED_BACK);
  });

  it('activates an nginx maintenance route for the project subdomain', async () => {
    const project = await createProject({ platformSubdomain: 'my-app' });
    const { deps, calls } = makeDeps();

    await handleStopProject(makeJob(project), deps);

    assert.equal(calls.activatedRoutes[0]?.slug, 'my-app');
  });

  it('clears the project active deployment reference', async () => {
    const project = await createProject();
    const deployment = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'container-live',
    });
    await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: deployment._id } });
    const { deps } = makeDeps();

    await handleStopProject(makeJob(project), deps);

    const freshProject = await Project.findById(project._id).lean();
    assert.equal(freshProject.activeDeploymentId, null);
  });

  it('does nothing when the project has no active deployment', async () => {
    const project = await createProject();
    const { deps, calls } = makeDeps();

    await handleStopProject(makeJob(project), deps);

    assert.deepEqual(calls.stoppedContainers, []);
  });

  it('returns without throwing when the project no longer exists', async () => {
    const { deps } = makeDeps();

    await assert.doesNotReject(() =>
      handleStopProject({ data: { projectId: '507f1f77bcf86cd799439011' } }, deps),
    );
  });
});
