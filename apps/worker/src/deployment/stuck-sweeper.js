import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { canTransition } from '@hellodeploy/deployment-core';
import { logger } from '@hellodeploy/observability';

/**
 * A deployment that has not changed status for this long is abandoned. The
 * build timeout is 10 minutes and the release pipeline adds at most a couple
 * more, so two hours cannot be a job still making progress.
 */
export const STUCK_DEPLOYMENT_MAX_AGE_MS = 2 * 60 * 60 * 1000;

const NON_TERMINAL_STATUSES = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
];

/**
 * The state machine does not allow QUEUED to fail — a job that never started
 * was cancelled, not attempted — so each status resolves to the terminal state
 * it is actually permitted to reach.
 */
function terminalStatusFor(status) {
  const target =
    status === DeploymentStatus.QUEUED ? DeploymentStatus.CANCELLED : DeploymentStatus.FAILED;
  return canTransition(status, target) ? target : null;
}

/**
 * Resolve deployments left in a non-terminal status by a worker that died
 * between the database write and the queue acknowledgement. Without this they
 * stay in-flight forever, and the one-active-deployment-per-project check
 * blocks the project from ever deploying again.
 *
 * @param {{ maxAgeMs?: number, now?: () => number }} [options]
 * @returns {Promise<number>} number of deployments resolved
 */
export async function sweepStuckDeployments({
  maxAgeMs = STUCK_DEPLOYMENT_MAX_AGE_MS,
  now = Date.now,
} = {}) {
  const cutoff = new Date(now() - maxAgeMs);

  const stuck = await Deployment.find({
    status: { $in: NON_TERMINAL_STATUSES },
    updatedAt: { $lt: cutoff },
  })
    .select('_id status projectId')
    .lean();

  let resolved = 0;

  for (const deployment of stuck) {
    const target = terminalStatusFor(deployment.status);
    if (!target) {
      continue;
    }

    await Deployment.updateOne(
      { _id: deployment._id, status: deployment.status },
      {
        $set: {
          status: target,
          completedAt: new Date(now()),
          failureCode: 'DEPLOYMENT_ABANDONED',
        },
      },
    );

    resolved += 1;
    logger.warn('StuckSweeper: resolved abandoned deployment', {
      deploymentId: deployment._id.toString(),
      projectId: deployment.projectId?.toString(),
      fromStatus: deployment.status,
      toStatus: target,
    });
  }

  return resolved;
}
