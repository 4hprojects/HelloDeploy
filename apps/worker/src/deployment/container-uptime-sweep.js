import { Project, Deployment } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';

import { inspectContainer } from './container.js';

export const CONTAINER_UPTIME_SWEEP_MS = 60_000;

/**
 * Record the current state of every live app container on its deployment, so
 * the web process (which has no Docker access) can show how long it has run.
 *
 * Containers are inspected one at a time to avoid a burst of docker calls on
 * small hosts. A failure on one container is logged and the sweep moves on.
 *
 * @returns {Promise<{ checked: number, failed: number }>}
 */
export async function sweepContainerUptime({ deps = {}, now = () => new Date() } = {}) {
  const inspect = deps.inspectContainer ?? inspectContainer;
  const activeDeploymentIds = await Project.distinct('activeDeploymentId', {
    activeDeploymentId: { $ne: null },
  });
  const deployments = await Deployment.find({
    _id: { $in: activeDeploymentIds },
    activeContainerId: { $ne: null },
  })
    .select('_id projectId activeContainerId')
    .lean();

  let checked = 0;
  let failed = 0;
  for (const deployment of deployments) {
    try {
      const state = await inspect(deployment.activeContainerId);
      // Matching on the container id keeps a release swap that lands mid-sweep
      // from receiving the state of the container it just replaced.
      await Deployment.updateOne(
        { _id: deployment._id, activeContainerId: deployment.activeContainerId },
        { $set: { runtime: toRuntimeState(state, now()) } },
      );
      checked += 1;
    } catch (err) {
      failed += 1;
      logger.error('ContainerUptimeSweep: could not record container state', {
        projectId: String(deployment.projectId),
        deploymentId: String(deployment._id),
        error: err.message,
      });
    }
  }
  return { checked, failed };
}

/** Map an `inspectContainer` result to the stored `Deployment.runtime` shape. */
export function toRuntimeState(state, checkedAt) {
  return {
    containerStartedAt: state.startedAt ?? null,
    isRunning: Boolean(state.running && !state.restarting),
    checkedAt,
  };
}
