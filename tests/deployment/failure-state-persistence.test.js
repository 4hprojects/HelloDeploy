import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment } from '@hellodeploy/database';
import {
  DeploymentStage,
  DeploymentStatus,
  DeploymentTrigger,
  FailureCode,
} from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { recordStage, updateStatus } = await import('../../apps/worker/src/deployment/pipeline.js');
const { buildDeploymentProgress } =
  await import('../../apps/web/src/services/deployment-progress.service.js');

/**
 * A failure has to be readable after the page is closed and reopened, so every
 * part the view needs must be on the record rather than held in a live stream.
 */
describe('a failure survives a page refresh', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function failedDeployment() {
    const deployment = await Deployment.create({
      projectId: objectId(),
      sequenceNumber: 1,
      triggerType: DeploymentTrigger.MANUAL,
      requestedBy: objectId(),
      commitSha: 'a'.repeat(40),
      configurationVersion: 1,
      status: DeploymentStatus.QUEUED,
      startedAt: new Date(),
    });

    await recordStage(deployment._id, DeploymentStage.PREPARING);
    await recordStage(deployment._id, DeploymentStage.BUILDING);
    await updateStatus(deployment._id, DeploymentStatus.FAILED, {
      failureCode: FailureCode.BUILD_FAILED,
      failureSummary: 'npm ERR! code ELIFECYCLE',
      completedAt: new Date(),
    });

    // Read it back exactly as a fresh request would.
    return Deployment.findById(deployment._id).lean();
  }

  it('keeps the failure code', async () => {
    const reloaded = await failedDeployment();
    assert.equal(reloaded.failureCode, FailureCode.BUILD_FAILED);
  });

  it('keeps the raw summary for the technical view', async () => {
    const reloaded = await failedDeployment();
    assert.match(reloaded.failureSummary, /ELIFECYCLE/);
  });

  it('keeps when it finished', async () => {
    const reloaded = await failedDeployment();
    assert.ok(reloaded.completedAt instanceof Date);
  });

  it('still knows which stage stopped', async () => {
    const reloaded = await failedDeployment();
    assert.equal(buildDeploymentProgress(reloaded).failedStage, DeploymentStage.BUILDING);
  });

  it('still shows the stages that had completed', async () => {
    const reloaded = await failedDeployment();
    const progress = buildDeploymentProgress(reloaded);
    const preparing = progress.steps.find((step) => step.stage === DeploymentStage.PREPARING);

    assert.equal(preparing.status, 'COMPLETE');
  });

  it('does not claim a later stage was attempted', async () => {
    const reloaded = await failedDeployment();
    const progress = buildDeploymentProgress(reloaded);
    const publishing = progress.steps.find((step) => step.stage === DeploymentStage.PUBLISHING);

    assert.equal(publishing.status, 'UPCOMING');
  });
});
