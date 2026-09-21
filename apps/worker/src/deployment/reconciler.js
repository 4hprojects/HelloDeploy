import { Deployment, Project } from '@hellodeploy/database';
import { DeploymentStatus, ContainerStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { inspectContainer } from './container.js';

const defaultDeps = { inspectContainer };

/**
 * Map Docker's reported state onto the platform's container vocabulary.
 *
 * inspectContainer reports 'missing' for a container Docker cannot find at
 * all, which is distinct from one that exists but is not running.
 */
export function toContainerStatus(state) {
  if (state.status === 'missing') {
    return ContainerStatus.REMOVED;
  }
  if (state.running) {
    return ContainerStatus.RUNNING;
  }
  return state.exitCode === 0 ? ContainerStatus.STOPPED : ContainerStatus.CRASHED;
}

/**
 * Compare what the database believes about each project's active release
 * against what Docker actually reports.
 *
 * Containers run under `--restart on-failure:3`. Docker only restarts
 * `always` and `unless-stopped` containers when the daemon comes back, so a
 * host reboot leaves these containers down while the deployment still reads
 * HEALTHY in the dashboard. The same applies once a crash loop exhausts its
 * three attempts.
 *
 * This records the observed state rather than restarting anything: bringing a
 * container back is a release action and belongs in the pipeline, not in a
 * background sweep that no operator asked for.
 *
 * @param {{ inspectContainer?: Function }} [deps]
 * @returns {Promise<{ checked: number, drifted: number }>}
 */
export async function reconcileActiveContainers(deps = defaultDeps) {
  const inspect = deps.inspectContainer ?? inspectContainer;

  const projects = await Project.find({ activeDeploymentId: { $ne: null } })
    .select('activeDeploymentId')
    .lean();

  let checked = 0;
  let drifted = 0;

  for (const project of projects) {
    const deployment = await Deployment.findById(project.activeDeploymentId)
      .select('_id status activeContainerId projectId')
      .lean();

    if (!deployment || deployment.status !== DeploymentStatus.HEALTHY) {
      continue;
    }
    if (!deployment.activeContainerId) {
      continue;
    }

    const state = await inspect(deployment.activeContainerId);
    const containerStatus = toContainerStatus(state);
    checked += 1;

    await Deployment.updateOne(
      { _id: deployment._id },
      { $set: { containerStatus, containerCheckedAt: new Date() } },
    );

    if (containerStatus !== ContainerStatus.RUNNING) {
      drifted += 1;
      logger.warn('Reconciler: active release is not running', {
        deploymentId: deployment._id.toString(),
        projectId: deployment.projectId?.toString(),
        containerStatus,
      });
    }
  }

  return { checked, drifted };
}
