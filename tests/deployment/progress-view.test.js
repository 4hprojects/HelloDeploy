import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DeploymentStage,
  DeploymentStageStatus,
  DeploymentStatus,
  DEPLOYMENT_STAGE_ORDER,
} from '@hellodeploy/contracts';

import {
  buildDeploymentProgress,
  buildRecoveryActions,
  failedStageLabel,
  PROGRESS_STATUS,
} from '../../apps/web/src/services/deployment-progress.service.js';

const stage = (name, status, overrides = {}) => ({
  stage: name,
  status,
  startedAt: new Date('2026-09-26T10:00:00Z'),
  completedAt: status === DeploymentStageStatus.ACTIVE ? null : new Date('2026-09-26T10:01:00Z'),
  ...overrides,
});

const stepFor = (progress, name) => progress.steps.find((step) => step.stage === name);

describe('deployment progress', () => {
  it('shows every stage, including ones not reached', () => {
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.BUILDING,
      stages: [stage(DeploymentStage.PREPARING, DeploymentStageStatus.COMPLETE)],
    });

    assert.equal(progress.steps.length, DEPLOYMENT_STAGE_ORDER.length);
  });

  it('keeps the stages in the order they happen', () => {
    const progress = buildDeploymentProgress({ status: DeploymentStatus.QUEUED, stages: [] });
    assert.deepEqual(
      progress.steps.map((step) => step.stage),
      [...DEPLOYMENT_STAGE_ORDER],
    );
  });

  it('marks an unreached stage as not started', () => {
    const progress = buildDeploymentProgress({ status: DeploymentStatus.QUEUED, stages: [] });
    assert.equal(stepFor(progress, DeploymentStage.PUBLISHING).status, PROGRESS_STATUS.UPCOMING);
  });

  it('marks the running stage as active', () => {
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.BUILDING,
      stages: [stage(DeploymentStage.BUILDING, DeploymentStageStatus.ACTIVE)],
    });

    assert.equal(progress.activeStage, DeploymentStage.BUILDING);
  });

  it('uses the in-progress wording for the running stage', () => {
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.BUILDING,
      stages: [stage(DeploymentStage.BUILDING, DeploymentStageStatus.ACTIVE)],
    });

    assert.equal(stepFor(progress, DeploymentStage.BUILDING).label, 'Installing and building');
  });

  it('names the stage a failure stopped at', () => {
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.FAILED,
      stages: [stage(DeploymentStage.BUILDING, DeploymentStageStatus.FAILED)],
    });

    assert.equal(progress.failedStage, DeploymentStage.BUILDING);
  });

  it('gives the failed stage a readable label for the headline', () => {
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.FAILED,
      stages: [stage(DeploymentStage.BUILDING, DeploymentStageStatus.FAILED)],
    });

    assert.equal(failedStageLabel(progress), 'Install and build');
  });

  it('does not claim work is happening on a cancelled deployment', () => {
    // Cancelling sets the status directly and leaves the open stage ACTIVE.
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.CANCELLED,
      stages: [stage(DeploymentStage.BUILDING, DeploymentStageStatus.ACTIVE)],
    });

    assert.equal(stepFor(progress, DeploymentStage.BUILDING).status, PROGRESS_STATUS.STOPPED);
  });

  it('reports no active stage once a deployment is cancelled', () => {
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.CANCELLED,
      stages: [stage(DeploymentStage.BUILDING, DeploymentStageStatus.ACTIVE)],
    });

    assert.equal(progress.activeStage, null);
  });

  it('treats a healthy deployment as finished', () => {
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.HEALTHY,
      stages: DEPLOYMENT_STAGE_ORDER.map((name) => stage(name, DeploymentStageStatus.COMPLETE)),
    });

    assert.equal(progress.isFinished, true);
  });

  it('gives every stage a state in words, not colour alone', () => {
    const progress = buildDeploymentProgress({ status: DeploymentStatus.QUEUED, stages: [] });
    assert.ok(progress.steps.every((step) => Boolean(step.statusWord)));
  });

  it('describes a stage even before it starts', () => {
    const progress = buildDeploymentProgress({ status: DeploymentStatus.QUEUED, stages: [] });
    assert.ok(progress.steps.every((step) => Boolean(step.description)));
  });
});

describe('failure recovery actions', () => {
  const project = { slug: 'hellouniversity' };
  const deployment = { _id: 'd1', status: DeploymentStatus.FAILED };

  it('always offers at least one thing to do', () => {
    const actions = buildRecoveryActions(project, deployment, { canRetry: false });
    assert.ok(actions.length >= 1);
  });

  it('offers a retry when the deployment can be retried', () => {
    const actions = buildRecoveryActions(project, deployment, { canRetry: true });
    assert.ok(actions.some((action) => action.label === 'Try again'));
  });

  it('omits retry when the deployment cannot be retried', () => {
    const actions = buildRecoveryActions(project, deployment, { canRetry: false });
    assert.ok(!actions.some((action) => action.label === 'Try again'));
  });

  it('sends a retry as a POST so it cannot be triggered by a link', () => {
    const actions = buildRecoveryActions(project, deployment, { canRetry: true });
    assert.equal(actions.find((action) => action.label === 'Try again').method, 'POST');
  });

  it('points at the settings a missing value would be added to', () => {
    const actions = buildRecoveryActions(project, deployment, { canRetry: true });
    assert.ok(actions.some((action) => action.href === '/projects/hellouniversity/environment'));
  });
});
