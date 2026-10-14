import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';

import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { sweepContainerUptime } =
  await import('../../apps/worker/src/deployment/container-uptime-sweep.js');

const STARTED_AT = new Date('2026-10-12T06:30:00Z');
const CHECKED_AT = new Date('2026-10-15T09:00:00Z');

async function seedLiveProject(containerId = 'container-live') {
  const project = await createProject();
  const deployment = await createDeployment(project._id, {
    status: DeploymentStatus.HEALTHY,
    activeContainerId: containerId,
  });
  project.activeDeploymentId = deployment._id;
  await project.save();
  return deployment;
}

function sweepWith(inspectContainer) {
  return sweepContainerUptime({ deps: { inspectContainer }, now: () => CHECKED_AT });
}

const running = async () => ({ running: true, restarting: false, startedAt: STARTED_AT });

describe('container uptime sweep', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('stores when a running live container started', async () => {
    const deployment = await seedLiveProject();
    await sweepWith(running);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.deepEqual(fresh.runtime, {
      containerStartedAt: STARTED_AT,
      isRunning: true,
      checkedAt: CHECKED_AT,
    });
  });

  it('marks a restarting container as not running', async () => {
    const deployment = await seedLiveProject();
    await sweepWith(async () => ({ running: true, restarting: true, startedAt: STARTED_AT }));
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.runtime.isRunning, false);
  });

  it('leaves deployments that are not live untouched', async () => {
    const project = await createProject();
    const replaced = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'container-replaced',
    });
    await sweepWith(running);
    const fresh = await Deployment.findById(replaced._id).lean();
    assert.equal(fresh.runtime.checkedAt, null);
  });

  it('keeps recording other containers when one inspect fails', async () => {
    await seedLiveProject('container-broken');
    const healthy = await seedLiveProject('container-healthy');
    await sweepWith(async (containerId) => {
      if (containerId === 'container-broken') {
        throw new Error('docker unavailable');
      }
      return running();
    });
    const fresh = await Deployment.findById(healthy._id).lean();
    assert.deepEqual(fresh.runtime.checkedAt, CHECKED_AT);
  });
});
