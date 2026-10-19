import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment, Project, Quota } from '@hellodeploy/database';
import { DeploymentStatus, DeploymentTrigger, QuotaScope } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

// These cases cover rollback bookkeeping, not routing; env is read when the
// pipeline loads, so release without an Nginx route before importing it.
process.env.ALLOW_UNROUTED_RELEASES = 'true';

const { handleRollbackRelease } =
  await import('../../apps/worker/src/jobs/rollback-release.job.js');

function makeDeps(overrides = {}) {
  const calls = { startedContainers: [], stoppedContainers: [] };
  const deps = {
    allocatePort: async () => 10002,
    ensureNetwork: async () => {},
    startContainer: async (opts) => {
      calls.startedContainers.push(opts);
      return 'container-id-rollback';
    },
    // No container exists until startContainer runs (mirrors real docker state,
    // which the pipeline's stale-container pre-check relies on).
    inspectContainer: async () =>
      calls.startedContainers.length === 0
        ? { status: 'missing', running: false, exitCode: -1 }
        : { status: 'running', running: true, exitCode: 0 },
    stopAndRemoveContainer: async (id) => calls.stoppedContainers.push(id),
    httpHealthCheck: async () => ({ healthy: true, finalStatus: 200 }),
    getProjectEnvVars: async () => ({}),
    activateRoute: async () => {},
    notifyDeploymentResult: async () => {},
    startupDelayMs: 0,
    ...overrides,
  };
  return { deps, calls };
}

async function seed() {
  const project = await createProject();
  const sourceDeployment = await createDeployment(project._id, {
    sequenceNumber: 1,
    status: DeploymentStatus.HEALTHY,
    imageTag: 'img-v1',
    activeContainerId: null,
  });
  const rollbackDeployment = await createDeployment(project._id, {
    sequenceNumber: 2,
    triggerType: DeploymentTrigger.ROLLBACK,
    status: DeploymentStatus.DEPLOYING,
  });
  return { project, sourceDeployment, rollbackDeployment };
}

function makeJob(project, rollbackDeployment, sourceDeployment) {
  return {
    data: {
      projectId: project._id.toString(),
      deploymentId: rollbackDeployment._id.toString(),
      sourceDeploymentId: sourceDeployment._id.toString(),
      correlationId: 'test',
    },
  };
}

describe('rollback-release job', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('starts the rollback container with the current project quota memory', async () => {
    const { project, sourceDeployment, rollbackDeployment } = await seed();
    await Quota.create({ scopeType: QuotaScope.PROJECT, scopeId: project._id, memoryMb: 768 });
    const { deps, calls } = makeDeps();
    await handleRollbackRelease(makeJob(project, rollbackDeployment, sourceDeployment), deps);
    assert.equal(calls.startedContainers[0]?.memoryMb, 768);
  });

  it('marks the rollback HEALTHY on success', async () => {
    const { project, sourceDeployment, rollbackDeployment } = await seed();
    const { deps } = makeDeps();
    await handleRollbackRelease(makeJob(project, rollbackDeployment, sourceDeployment), deps);
    const fresh = await Deployment.findById(rollbackDeployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.HEALTHY);
  });

  it('reuses the source deployment image instead of building a new one', async () => {
    const { project, sourceDeployment, rollbackDeployment } = await seed();
    const { deps, calls } = makeDeps();
    await handleRollbackRelease(makeJob(project, rollbackDeployment, sourceDeployment), deps);
    assert.equal(calls.startedContainers[0]?.imageTag, 'img-v1');
    const fresh = await Deployment.findById(rollbackDeployment._id).lean();
    assert.equal(fresh.imageTag, 'img-v1');
  });

  it('rolls a Python release back on its own port without rebuilding it', async () => {
    const project = await createProject({ runtimeType: 'PYTHON' });
    const sourceDeployment = await createDeployment(project._id, {
      sequenceNumber: 1,
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-python-v1',
      configurationSnapshot: {
        schemaVersion: 1,
        buildStrategy: 'python_flask_v1',
        runtimeType: 'PYTHON',
        buildConfiguration: {
          applicationRoot: '.',
          applicationPort: 8000,
          healthCheckPath: '/',
          applicationModule: 'app:app',
        },
        projectConfigurationVersion: 1,
        environmentVersion: 1,
        sourceCommit: 'a'.repeat(40),
      },
    });
    const rollbackDeployment = await createDeployment(project._id, {
      sequenceNumber: 2,
      triggerType: DeploymentTrigger.ROLLBACK,
      status: DeploymentStatus.DEPLOYING,
    });
    const { deps, calls } = makeDeps();
    await handleRollbackRelease(makeJob(project, rollbackDeployment, sourceDeployment), deps);
    assert.equal(calls.startedContainers[0]?.appPort, 8000);
  });

  it('marks the previously active deployment ROLLED_BACK and stops its container', async () => {
    const { project, sourceDeployment, rollbackDeployment } = await seed();
    const previousActive = await createDeployment(project._id, {
      sequenceNumber: 3,
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-v2',
      activeContainerId: 'container-id-current',
    });
    await Project.updateOne(
      { _id: project._id },
      { $set: { activeDeploymentId: previousActive._id } },
    );
    const { deps, calls } = makeDeps();
    await handleRollbackRelease(makeJob(project, rollbackDeployment, sourceDeployment), deps);
    const freshPrevious = await Deployment.findById(previousActive._id).lean();
    assert.equal(freshPrevious.status, DeploymentStatus.ROLLED_BACK);
    assert.deepEqual(calls.stoppedContainers, ['container-id-current']);
  });

  it('points the project at the rollback deployment on success', async () => {
    const { project, sourceDeployment, rollbackDeployment } = await seed();
    const { deps } = makeDeps();
    await handleRollbackRelease(makeJob(project, rollbackDeployment, sourceDeployment), deps);
    const freshProject = await Project.findById(project._id).lean();
    assert.equal(freshProject.activeDeploymentId.toString(), rollbackDeployment._id.toString());
  });

  it('fails with ROLLBACK_SOURCE_INVALID when the source is not HEALTHY', async () => {
    const { project, rollbackDeployment } = await seed();
    const badSource = await createDeployment(project._id, {
      sequenceNumber: 4,
      status: DeploymentStatus.FAILED,
      imageTag: 'img-bad',
    });
    const { deps, calls } = makeDeps();
    await handleRollbackRelease(makeJob(project, rollbackDeployment, badSource), deps);
    const fresh = await Deployment.findById(rollbackDeployment._id).lean();
    assert.equal(fresh.failureCode, 'ROLLBACK_SOURCE_INVALID');
    assert.equal(calls.startedContainers.length, 0);
  });

  it('preserves the source deployment when the rollback health check fails', async () => {
    const { project, sourceDeployment, rollbackDeployment } = await seed();
    const { deps } = makeDeps({
      httpHealthCheck: async () => ({ healthy: false, error: 'refused' }),
    });
    await handleRollbackRelease(makeJob(project, rollbackDeployment, sourceDeployment), deps);
    const freshRollback = await Deployment.findById(rollbackDeployment._id).lean();
    const freshSource = await Deployment.findById(sourceDeployment._id).lean();
    assert.equal(freshRollback.failureCode, 'HEALTH_CHECK_FAILED');
    assert.equal(freshSource.status, DeploymentStatus.HEALTHY);
    assert.equal(freshSource.imageTag, 'img-v1');
  });

  it('stops the crashed candidate container when it exits on startup', async () => {
    const { project, sourceDeployment, rollbackDeployment } = await seed();
    let started = false;
    const { deps, calls } = makeDeps({
      startContainer: async () => {
        started = true;
        return 'container-id-rollback';
      },
      inspectContainer: async () =>
        started
          ? { status: 'exited', running: false, exitCode: 1 }
          : { status: 'missing', running: false, exitCode: -1 },
    });
    await handleRollbackRelease(makeJob(project, rollbackDeployment, sourceDeployment), deps);
    const fresh = await Deployment.findById(rollbackDeployment._id).lean();
    assert.equal(fresh.failureCode, 'CONTAINER_CRASHED_ON_STARTUP');
    assert.equal(calls.stoppedContainers.length, 1);
  });

  it('skips rollback records that are not in DEPLOYING state', async () => {
    const { project, sourceDeployment } = await seed();
    const finished = await createDeployment(project._id, {
      sequenceNumber: 5,
      status: DeploymentStatus.HEALTHY,
    });
    const { deps, calls } = makeDeps();
    await handleRollbackRelease(makeJob(project, finished, sourceDeployment), deps);
    assert.equal(calls.startedContainers.length, 0);
  });

  // Local builds record their image ID as imageRef; it is shared by identical
  // builds, so the rollback must run and record the source's unique tag.
  it('runs a local rollback from the source tag and records its image identity', async () => {
    const project = await createProject();
    const imageId = `sha256:${'c'.repeat(64)}`;
    const sourceDeployment = await createDeployment(project._id, {
      sequenceNumber: 1,
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-local-1',
      imageRef: imageId,
      imageDigest: imageId,
    });
    const rollbackDeployment = await createDeployment(project._id, {
      sequenceNumber: 2,
      triggerType: DeploymentTrigger.ROLLBACK,
      status: DeploymentStatus.DEPLOYING,
    });
    const { deps, calls } = makeDeps();
    await handleRollbackRelease(makeJob(project, rollbackDeployment, sourceDeployment), deps);
    const fresh = await Deployment.findById(rollbackDeployment._id).lean();
    assert.deepEqual(
      [calls.startedContainers[0]?.imageTag, fresh.imageTag, fresh.imageDigest],
      ['img-local-1', 'img-local-1', imageId],
    );
  });
});
