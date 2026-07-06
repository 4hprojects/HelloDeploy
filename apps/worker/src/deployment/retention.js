import { Project, Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { stopAndRemoveContainer } from './container.js';
import { removeDockerImage } from './build.js';

const MAX_HEALTHY_RELEASES = 3;

// Statuses whose records may still need their image (running, about to run,
// or eligible as a rollback source).
const LIVE_STATUSES = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
  DeploymentStatus.HEALTHY,
];

const defaultDeps = { stopAndRemoveContainer, removeDockerImage };

/**
 * True when a deployment outside `excludeIds` still references `imageTag` in a
 * live status. Rollbacks copy the source deployment's imageTag, so two records
 * can share one image — removing it for one would break the other.
 *
 * @param {string} imageTag
 * @param {Array<string|import('mongoose').Types.ObjectId>} excludeIds
 */
export async function isImageTagInUse(imageTag, excludeIds) {
  const reference = await Deployment.exists({
    _id: { $nin: excludeIds },
    imageTag,
    status: { $in: LIVE_STATUSES },
  });
  return Boolean(reference);
}

/**
 * Keep at most MAX_HEALTHY_RELEASES per project.
 * For any excess HEALTHY deployments (oldest first), stop the container and
 * remove the Docker image. Updates the record to reflect cleanup.
 *
 * The project's active deployment is never cleaned, and an image is only
 * removed when no live deployment outside the cleanup set still references it.
 *
 * Non-fatal: any individual cleanup failure is logged but does not throw.
 *
 * @param {string|import('mongoose').Types.ObjectId} projectId
 */
export async function cleanupOldReleases(projectId, deps = defaultDeps) {
  const [healthy, project] = await Promise.all([
    Deployment.find({
      projectId,
      status: DeploymentStatus.HEALTHY,
    })
      .sort({ sequenceNumber: -1 })
      .lean(),
    Project.findById(projectId).select('activeDeploymentId').lean(),
  ]);

  const activeDeploymentId = project?.activeDeploymentId?.toString();
  const toClean = healthy
    .slice(MAX_HEALTHY_RELEASES)
    .filter((dep) => dep._id.toString() !== activeDeploymentId);

  if (toClean.length === 0) {
    return;
  }

  const toCleanIds = toClean.map((dep) => dep._id);
  const removedTags = new Set();

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

    // Remove the Docker image to free disk space — unless a live deployment
    // outside the cleanup set (e.g. a rollback of this release) still uses it.
    if (dep.imageTag && !removedTags.has(dep.imageTag)) {
      if (await isImageTagInUse(dep.imageTag, toCleanIds)) {
        logger.info('Retention: kept image still referenced by a live deployment', {
          deploymentId: dep._id,
          imageTag: dep.imageTag,
        });
      } else {
        try {
          await deps.removeDockerImage(dep.imageTag);
          removedTags.add(dep.imageTag);
        } catch (err) {
          logger.warn('Retention: failed to remove image', {
            deploymentId: dep._id,
            imageTag: dep.imageTag,
            error: err.message,
          });
        }
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
