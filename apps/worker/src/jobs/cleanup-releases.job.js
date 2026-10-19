import { Deployment, Project, getPlanDefaults } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { stopAndRemoveContainer } from '../deployment/container.js';
import { removeDockerImage, pruneDanglingImages } from '../deployment/build.js';
import {
  getReleaseKeepCount,
  isImageDigestInUse,
  isImageTagInUse,
} from '../deployment/retention.js';
import { deleteRegistryManifest } from '../deployment/registry.js';
import { cleanupAbandonedBuildWorkspaces } from '../deployment/cleanup.js';
import { env } from '../config/env.js';

const defaultDeps = {
  stopAndRemoveContainer,
  removeDockerImage,
  cleanupAbandonedBuildWorkspaces,
  pruneDanglingImages,
  deleteRegistryManifest,
};

export function isActiveDeploymentProtected(deployment, activeDeploymentIds) {
  return activeDeploymentIds.has(deployment._id?.toString());
}

/**
 * CLEANUP_RELEASES job handler.
 *
 * Cleans up:
 *   1. Old HEALTHY deployments beyond each project's maxRollbackReleases quota
 *   2. Abandoned build workspaces older than BUILD_WORKSPACE_MAX_AGE_MS
 *   3. Old DeploymentEvent records (supplemental cleanup beyond TTL index)
 *   4. Dangling (untagged) Docker images left by interrupted/superseded builds
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

  const healthyByProject = await Deployment.aggregate([
    { $match: { ...projectMatch, status: DeploymentStatus.HEALTHY } },
    { $sort: { projectId: 1, sequenceNumber: -1 } },
    { $group: { _id: '$projectId', deploymentIds: { $push: '$_id' } } },
  ]);

  let removedContainers = 0;
  let removedImages = 0;
  const removedWorkspaces = await deps.cleanupAbandonedBuildWorkspaces(
    env.BUILD_WORKSPACE_ROOT,
    olderThanMs,
  );

  for (const { _id: groupProjectId, deploymentIds } of healthyByProject) {
    const project = await Project.findById(groupProjectId)
      .select('activeDeploymentId ownerId')
      .lean();
    // Orphaned releases (project already gone) still get trimmed to the plan default.
    const keep = project
      ? await getReleaseKeepCount(project)
      : getPlanDefaults().maxRollbackReleases;
    const excess = deploymentIds.slice(keep);
    if (excess.length === 0) {
      continue;
    }

    const oldDeployments = await Deployment.find({ _id: { $in: excess } }).lean();
    const activeDeploymentIds = new Set([project?.activeDeploymentId?.toString()].filter(Boolean));

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

      if (
        dep.imageDigest &&
        dep.imageRef?.includes('@sha256:') &&
        !(await isImageDigestInUse(dep.imageDigest, excess))
      ) {
        try {
          const isManifestDeleted = await deps.deleteRegistryManifest(dep.imageRef);
          // The release ran from a copy pulled by digest, which is no longer needed.
          await deps.removeDockerImage(dep.imageRef);
          if (isManifestDeleted) {
            // The image is gone everywhere: clear its identity so later sweeps skip it
            // and the release is no longer offered as a rollback target.
            await Deployment.updateOne(
              { _id: dep._id },
              { $unset: { imageTag: 1, imageRef: 1, imageDigest: 1 } },
            );
          }
        } catch (err) {
          logger.warn('CleanupReleases: failed to delete registry manifest', {
            deploymentId: dep._id,
            imageDigest: dep.imageDigest,
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
    $or: [{ imageTag: { $ne: null } }, { imageRef: { $ne: null } }],
  }).lean();

  // A FAILED rollback carries the imageTag of its (possibly still HEALTHY)
  // source deployment — never remove an image another live record points at.
  const abandonedIds = abandonedFailed.map((dep) => dep._id);
  let removedAbandonedImages = 0;
  for (const dep of abandonedFailed) {
    let isRegistryDeleted = false;
    if (dep.imageTag && !(await isImageTagInUse(dep.imageTag, abandonedIds))) {
      try {
        await deps.removeDockerImage(dep.imageTag);
        removedAbandonedImages++;
      } catch {
        // Image may already be removed — non-fatal
      }
    }
    if (
      dep.imageDigest &&
      dep.imageRef?.includes('@sha256:') &&
      !(await isImageDigestInUse(dep.imageDigest, abandonedIds))
    ) {
      try {
        await deps.deleteRegistryManifest(dep.imageRef);
        isRegistryDeleted = true;
      } catch (err) {
        // Non-fatal: the next sweep retries it.
        logger.warn('CleanupReleases: failed to delete abandoned registry manifest', {
          deploymentId: dep._id,
          error: err.message,
        });
      }
    }
    const unset = { imageTag: 1 };
    // A local image ID has no registry manifest, so nothing is left to retry.
    if (isRegistryDeleted || !dep.imageRef?.includes('@sha256:')) {
      unset.imageRef = 1;
      unset.imageDigest = 1;
    }
    await Deployment.updateOne({ _id: dep._id }, { $unset: unset }).catch(() => {});
  }

  const removedDanglingImages = await deps.pruneDanglingImages();

  logger.info('CleanupReleases: complete', {
    removedContainers,
    removedImages,
    removedAbandonedImages,
    removedDanglingImages,
    removedWorkspaces,
    projectId: projectId ?? 'all',
  });
}
