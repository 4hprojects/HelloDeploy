import { DeploymentStatus } from '@hellodeploy/contracts';

// ─── Status state machine ──────────────────────────────────────────────────────

/**
 * Valid forward transitions for deployment status.
 * CANCELLED and FAILED are terminal from any active state.
 */
const TRANSITIONS = Object.freeze({
  [DeploymentStatus.QUEUED]: [DeploymentStatus.VALIDATING, DeploymentStatus.CANCELLED],
  [DeploymentStatus.VALIDATING]: [
    DeploymentStatus.BUILDING,
    DeploymentStatus.FAILED,
    DeploymentStatus.CANCELLED,
  ],
  [DeploymentStatus.BUILDING]: [
    DeploymentStatus.DEPLOYING,
    DeploymentStatus.FAILED,
    DeploymentStatus.CANCELLED,
  ],
  [DeploymentStatus.DEPLOYING]: [
    DeploymentStatus.HEALTHY,
    DeploymentStatus.FAILED,
    DeploymentStatus.CANCELLED,
  ],
  [DeploymentStatus.HEALTHY]: [DeploymentStatus.ROLLED_BACK],
  [DeploymentStatus.FAILED]: [],
  [DeploymentStatus.CANCELLED]: [],
  [DeploymentStatus.ROLLED_BACK]: [],
});

/**
 * Returns true if transitioning from `fromStatus` to `toStatus` is valid.
 */
export function canTransition(fromStatus, toStatus) {
  return TRANSITIONS[fromStatus]?.includes(toStatus) ?? false;
}

/**
 * Returns the list of valid next statuses from the current status.
 */
export function validNextStatuses(fromStatus) {
  return TRANSITIONS[fromStatus] ?? [];
}

/**
 * Returns true if the deployment is in a terminal state (no further transitions).
 */
export function isTerminal(status) {
  return [
    DeploymentStatus.HEALTHY,
    DeploymentStatus.FAILED,
    DeploymentStatus.CANCELLED,
    DeploymentStatus.ROLLED_BACK,
  ].includes(status);
}

/**
 * Returns true if the deployment is actively in progress (not queued, not terminal).
 */
export function isActive(status) {
  return [
    DeploymentStatus.QUEUED,
    DeploymentStatus.VALIDATING,
    DeploymentStatus.BUILDING,
    DeploymentStatus.DEPLOYING,
  ].includes(status);
}

// ─── Sequence number ───────────────────────────────────────────────────────────

/**
 * Determine the next deployment sequence number for a project.
 * Finds the max existing sequence number and increments it atomically.
 *
 * @param {import('mongoose').Model} DeploymentModel
 * @param {string|import('mongoose').Types.ObjectId} projectId
 * @returns {Promise<number>}
 */
export async function nextSequenceNumber(DeploymentModel, projectId) {
  const last = await DeploymentModel.findOne({ projectId })
    .sort({ sequenceNumber: -1 })
    .select('sequenceNumber')
    .lean();
  return (last?.sequenceNumber ?? 0) + 1;
}

// ─── Image tag ─────────────────────────────────────────────────────────────────

/**
 * Build a deterministic Docker image tag for a deployment.
 * Format: hellodeploy-{projectSlug}-{shortSha}
 *
 * @param {string} projectSlug
 * @param {string} commitSha
 * @param {number} sequenceNumber
 * @returns {string}
 */
export function buildImageTag(projectSlug, commitSha, sequenceNumber) {
  const shortSha = commitSha.slice(0, 7);
  // Docker image names must be lowercase alphanumeric + hyphens/dots
  const slug = projectSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `hellodeploy-${slug}-${shortSha}-${sequenceNumber}`;
}
