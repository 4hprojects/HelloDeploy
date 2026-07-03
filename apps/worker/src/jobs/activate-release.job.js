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
import { removeDockerImage } from '../deployment/build.js';
import { getProjectEnvVars } from '../deployment/secrets.js';
import { activateRoute } from '../nginx/route-manager.js';
import { cleanupOldReleases } from '../deployment/retention.js';
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
  removeDockerImage,
  getProjectEnvVars,
  activateRoute,
  notifyDeploymentResult,
  cleanupOldReleases,
  startupDelayMs: STARTUP_DELAY_MS,
};

/**
 * ACTIVATE_RELEASE job handler.
 *
 * Prerequisites: BUILD_DEPLOYMENT succeeded and status is DEPLOYING.
 * Runs the shared release pipeline (see deployment/pipeline.js) with
 * activate-specific behavior: failed releases lose their freshly built
 * image, an unusable subdomain fails the deploy, and the project's
 * platformSubdomain is persisted on first deployment.
 */
export async function handleActivateRelease(job, deps = defaultDeps) {
  const { projectId, deploymentId, correlationId } = job.data;

  const deployment = await Deployment.findById(deploymentId);
  if (!deployment) {
    logger.error('ActivateRelease: deployment not found', { deploymentId });
    return;
  }

  // Guard: skip if not in DEPLOYING state (e.g., was cancelled)
  if (deployment.status !== DeploymentStatus.DEPLOYING) {
    logger.info('ActivateRelease: deployment is not in DEPLOYING state, skipping', {
      deploymentId,
      status: deployment.status,
    });
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
      { deps, removeImageOnFailure: true },
    );
    return;
  }

  const result = await runReleasePipeline({
    project,
    deploymentId,
    imageTag: deployment.imageTag,
    correlationId,
    deps,
    opts: {
      removeImageOnFailure: true,
      failOnInvalidSubdomain: true,
      persistSubdomain: true,
      markPreviousRolledBack: false,
      recordImageTagOnStart: false,
      logLabel: 'Container',
    },
  });

  if (!result.ok) {
    return;
  }

  await logEvent(
    deploymentId,
    'DEPLOY',
    'INFO',
    `Deployment HEALTHY. Container: ${result.containerName} on port ${result.hostPort}.`,
    correlationId,
  );
  logger.info('ActivateRelease: deployment healthy', {
    deploymentId,
    hostPort: result.hostPort,
    cName: result.containerName,
  });

  // ── Post-activation: retention cleanup ──────────────────────────────────────
  // Fire-and-forget — failures must not affect the HEALTHY status.
  deps.cleanupOldReleases(projectId).catch((err) => {
    logger.warn('ActivateRelease: retention cleanup error', { projectId, error: err.message });
  });
}
