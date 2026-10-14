import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

// Env is read when the pipeline loads: this file covers a worker with routing
// off and no permission to go live without a route.
process.env.NGINX_ENABLED = 'false';
delete process.env.ALLOW_UNROUTED_RELEASES;

import { Deployment, Project } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { handleActivateRelease } =
  await import('../../apps/worker/src/jobs/activate-release.job.js');

function makeDeps(calls) {
  let started = false;
  return {
    allocatePort: async () => 10001,
    ensureNetwork: async () => {},
    startContainer: async () => {
      started = true;
      return 'container-id-new';
    },
    inspectContainer: async () =>
      started
        ? { status: 'running', running: true, exitCode: 0 }
        : { status: 'missing', running: false, exitCode: -1 },
    stopAndRemoveContainer: async (name) => calls.stopped.push(name),
    httpHealthCheck: async () => ({ healthy: true, finalStatus: 200 }),
    removeDockerImage: () => Promise.resolve(),
    getProjectEnvVars: async () => ({}),
    activateRoute: async () => {},
    notifyDeploymentResult: async () => {},
    cleanupOldReleases: async () => {},
    startupDelayMs: 0,
  };
}

async function activate() {
  const project = await createProject();
  const deployment = await createDeployment(project._id, {
    status: DeploymentStatus.DEPLOYING,
    imageTag: 'img-new',
  });
  const calls = { stopped: [] };
  await handleActivateRelease(
    {
      data: {
        projectId: project._id.toString(),
        deploymentId: deployment._id.toString(),
        correlationId: 'test',
      },
    },
    makeDeps(calls),
  );
  return { project, deployment, calls };
}

describe('release on a worker without Nginx routing', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  it('fails as not connected instead of going live', async () => {
    const { deployment } = await activate();
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'ROUTE_NOT_CONNECTED');
  });

  it('stops the unreachable candidate container', async () => {
    const { calls } = await activate();
    assert.equal(calls.stopped.length, 1);
  });

  it('does not make the unrouted release the active one', async () => {
    const { project, deployment } = await activate();
    const fresh = await Project.findById(project._id).lean();
    assert.notEqual(String(fresh.activeDeploymentId), String(deployment._id));
  });
});
