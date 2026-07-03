import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { allocatePort } = await import('../../apps/worker/src/deployment/port-allocator.js');

const PORT_RANGE_START = 10000;

describe('port allocator', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('returns the first port in range when nothing is allocated', async () => {
    assert.equal(await allocatePort(), PORT_RANGE_START);
  });

  it('skips ports held by non-terminal deployments', async () => {
    const project = await createProject();
    await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      containerPort: PORT_RANGE_START,
    });
    await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.DEPLOYING,
      containerPort: PORT_RANGE_START + 1,
    });
    assert.equal(await allocatePort(), PORT_RANGE_START + 2);
  });

  it('reuses ports from terminal (FAILED) deployments', async () => {
    const project = await createProject();
    await createDeployment(project._id, {
      status: DeploymentStatus.FAILED,
      containerPort: PORT_RANGE_START,
    });
    assert.equal(await allocatePort(), PORT_RANGE_START);
  });

  it('fills gaps left between allocated ports', async () => {
    const project = await createProject();
    await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      containerPort: PORT_RANGE_START,
    });
    await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.HEALTHY,
      containerPort: PORT_RANGE_START + 2,
    });
    assert.equal(await allocatePort(), PORT_RANGE_START + 1);
  });

  it('throws when every port in the range is taken', async () => {
    const project = await createProject();
    const docs = [];
    for (let port = 10000; port <= 19999; port++) {
      docs.push({
        projectId: project._id,
        sequenceNumber: port,
        triggerType: 'MANUAL',
        requestedBy: project.ownerId,
        commitSha: 'a'.repeat(40),
        configurationVersion: 1,
        status: DeploymentStatus.HEALTHY,
        containerPort: port,
      });
    }
    const { Deployment } = await import('@hellodeploy/database');
    await Deployment.insertMany(docs);
    await assert.rejects(allocatePort, /No available ports/);
  });
});
