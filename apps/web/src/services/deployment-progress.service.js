/**
 * Build the progress list a project owner reads while their website publishes.
 *
 * Reads the stages the worker recorded, rather than reconstructing progress from
 * log-event strings in the template. Pure, so the same function serves the
 * server render and the tests.
 */

import {
  DeploymentStageStatus,
  RecoveryAction,
  getFailureCopy,
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
 * Where each recovery step sends the owner, and what the button says.
 *
 * Contracts names the steps a failure offers; this turns them into links for a
 * particular project. Kept here rather than in contracts so routes stay in the
 * web app.
 */
const RECOVERY_TARGETS = Object.freeze({
  [RecoveryAction.RETRY]: (base, deployment) => ({
    label: 'Try again',
    href: `${base}/deployments/${deployment._id}/retry`,
    method: 'POST',
  }),
  [RecoveryAction.ENVIRONMENT]: (base) => ({
    label: 'Review your settings',
    href: `${base}/environment`,
    method: 'GET',
  }),
  [RecoveryAction.LOGS]: () => ({
    label: 'View technical logs',
    href: '#log-card',
    method: 'GET',
  }),
  [RecoveryAction.REPOSITORY]: (base) => ({
    label: 'Check your GitHub connection',
    href: `${base}/repository`,
    method: 'GET',
  }),
  [RecoveryAction.ADDRESS]: (base) => ({
    label: 'Choose another address',
    href: `${base}/setup/identity`,
    method: 'GET',
  }),
  [RecoveryAction.BUILD_SETTINGS]: (base) => ({
    label: 'Review build settings',
    href: `${base}/detection`,
    method: 'GET',
  }),
});

/**
 * What a project owner can do about a failed deployment.
 *
 * Driven by the failure code, so the first thing offered is the most likely fix
 * rather than the same generic pair every time. Never returns an empty list —
 * the spec's rule is that no error is a dead end.
 *
 * @param {object} project
 * @param {{ status: string, _id: any, failureCode?: string|null }} deployment
 * @param {{ canRetry: boolean }} options
 * @returns {Array<{ label: string, href: string, method: string }>}
 */
export function buildRecoveryActions(project, deployment, { canRetry }) {
  const base = `/projects/${project.slug}`;
  const copy = getFailureCopy(deployment.failureCode);

  const actions = (copy.actions ?? [])
    // A retry that would be refused is worse than no button at all.
    .filter((key) => key !== RecoveryAction.RETRY || canRetry)
    .map((key) => RECOVERY_TARGETS[key]?.(base, deployment))
    .filter(Boolean);

  if (actions.length > 0) {
    return actions;
  }

  // Some failures have no specific fix — a rollback source that is gone, for
  // instance. The history is still somewhere to go.
  return [{ label: 'See your published versions', href: `${base}/deployments`, method: 'GET' }];
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
