import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { stopAndRemoveContainer } from '../deployment/container.js';
import { removeDockerImage } from '../deployment/build.js';

const HEALTHY_KEEP = 3; // retain this many HEALTHY releases per project

/**
 * CLEANUP_RELEASES job handler.
 *
 * Cleans up:
 *   1. Old HEALTHY deployments beyond the 3-release retention limit
 *   2. Abandoned build workspaces older than BUILD_WORKSPACE_MAX_AGE_MS
 *   3. Old DeploymentEvent records (supplemental cleanup beyond TTL index)
 *
 * Payload:
 *   - projectId? — limit to a specific project, else clean all
 *   - olderThanMs? — only clean builds older than this age
 */
export async function handleCleanupReleases(job) {
  const { projectId, olderThanMs = 24 * 60 * 60 * 1000 } = job.data ?? {};

  logger.info('CleanupReleases: starting', { projectId: projectId ?? 'all', olderThanMs });

  // ── Per-project HEALTHY release trimming ────────────────────────────────────
  const projectMatch = projectId ? { projectId } : {};

  // Find all projects that have > HEALTHY_KEEP HEALTHY deployments
  const healthyByProject = await Deployment.aggregate([
    { $match: { ...projectMatch, status: DeploymentStatus.HEALTHY } },
    { $sort: { projectId: 1, sequenceNumber: -1 } },
    { $group: { _id: '$projectId', deploymentIds: { $push: '$_id' } } },
    { $project: { excess: { $slice: ['$deploymentIds', HEALTHY_KEEP, 9999] } } },
  ]);

  let removedContainers = 0;
  let removedImages = 0;

  for (const { excess } of healthyByProject) {
    if (!excess || excess.length === 0) {
      continue;
    }

    const oldDeployments = await Deployment.find({ _id: { $in: excess } }).lean();

    for (const dep of oldDeployments) {
      if (dep.activeContainerId) {
        try {
          await stopAndRemoveContainer(dep.activeContainerId);
          removedContainers++;
        } catch (err) {
          logger.warn('CleanupReleases: failed to stop container', {
            deploymentId: dep._id,
            error: err.message,
          });
        }
      }

      if (dep.imageTag) {
        try {
          await removeDockerImage(dep.imageTag);
          removedImages++;
        } catch (err) {
          logger.warn('CleanupReleases: failed to remove image', {
            deploymentId: dep._id,
            error: err.message,
          });
        }
      }

      await Deployment.updateOne({ _id: dep._id }, { $set: { activeContainerId: null } }).catch(
        () => {},
      );
    }
  }

  // ── Abandon cleanup for very old failed deployments ────────────────────────
  const cutoff = new Date(Date.now() - olderThanMs);
  const abandonedFailed = await Deployment.find({
    ...projectMatch,
    status: { $in: [DeploymentStatus.FAILED, DeploymentStatus.CANCELLED] },
    completedAt: { $lt: cutoff },
    imageTag: { $ne: null },
  }).lean();

  let removedAbandonedImages = 0;
  for (const dep of abandonedFailed) {
    if (dep.imageTag) {
      try {
        await removeDockerImage(dep.imageTag);
        removedAbandonedImages++;
      } catch {
        // Image may already be removed — non-fatal
      }
    }
    await Deployment.updateOne({ _id: dep._id }, { $unset: { imageTag: 1 } }).catch(() => {});
  }

  logger.info('CleanupReleases: complete', {
    removedContainers,
    removedImages,
    removedAbandonedImages,
    projectId: projectId ?? 'all',
  });
}
