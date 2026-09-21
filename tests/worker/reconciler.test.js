import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment, Project } from '@hellodeploy/database';
import { DeploymentStatus, ContainerStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { reconcileActiveContainers, toContainerStatus } =
  await import('../../apps/worker/src/deployment/reconciler.js');

async function seedActiveRelease() {
  const project = await createProject();
  const deployment = await createDeployment(project._id, {
    status: DeploymentStatus.HEALTHY,
    activeContainerId: 'container-abc',
  });
  await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: deployment._id } });
  return { project, deployment };
}

function inspectorReturning(state) {
  return { inspectContainer: async () => state };
}

describe('toContainerStatus', () => {
  it('maps a container Docker cannot find to REMOVED', () => {
    assert.equal(
      toContainerStatus({ status: 'missing', running: false, exitCode: -1 }),
      ContainerStatus.REMOVED,
    );
  });

  it('maps a live container to RUNNING', () => {
    assert.equal(
      toContainerStatus({ status: 'running', running: true, exitCode: 0 }),
      ContainerStatus.RUNNING,
    );
  });

  it('distinguishes a clean exit from a crash', () => {
    assert.equal(
      toContainerStatus({ status: 'exited', running: false, exitCode: 0 }),
      ContainerStatus.STOPPED,
    );
  });

  it('maps a nonzero exit to CRASHED', () => {
    assert.equal(
      toContainerStatus({ status: 'exited', running: false, exitCode: 137 }),
      ContainerStatus.CRASHED,
    );
  });
});

describe('reconcileActiveContainers', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('records a healthy release whose container vanished after a reboot', async () => {
    const { deployment } = await seedActiveRelease();
    await reconcileActiveContainers(
      inspectorReturning({ status: 'missing', running: false, exitCode: -1 }),
    );
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.containerStatus, ContainerStatus.REMOVED);
  });

  it('reports drift when the active release is not running', async () => {
    await seedActiveRelease();
    const result = await reconcileActiveContainers(
      inspectorReturning({ status: 'exited', running: false, exitCode: 1 }),
    );
    assert.equal(result.drifted, 1);
  });

  it('reports no drift when the active release is running', async () => {
    await seedActiveRelease();
    const result = await reconcileActiveContainers(
      inspectorReturning({ status: 'running', running: true, exitCode: 0 }),
    );
    assert.equal(result.drifted, 0);
  });

  it('ignores a project whose active deployment is no longer healthy', async () => {
    const project = await createProject();
    const deployment = await createDeployment(project._id, {
      status: DeploymentStatus.ROLLED_BACK,
      activeContainerId: 'container-old',
    });
    await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: deployment._id } });
    const result = await reconcileActiveContainers(
      inspectorReturning({ status: 'missing', running: false, exitCode: -1 }),
    );
    assert.equal(result.checked, 0);
  });

  it('ignores a project with no active release', async () => {
    await createProject();
    const result = await reconcileActiveContainers(
      inspectorReturning({ status: 'missing', running: false, exitCode: -1 }),
    );
    assert.equal(result.checked, 0);
  });
});
