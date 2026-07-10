import { Project, Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { allocatePort } from '../deployment/port-allocator.js';
import {
  ensureNetwork,
  startContainer,
  inspectContainer,
  stopAndRemoveContainer,
} from '../deployment/container.js';
import { httpHealthCheck } from '../deployment/health-check.js';
import { getProjectEnvVars } from '../deployment/secrets.js';
import { activateRoute } from '../nginx/helper-client.js';
import { notifyDeploymentResult } from '../notification/deployment-notification.js';
import {
  runReleasePipeline,
  updateStatus,
  logEvent,
  STARTUP_DELAY_MS,
} from '../deployment/pipeline.js';

const defaultDeps = {
  allocatePort,
  ensureNetwork,
  startContainer,
  inspectContainer,
  stopAndRemoveContainer,
  httpHealthCheck,
  getProjectEnvVars,
  activateRoute,
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
    !sourceDeployment.imageTag
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

  await logEvent(
    deploymentId,
    'DEPLOY',
    'INFO',
    `Rolling back to deployment #${sourceDeployment.sequenceNumber} (${sourceDeployment.commitSha.slice(0, 7)}).`,
    correlationId,
  );

  const result = await runReleasePipeline({
    project,
    deploymentId,
    imageTag: sourceDeployment.imageTag,
    correlationId,
    deps,
    opts: {
      removeImageOnFailure: false,
      failOnInvalidSubdomain: false,
      persistSubdomain: false,
      markPreviousRolledBack: true,
      recordImageTagOnStart: true,
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
