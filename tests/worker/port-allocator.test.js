import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment } from '@hellodeploy/database';
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

  async function seedClaimant() {
    const project = await createProject();
    const deployment = await createDeployment(project._id, {
      status: DeploymentStatus.DEPLOYING,
    });
    return { project, deployment };
  }

  it('returns the first port in range when nothing is allocated', async () => {
    const { deployment } = await seedClaimant();
    assert.equal(await allocatePort(deployment._id), PORT_RANGE_START);
  });

  it('records the claimed port on the deployment document', async () => {
    const { deployment } = await seedClaimant();
    const port = await allocatePort(deployment._id);
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.containerPort, port);
  });

  it('skips ports held by other non-terminal deployments', async () => {
    const { project, deployment } = await seedClaimant();
    await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.HEALTHY,
      containerPort: PORT_RANGE_START,
    });
    await createDeployment(project._id, {
      sequenceNumber: 3,
      status: DeploymentStatus.DEPLOYING,
      containerPort: PORT_RANGE_START + 1,
    });
    assert.equal(await allocatePort(deployment._id), PORT_RANGE_START + 2);
  });

  it('ignores the claimant’s own previously assigned port', async () => {
    const { deployment } = await seedClaimant();
    await Deployment.updateOne(
      { _id: deployment._id },
      { $set: { containerPort: PORT_RANGE_START } },
    );
    assert.equal(await allocatePort(deployment._id), PORT_RANGE_START);
  });

  it('reuses ports from terminal (FAILED) deployments', async () => {
    const { project, deployment } = await seedClaimant();
    await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.FAILED,
      containerPort: PORT_RANGE_START,
    });
    assert.equal(await allocatePort(deployment._id), PORT_RANGE_START);
  });

  it('fills gaps left between allocated ports', async () => {
    const { project, deployment } = await seedClaimant();
    await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.HEALTHY,
      containerPort: PORT_RANGE_START,
    });
    await createDeployment(project._id, {
      sequenceNumber: 3,
      status: DeploymentStatus.HEALTHY,
      containerPort: PORT_RANGE_START + 2,
    });
    assert.equal(await allocatePort(deployment._id), PORT_RANGE_START + 1);
  });

  it('skips a DB-free port that is busy at the OS level', async () => {
    const { deployment } = await seedClaimant();
    const port = await allocatePort(deployment._id, {
      probePortFree: async (p) => p !== PORT_RANGE_START,
    });
    assert.equal(port, PORT_RANGE_START + 1);
  });

  it('throws when every port in the range is taken', async () => {
    const { project, deployment } = await seedClaimant();
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
    await Deployment.insertMany(docs);
    await assert.rejects(() => allocatePort(deployment._id), /No available ports/);
  });
});
