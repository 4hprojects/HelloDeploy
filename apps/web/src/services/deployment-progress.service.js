/**
 * Build the progress list a project owner reads while their website publishes.
 *
 * Reads the stages the worker recorded, rather than reconstructing progress from
 * log-event strings in the template. Pure, so the same function serves the
 * server render and the tests.
 */

import {
  DeploymentStageStatus,
  DeploymentStatus,
  DEPLOYMENT_STAGE_ORDER,
  getStageCopy,
} from '@hellodeploy/contracts';

export const PROGRESS_STATUS = Object.freeze({
  COMPLETE: 'COMPLETE',
  ACTIVE: 'ACTIVE',
  FAILED: 'FAILED',
  STOPPED: 'STOPPED',
  UPCOMING: 'UPCOMING',
});

const TERMINAL_STATUSES = new Set([
  DeploymentStatus.HEALTHY,
  DeploymentStatus.FAILED,
  DeploymentStatus.CANCELLED,
  DeploymentStatus.ROLLED_BACK,
]);

/** Words for each state, so the glyph and its colour are never the only signal. */
const STATUS_WORD = Object.freeze({
  [PROGRESS_STATUS.COMPLETE]: 'Done',
  [PROGRESS_STATUS.ACTIVE]: 'Working on it',
  [PROGRESS_STATUS.FAILED]: 'Stopped here',
  [PROGRESS_STATUS.STOPPED]: 'Did not finish',
  [PROGRESS_STATUS.UPCOMING]: 'Not started',
});

/**
 * @param {{ status: string, stages?: Array<object> }} deployment
 * @returns {{
 *   steps: Array<{
 *     stage: string,
 *     label: string,
 *     description: string,
 *     status: string,
 *     statusWord: string,
 *     startedAt: Date|null,
 *     completedAt: Date|null,
 *   }>,
 *   activeStage: string|null,
 *   failedStage: string|null,
 *   isFinished: boolean,
 * }}
 */
export function buildDeploymentProgress(deployment) {
  const recorded = new Map((deployment.stages ?? []).map((stage) => [stage.stage, stage]));
  const isTerminal = TERMINAL_STATUSES.has(deployment.status);

  const steps = DEPLOYMENT_STAGE_ORDER.map((stage) => {
    const row = recorded.get(stage);
    const copy = getStageCopy(stage);
    const status = resolveStatus(row, isTerminal);

    return {
      stage,
      label: status === PROGRESS_STATUS.ACTIVE ? copy.activeLabel : copy.label,
      description: copy.description,
      status,
      statusWord: STATUS_WORD[status],
      startedAt: row?.startedAt ?? null,
      completedAt: row?.completedAt ?? null,
    };
  });

  return {
    steps,
    activeStage: steps.find((step) => step.status === PROGRESS_STATUS.ACTIVE)?.stage ?? null,
    failedStage: steps.find((step) => step.status === PROGRESS_STATUS.FAILED)?.stage ?? null,
    isFinished: deployment.status === DeploymentStatus.HEALTHY,
  };
}

function resolveStatus(row, isTerminal) {
  if (!row) {
    // Never recorded, so nothing was attempted. Shown as not started rather
    // than skipped — the release may simply have stopped before reaching it.
    return PROGRESS_STATUS.UPCOMING;
  }

  if (row.status === DeploymentStageStatus.COMPLETE) {
    return PROGRESS_STATUS.COMPLETE;
  }

  if (row.status === DeploymentStageStatus.FAILED) {
    return PROGRESS_STATUS.FAILED;
  }

  // Cancelling sets the deployment status directly and does not close the open
  // stage, so a finished deployment can still carry an ACTIVE row. Showing it
  // as in progress would claim work is happening when nothing is running.
  return isTerminal ? PROGRESS_STATUS.STOPPED : PROGRESS_STATUS.ACTIVE;
}

/**
 * Where a failed deployment's recovery actions should send the owner.
 *
 * Every failure offers at least one thing to do, per the spec's rule that no
 * error is a dead end.
 *
 * @param {object} project
 * @param {{ status: string, _id: any }} deployment
 * @param {{ canRetry: boolean }} options
 * @returns {Array<{ label: string, href: string, method: string }>}
 */
export function buildRecoveryActions(project, deployment, { canRetry }) {
  const base = `/projects/${project.slug}`;
  const actions = [];

  if (canRetry) {
    actions.push({
      label: 'Try again',
      href: `${base}/deployments/${deployment._id}/retry`,
      method: 'POST',
    });
  }

  actions.push({ label: 'Review your settings', href: `${base}/environment`, method: 'GET' });

  return actions;
}

/**
 * Which stage a failure is attributed to, for the headline above the list.
 *
 * @param {object} progress
 * @returns {string|null}
 */
export function failedStageLabel(progress) {
  const failed = progress.steps.find((step) => step.stage === progress.failedStage);
  return failed ? getStageCopy(failed.stage).label : null;
}
