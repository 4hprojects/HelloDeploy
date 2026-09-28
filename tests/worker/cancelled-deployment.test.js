import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus, DeploymentTrigger } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { updateStatus } = await import('../../apps/worker/src/deployment/pipeline.js');

async function createDeployment(status = DeploymentStatus.BUILDING) {
  return Deployment.create({
    projectId: objectId(),
    sequenceNumber: 1,
    triggerType: DeploymentTrigger.MANUAL,
    requestedBy: objectId(),
    commitSha: 'a'.repeat(40),
    configurationVersion: 1,
    status,
  });
}

describe('a cancelled deployment stays cancelled', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('refuses the transition a finished build would attempt', async () => {
    const deployment = await createDeployment(DeploymentStatus.CANCELLED);

    const applied = await updateStatus(deployment._id, DeploymentStatus.DEPLOYING, {
      imageTag: 'demo-abc123-1',
    });

    assert.equal(applied, false);
  });

  it('leaves the status cancelled, so activation will not pick it up', async () => {
    const deployment = await createDeployment(DeploymentStatus.CANCELLED);

    await updateStatus(deployment._id, DeploymentStatus.DEPLOYING, { imageTag: 'demo-abc123-1' });

    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.CANCELLED);
  });

  it('does not write the accompanying fields either', async () => {
    const deployment = await createDeployment(DeploymentStatus.CANCELLED);

    await updateStatus(deployment._id, DeploymentStatus.DEPLOYING, { imageTag: 'demo-abc123-1' });

    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.imageTag, null);
  });

  it('refuses to mark a cancelled deployment healthy', async () => {
    const deployment = await createDeployment(DeploymentStatus.CANCELLED);

    const applied = await updateStatus(deployment._id, DeploymentStatus.HEALTHY);

    assert.equal(applied, false);
  });

  it('protects a rolled back deployment the same way', async () => {
    const deployment = await createDeployment(DeploymentStatus.ROLLED_BACK);

    assert.equal(await updateStatus(deployment._id, DeploymentStatus.HEALTHY), false);
  });

  it('protects a failed deployment from being revived', async () => {
    const deployment = await createDeployment(DeploymentStatus.FAILED);

    assert.equal(await updateStatus(deployment._id, DeploymentStatus.DEPLOYING), false);
  });

  it('still applies an ordinary transition on a live deployment', async () => {
    const deployment = await createDeployment(DeploymentStatus.BUILDING);

    const applied = await updateStatus(deployment._id, DeploymentStatus.DEPLOYING, {
      imageTag: 'demo-abc123-1',
    });

    assert.equal(applied, true);
  });

  it('records the new status on an ordinary transition', async () => {
    const deployment = await createDeployment(DeploymentStatus.BUILDING);

    await updateStatus(deployment._id, DeploymentStatus.DEPLOYING, { imageTag: 'demo-abc123-1' });

    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.DEPLOYING);
  });
});
