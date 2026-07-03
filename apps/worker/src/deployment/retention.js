import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { stopAndRemoveContainer } from './container.js';
import { removeDockerImage } from './build.js';

const MAX_HEALTHY_RELEASES = 3;

const defaultDeps = { stopAndRemoveContainer, removeDockerImage };

/**
 * Keep at most MAX_HEALTHY_RELEASES per project.
 * For any excess HEALTHY deployments (oldest first), stop the container and
 * remove the Docker image. Updates the record to reflect cleanup.
 *
 * Non-fatal: any individual cleanup failure is logged but does not throw.
 *
 * @param {string|import('mongoose').Types.ObjectId} projectId
 */
export async function cleanupOldReleases(projectId, deps = defaultDeps) {
  const healthy = await Deployment.find({
    projectId,
    status: DeploymentStatus.HEALTHY,
  })
    .sort({ sequenceNumber: -1 })
    .lean();

  const toClean = healthy.slice(MAX_HEALTHY_RELEASES);

  if (toClean.length === 0) {
    return;
  }

  logger.info('Retention: cleaning up old releases', {
    projectId,
    keeping: MAX_HEALTHY_RELEASES,
    removing: toClean.length,
  });

  for (const dep of toClean) {
    // Stop and remove the container if still running
    if (dep.activeContainerId) {
      try {
        await deps.stopAndRemoveContainer(dep.activeContainerId);
      } catch (err) {
        logger.warn('Retention: failed to remove container', {
          deploymentId: dep._id,
          containerId: dep.activeContainerId,
          error: err.message,
        });
      }
    }

    // Remove the Docker image to free disk space
    if (dep.imageTag) {
      try {
        await deps.removeDockerImage(dep.imageTag);
      } catch (err) {
        logger.warn('Retention: failed to remove image', {
          deploymentId: dep._id,
          imageTag: dep.imageTag,
          error: err.message,
        });
      }
    }

    // Clear container references now that they are removed
    await Deployment.updateOne({ _id: dep._id }, { $set: { activeContainerId: null } }).catch(
      (err) => {
        logger.warn('Retention: failed to update deployment record', {
          deploymentId: dep._id,
          error: err.message,
        });
      },
    );
  }
}
