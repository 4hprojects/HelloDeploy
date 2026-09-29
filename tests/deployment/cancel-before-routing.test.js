import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment, Project } from '@hellodeploy/database';
import { DeploymentStatus, DeploymentTrigger } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

// Routing sits behind NGINX_ENABLED and env is read when the pipeline loads.
// Without this the routing block never runs, and every assertion below would
// hold whether or not a cancelled release was stopped before it.
process.env.NGINX_ENABLED = 'true';

const { runReleasePipeline } = await import('../../apps/worker/src/deployment/pipeline.js');

/** Deps that carry a release all the way to the point traffic would move. */
function healthyDeps(calls) {
  return {
    startupDelayMs: 0,
    allocatePort: async () => 10001,
    ensureNetwork: async () => {},
    getProjectEnvVars: async () => ({}),
    // `.status` answers the stale-container check, `.running` the startup wait.
    inspectContainer: async () => {
      calls.inspected += 1;
      return calls.inspected === 1
        ? { status: 'missing', running: false }
        : { status: 'running', running: true, exitCode: null };
    },
    startContainer: async () => 'container-id',
    httpHealthCheck: async () => ({ healthy: true, finalStatus: 200 }),
    stopAndRemoveContainer: async (name) => calls.stopped.push(name),
    activateRoute: async (route) => calls.routed.push(route),
    removeDockerImage: () => {},
  };
}

// Matches how activate-release.job.js calls the pipeline.
const ACTIVATE_OPTS = {
  removeImageOnFailure: true,
  failOnInvalidSubdomain: true,
  persistSubdomain: true,
  markPreviousRolledBack: false,
  recordImageTagOnStart: false,
  logLabel: 'Container',
};

async function run(status) {
  const calls = { stopped: [], routed: [], inspected: 0 };
  // Not a reserved label — a reserved one skips routing entirely.
  const project = await Project.create({
    name: 'My App',
    slug: 'myapp',
    ownerId: objectId(),
    platformSubdomain: 'myapp',
  });
  const deployment = await Deployment.create({
    projectId: project._id,
    sequenceNumber: 1,
    triggerType: DeploymentTrigger.MANUAL,
    requestedBy: objectId(),
    commitSha: 'a'.repeat(40),
    configurationVersion: 1,
    status,
    imageTag: 'myapp-aaaaaaa-1',
  });

  const result = await runReleasePipeline({
    project,
    deploymentId: deployment._id,
    imageTag: deployment.imageTag,
    correlationId: 'test',
    deps: healthyDeps(calls),
    opts: ACTIVATE_OPTS,
  });

  return { result, calls, deployment };
}

describe('a release cancelled before routing does not take traffic', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('routes traffic for a release that was not cancelled', async () => {
    const { calls } = await run(DeploymentStatus.DEPLOYING);

    assert.equal(calls.routed.length, 1);
  });

  it('never routes traffic to a cancelled release', async () => {
    const { calls } = await run(DeploymentStatus.CANCELLED);

    assert.deepEqual(calls.routed, []);
  });

  it('stops the container it started', async () => {
    const { calls } = await run(DeploymentStatus.CANCELLED);

    assert.equal(calls.stopped.length, 1);
  });

  it('reports the release as not activated', async () => {
    const { result } = await run(DeploymentStatus.CANCELLED);

    assert.equal(result.ok, false);
  });

  it('leaves the deployment cancelled rather than failed', async () => {
    const { deployment } = await run(DeploymentStatus.CANCELLED);

    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.CANCELLED);
  });
});
