import { Project, Deployment, resolveProjectQuota } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { allocatePort } from '../deployment/port-allocator.js';
import {
  ensureNetwork,
  startContainer,
  inspectContainer,
  getContainerLogs,
  stopAndRemoveContainer,
  pullAndVerifyImage,
} from '../deployment/container.js';
import { httpHealthCheck } from '../deployment/health-check.js';
import { getProjectEnvVars } from '../deployment/secrets.js';
import { activateRoute, activateRoutes } from '../nginx/helper-client.js';
import { notifyDeploymentResult } from '../notification/deployment-notification.js';
import {
  runReleasePipeline,
  updateStatus,
  logEvent,
  toResourceLimits,
  STARTUP_DELAY_MS,
} from '../deployment/pipeline.js';
import { resolveRuntimeSpec } from '../deployment/build-strategy.js';

const defaultDeps = {
  allocatePort,
  ensureNetwork,
  startContainer,
  inspectContainer,
  getContainerLogs,
  stopAndRemoveContainer,
  pullAndVerifyImage,
  httpHealthCheck,
  getProjectEnvVars,
  activateRoute,
  activateRoutes,
  notifyDeploymentResult,
  startupDelayMs: STARTUP_DELAY_MS,
};

/**
 * ROLLBACK_RELEASE job handler.
 *
 * Creates a new candidate container from an existing image (sourceDeploymentId),
 * then runs the shared release pipeline (see deployment/pipeline.js) with
 * rollback-specific behavior: the shared source image is never removed on
 * failure, an unusable subdomain skips nginx instead of failing, and the
 * replaced release is marked ROLLED_BACK.
 *
 * Payload: { projectId, deploymentId, sourceDeploymentId, correlationId }
 */
export async function handleRollbackRelease(job, deps = defaultDeps) {
  const { projectId, deploymentId, sourceDeploymentId, correlationId } = job.data;

  const deployment = await Deployment.findById(deploymentId);
  if (!deployment) {
    logger.error('RollbackRelease: deployment not found', { deploymentId });
    return;
  }

  if (deployment.status !== DeploymentStatus.DEPLOYING) {
    logger.info('RollbackRelease: skipping non-DEPLOYING deployment', {
      deploymentId,
      status: deployment.status,
    });
    return;
  }

  // ── Fetch source (target) deployment ───────────────────────────────────────
  const sourceDeployment = await Deployment.findById(sourceDeploymentId).lean();
  if (
    !sourceDeployment ||
    sourceDeployment.status !== DeploymentStatus.HEALTHY ||
    (!sourceDeployment.imageRef && !sourceDeployment.imageTag)
  ) {
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'ROLLBACK_SOURCE_INVALID',
        failureSummary: 'Target deployment is not in a valid HEALTHY state for rollback.',
        completedAt: new Date(),
      },
      { deps },
    );
    return;
  }

  const project = await Project.findById(projectId);
  if (!project) {
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'PROJECT_NOT_FOUND',
        failureSummary: 'Project not found.',
        completedAt: new Date(),
      },
      { deps },
    );
    return;
  }

  const sourceSnapshot = sourceDeployment.configurationSnapshot ?? null;
  const rollbackSnapshot = deployment.configurationSnapshot ?? sourceSnapshot;
  if (
    rollbackSnapshot &&
    (project.environmentVersion ?? 1) !== (rollbackSnapshot.environmentVersion ?? 1)
  ) {
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'CONFIGURATION_CHANGED',
        failureSummary: 'Environment variables changed before rollback activation.',
        completedAt: new Date(),
      },
      { project, deps },
    );
    return;
  }
  let runtimeSpec;
  if (rollbackSnapshot) {
    runtimeSpec = resolveRuntimeSpec(rollbackSnapshot);
  }
  // Registry images run by digest. A local build runs by its unique tag: its
  // image ID is shared by identical builds, so it is never the identity used.
  const isRegistryImage = Boolean(
    sourceDeployment.imageDigest && sourceDeployment.imageRef?.includes('@sha256:'),
  );
  const sourceImage = isRegistryImage
    ? sourceDeployment.imageRef
    : (sourceDeployment.imageTag ?? sourceDeployment.imageRef);
  if (isRegistryImage) {
    try {
      await deps.pullAndVerifyImage(sourceImage);
    } catch (error) {
      await updateStatus(
        deploymentId,
        DeploymentStatus.FAILED,
        {
          failureCode: 'IMAGE_PULL_FAILED',
          failureSummary: error.message,
          completedAt: new Date(),
        },
        { project, deps },
      );
      return;
    }
  }

  await logEvent(
    deploymentId,
    'DEPLOY',
    'INFO',
    `Rolling back to deployment #${sourceDeployment.sequenceNumber} (${sourceDeployment.commitSha.slice(0, 7)}).`,
    correlationId,
  );

  // The rollback carries the source's image identity, so in-use checks by tag
  // and digest keep protecting that image while this release is live.
  await Deployment.updateOne(
    { _id: deploymentId },
    {
      $set: {
        imageTag: sourceDeployment.imageTag ?? null,
        imageRef: sourceDeployment.imageRef ?? null,
        imageDigest: sourceDeployment.imageDigest ?? null,
      },
    },
  );

  const quota = await resolveProjectQuota(project._id, project.ownerId);
  const result = await runReleasePipeline({
    project,
    deploymentId,
    imageTag: sourceImage,
    correlationId,
    deps,
    resourceLimits: toResourceLimits(quota),
    runtimeSpec,
    configurationSnapshot: rollbackSnapshot,
    opts: {
      removeImageOnFailure: false,
      failOnInvalidSubdomain: false,
      persistSubdomain: false,
      markPreviousRolledBack: true,
      logLabel: 'Rollback container',
    },
  });

  if (!result.ok) {
    return;
  }

  await logEvent(
    deploymentId,
    'DEPLOY',
    'INFO',
    `Rollback complete. Restored to deployment #${sourceDeployment.sequenceNumber}.`,
    correlationId,
  );
  logger.info('RollbackRelease: rollback complete', {
    deploymentId,
    sourceDeploymentId,
    hostPort: result.hostPort,
  });
}
