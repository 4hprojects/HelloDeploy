import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment } from '@hellodeploy/database';
import {
  DeploymentStage,
  DeploymentStageStatus,
  DeploymentStatus,
  DeploymentTrigger,
} from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { completeCurrentStage, recordStage, updateStatus } =
  await import('../../apps/worker/src/deployment/pipeline.js');

async function createDeployment() {
  return Deployment.create({
    projectId: objectId(),
    sequenceNumber: 1,
    triggerType: DeploymentTrigger.MANUAL,
    requestedBy: objectId(),
    commitSha: 'a'.repeat(40),
    configurationVersion: 1,
    status: DeploymentStatus.QUEUED,
  });
}

async function stagesOf(deploymentId) {
  const fresh = await Deployment.findById(deploymentId).lean();
  return fresh.stages;
}

describe('deployment stage recording', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('starts a deployment with no stages', async () => {
    const deployment = await createDeployment();
    assert.deepEqual(await stagesOf(deployment._id), []);
  });

  it('marks a newly recorded stage active', async () => {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.PREPARING);

    const [stage] = await stagesOf(deployment._id);
    assert.equal(stage.status, DeploymentStageStatus.ACTIVE);
  });

  it('completes the previous stage when the next one starts', async () => {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.PREPARING);
    await recordStage(deployment._id, DeploymentStage.BUILDING);

    const stages = await stagesOf(deployment._id);
    assert.equal(stages[0].status, DeploymentStageStatus.COMPLETE);
  });

  it('records stages in the order they were entered', async () => {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.PREPARING);
    await recordStage(deployment._id, DeploymentStage.BUILDING);
    await recordStage(deployment._id, DeploymentStage.CONFIGURING);

    const stages = await stagesOf(deployment._id);
    assert.deepEqual(
      stages.map((s) => s.stage),
      [DeploymentStage.PREPARING, DeploymentStage.BUILDING, DeploymentStage.CONFIGURING],
    );
  });

  it('stamps a completion time on a finished stage', async () => {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.PREPARING);
    await recordStage(deployment._id, DeploymentStage.BUILDING);

    const stages = await stagesOf(deployment._id);
    assert.ok(stages[0].completedAt instanceof Date);
  });

  it('leaves an in-progress stage without a completion time', async () => {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.PREPARING);

    const [stage] = await stagesOf(deployment._id);
    assert.equal(stage.completedAt, null);
  });

  it('keeps one row per stage when a release re-enters it', async () => {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.PREPARING);
    await recordStage(deployment._id, DeploymentStage.BUILDING);
    await recordStage(deployment._id, DeploymentStage.PREPARING);

    const stages = await stagesOf(deployment._id);
    assert.equal(stages.filter((s) => s.stage === DeploymentStage.PREPARING).length, 1);
  });

  it('fails the open stage when the deployment fails', async () => {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.BUILDING);
    await updateStatus(deployment._id, DeploymentStatus.FAILED, { failureCode: 'BUILD_FAILED' });

    const stages = await stagesOf(deployment._id);
    assert.equal(stages.at(-1).status, DeploymentStageStatus.FAILED);
  });

  it('leaves stages after a failure absent rather than skipped', async () => {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.BUILDING);
    await updateStatus(deployment._id, DeploymentStatus.FAILED, { failureCode: 'BUILD_FAILED' });

    const recorded = (await stagesOf(deployment._id)).map((s) => s.stage);
    assert.ok(!recorded.includes(DeploymentStage.PUBLISHING));
  });

  it('completes the final stage when the deployment turns healthy', async () => {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.PUBLISHING);
    await updateStatus(deployment._id, DeploymentStatus.HEALTHY);

    const stages = await stagesOf(deployment._id);
    assert.equal(stages.at(-1).status, DeploymentStageStatus.COMPLETE);
  });
});

describe('the handoff between building and activating', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  /** The build job's sequence: stages recorded, then the stage closed at handoff. */
  async function builtAndHandedOff() {
    const deployment = await createDeployment();
    await recordStage(deployment._id, DeploymentStage.PREPARING);
    await recordStage(deployment._id, DeploymentStage.BUILDING);
    await completeCurrentStage(deployment._id);
    return deployment;
  }

  it('closes the build stage once the image exists', async () => {
    const deployment = await builtAndHandedOff();
    const stages = await stagesOf(deployment._id);

    assert.equal(stages.at(-1).status, DeploymentStageStatus.COMPLETE);
  });

  it('does not blame the build when the handoff itself fails', async () => {
    const deployment = await builtAndHandedOff();
    // An enqueue failure after a successful build.
    await updateStatus(deployment._id, DeploymentStatus.FAILED, {
      failureCode: 'ACTIVATION_ENQUEUE_FAILED',
    });

    const stages = await stagesOf(deployment._id);
    const building = stages.find((s) => s.stage === DeploymentStage.BUILDING);
    assert.equal(building.status, DeploymentStageStatus.COMPLETE);
  });

  it('leaves no stage open to be wrongly marked failed', async () => {
    const deployment = await builtAndHandedOff();
    await updateStatus(deployment._id, DeploymentStatus.FAILED, {
      failureCode: 'ACTIVATION_ENQUEUE_FAILED',
    });

    const stages = await stagesOf(deployment._id);
    assert.equal(stages.filter((s) => s.status === DeploymentStageStatus.FAILED).length, 0);
  });
});
