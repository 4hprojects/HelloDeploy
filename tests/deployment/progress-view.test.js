import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
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
  const failed = (failureCode) => ({ _id: 'd1', status: DeploymentStatus.FAILED, failureCode });

  it('always offers at least one thing to do', () => {
    const actions = buildRecoveryActions(project, failed('BUILD_FAILED'), { canRetry: false });
    assert.ok(actions.length >= 1);
  });

  it('leads with the most likely fix for the code', () => {
    const actions = buildRecoveryActions(project, failed('HEALTH_CHECK_FAILED'), {
      canRetry: true,
    });

    assert.equal(actions[0].label, 'Review your settings');
  });

  it('sends a lost GitHub connection to the repository page', () => {
    const actions = buildRecoveryActions(project, failed('REPO_ACCESS_REVOKED'), {
      canRetry: true,
    });

    assert.equal(actions[0].href, '/projects/hellouniversity/repository');
  });

  it('sends an unusable address to the address field', () => {
    const actions = buildRecoveryActions(project, failed('SUBDOMAIN_INVALID'), { canRetry: true });
    assert.equal(actions[0].href, '/projects/hellouniversity/setup/identity');
  });

  it('omits a retry the deployment cannot accept', () => {
    const actions = buildRecoveryActions(project, failed('BUILD_FAILED'), { canRetry: false });
    assert.ok(!actions.some((action) => action.label === 'Try again'));
  });

  it('offers a retry when the deployment can accept one', () => {
    const actions = buildRecoveryActions(project, failed('BUILD_FAILED'), { canRetry: true });
    assert.ok(actions.some((action) => action.label === 'Try again'));
  });

  it('sends a retry as a POST so a link cannot trigger it', () => {
    const actions = buildRecoveryActions(project, failed('BUILD_FAILED'), { canRetry: true });
    assert.equal(actions.find((action) => action.label === 'Try again').method, 'POST');
  });

  it('does not suggest settings for a failure settings cannot fix', () => {
    const actions = buildRecoveryActions(project, failed('BUILD_FAILED'), { canRetry: true });
    assert.ok(!actions.some((action) => /Review your settings/.test(action.label)));
  });

  it('still offers somewhere to go when no step fits', () => {
    // A rollback source that no longer exists has no specific fix.
    const actions = buildRecoveryActions(project, failed('ROLLBACK_SOURCE_INVALID'), {
      canRetry: false,
    });

    assert.equal(actions[0].href, '/projects/hellouniversity/deployments');
  });

  it('gives an unrecognised code the logs', () => {
    const actions = buildRecoveryActions(project, failed('SOMETHING_NEW'), { canRetry: false });
    assert.ok(actions.some((action) => /technical logs/.test(action.label)));
  });
});

/**
 * Between a finished build and a started activation there is a handoff that can
 * fail — the queue refusing the job, the project deleted meanwhile. The stage
 * blamed for that must not be the build, which succeeded.
 */
describe('a failure after the build does not blame the build', () => {
  it('reports no failed stage when the build completed', () => {
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.FAILED,
      stages: [
        stage(DeploymentStage.PREPARING, DeploymentStageStatus.COMPLETE),
        stage(DeploymentStage.BUILDING, DeploymentStageStatus.COMPLETE),
      ],
    });

    assert.equal(progress.failedStage, null);
  });

  it('still shows the build as done', () => {
    const progress = buildDeploymentProgress({
      status: DeploymentStatus.FAILED,
      stages: [
        stage(DeploymentStage.PREPARING, DeploymentStageStatus.COMPLETE),
        stage(DeploymentStage.BUILDING, DeploymentStageStatus.COMPLETE),
      ],
    });

    assert.equal(stepFor(progress, DeploymentStage.BUILDING).status, PROGRESS_STATUS.COMPLETE);
  });

  it('closes the build stage at handoff rather than leaving it open', async () => {
    const source = await readFile(
      new URL('../../apps/worker/src/jobs/build-deployment.job.js', import.meta.url),
      'utf8',
    );

    // The call must precede the DEPLOYING transition, which is where the handoff
    // happens; after it, an enqueue failure would already have closed BUILDING.
    assert.ok(
      source.indexOf('completeCurrentStage(deploymentId)') <
        source.indexOf('DeploymentStatus.DEPLOYING'),
    );
  });
});
