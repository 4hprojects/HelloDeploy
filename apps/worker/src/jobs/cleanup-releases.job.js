import { Deployment, Project } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { stopAndRemoveContainer } from '../deployment/container.js';
import { removeDockerImage } from '../deployment/build.js';
import { isImageTagInUse } from '../deployment/retention.js';
import { cleanupAbandonedBuildWorkspaces } from '../deployment/cleanup.js';
import { env } from '../config/env.js';

const HEALTHY_KEEP = 3; // retain this many HEALTHY releases per project

const defaultDeps = { stopAndRemoveContainer, removeDockerImage, cleanupAbandonedBuildWorkspaces };

export function isActiveDeploymentProtected(deployment, activeDeploymentIds) {
  return activeDeploymentIds.has(deployment._id?.toString());
}

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
export async function handleCleanupReleases(job, deps = defaultDeps) {
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
  const removedWorkspaces = await deps.cleanupAbandonedBuildWorkspaces(
    env.BUILD_WORKSPACE_ROOT,
    olderThanMs,
  );

  for (const { excess } of healthyByProject) {
    if (!excess || excess.length === 0) {
      continue;
    }

    const oldDeployments = await Deployment.find({ _id: { $in: excess } }).lean();
    const projectIds = [...new Set(oldDeployments.map((dep) => dep.projectId?.toString()))].filter(
      Boolean,
    );
    const projects = await Project.find({ _id: { $in: projectIds } })
      .select('activeDeploymentId')
      .lean();
    const activeDeploymentIds = new Set(
      projects.map((project) => project.activeDeploymentId?.toString()).filter(Boolean),
    );

    for (const dep of oldDeployments) {
      if (isActiveDeploymentProtected(dep, activeDeploymentIds)) {
        logger.info('CleanupReleases: skipped active deployment', { deploymentId: dep._id });
        continue;
      }

      if (dep.activeContainerId) {
        try {
          await deps.stopAndRemoveContainer(dep.activeContainerId);
          removedContainers++;
        } catch (err) {
          logger.warn('CleanupReleases: failed to stop container', {
            deploymentId: dep._id,
            error: err.message,
          });
        }
      }

      if (dep.imageTag) {
        if (await isImageTagInUse(dep.imageTag, excess)) {
          logger.info('CleanupReleases: kept image still referenced by a live deployment', {
            deploymentId: dep._id,
            imageTag: dep.imageTag,
          });
        } else {
          try {
            await deps.removeDockerImage(dep.imageTag);
            removedImages++;
          } catch (err) {
            logger.warn('CleanupReleases: failed to remove image', {
              deploymentId: dep._id,
              error: err.message,
            });
          }
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

  // A FAILED rollback carries the imageTag of its (possibly still HEALTHY)
  // source deployment — never remove an image another live record points at.
  const abandonedIds = abandonedFailed.map((dep) => dep._id);
  let removedAbandonedImages = 0;
  for (const dep of abandonedFailed) {
    if (dep.imageTag && !(await isImageTagInUse(dep.imageTag, abandonedIds))) {
      try {
        await deps.removeDockerImage(dep.imageTag);
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
    removedWorkspaces,
    projectId: projectId ?? 'all',
  });
}
