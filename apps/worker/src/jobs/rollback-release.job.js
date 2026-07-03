import { Project, Deployment, DeploymentEvent } from '@hellodeploy/database';
import { DeploymentStatus, RuntimeType } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { allocatePort } from '../deployment/port-allocator.js';
import {
  containerName,
  networkName,
  ensureNetwork,
  startContainer,
  inspectContainer,
  stopAndRemoveContainer,
} from '../deployment/container.js';
import { httpHealthCheck } from '../deployment/health-check.js';
import { getProjectEnvVars } from '../deployment/secrets.js';
import { STATIC_PORT } from '../deployment/dockerfile-generator.js';
import { generateServerBlock } from '../nginx/template.js';
import { activateRoute } from '../nginx/route-manager.js';
import { isReservedSubdomain, isValidSubdomainLabel } from '../nginx/reserved-subdomains.js';
import { notifyDeploymentResult } from '../notification/deployment-notification.js';
import { redactLogLine } from '../deployment/log-capture.js';
import { env } from '../config/env.js';

const DEFAULT_MEMORY_MB = 256;
const DEFAULT_CPU_CORES = 0.25;
// Static runtimes always serve on STATIC_PORT — the generated nginx-unprivileged
// image listens there regardless of buildConfiguration.applicationPort.
const STATIC_RUNTIME_PORT = {
  [RuntimeType.STATIC]: STATIC_PORT,
  [RuntimeType.REACT]: STATIC_PORT,
  [RuntimeType.VUE]: STATIC_PORT,
};
const STARTUP_DELAY_MS = 3_000;

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

async function logEvent(deploymentId, stage, level, message, correlationId) {
  await DeploymentEvent.create({
    deploymentId,
    stage,
    level,
    messageRedacted: redactLogLine(message),
    correlationId,
  });
}

async function updateStatus(
  deploymentId,
  toStatus,
  extra = {},
  project = null,
  deps = defaultDeps,
) {
  await Deployment.updateOne(
    { _id: deploymentId },
    { $set: { status: toStatus, currentStage: toStatus, ...extra } },
  );

  if (project && (toStatus === DeploymentStatus.HEALTHY || toStatus === DeploymentStatus.FAILED)) {
    const freshDeployment = await Deployment.findById(deploymentId).lean();
    deps
      .notifyDeploymentResult({
        ownerId: project.ownerId.toString(),
        projectName: project.name,
        projectSlug: project.slug,
        sequenceNumber: freshDeployment?.sequenceNumber ?? '?',
        status: toStatus,
        commitSha: freshDeployment?.commitSha ?? '',
        failureCode: freshDeployment?.failureCode,
        failureSummary: freshDeployment?.failureSummary,
        platformDomain: env.PLATFORM_DOMAIN,
        notificationPreference: project.notificationPreference,
      })
      .catch(() => {}); // notification failures must never affect the deployment pipeline
  }
}

/**
 * ROLLBACK_RELEASE job handler.
 *
 * Creates a new candidate container from an existing image (sourceDeploymentId),
 * health-checks it, and if healthy: activates nginx route and stops the current
 * active container. The rollback deployment record (deploymentId) tracks progress.
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
      null,
      deps,
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
      null,
      deps,
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

  const runtimeType = project.runtimeType ?? RuntimeType.NODEJS;
  const appPort =
    STATIC_RUNTIME_PORT[runtimeType] ?? project.buildConfiguration?.applicationPort ?? 3000;
  const netName = networkName(project.slug);
  const cName = containerName(project.slug, deploymentId);

  // ── Allocate port ───────────────────────────────────────────────────────────
  let hostPort;
  try {
    hostPort = await deps.allocatePort();
    await Deployment.updateOne(
      { _id: deploymentId },
      { $set: { containerPort: hostPort, containerName: cName, containerNetworkName: netName } },
    );
    await logEvent(deploymentId, 'DEPLOY', 'INFO', `Allocated port ${hostPort}.`, correlationId);
  } catch (err) {
    await logEvent(deploymentId, 'DEPLOY', 'ERROR', err.message, correlationId);
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'PORT_ALLOCATION_FAILED',
        failureSummary: err.message,
        completedAt: new Date(),
      },
      project,
      deps,
    );
    return;
  }

  // ── Ensure network ──────────────────────────────────────────────────────────
  try {
    await deps.ensureNetwork(netName);
  } catch (err) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Network setup failed: ${err.message}`,
      correlationId,
    );
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      { failureCode: 'NETWORK_SETUP_FAILED', failureSummary: err.message, completedAt: new Date() },
      project,
      deps,
    );
    return;
  }

  // ── Decrypt env vars ────────────────────────────────────────────────────────
  let envVars = {};
  try {
    envVars = await deps.getProjectEnvVars(projectId);
  } catch {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      'Failed to decrypt environment secrets.',
      correlationId,
    );
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'SECRET_DECRYPTION_FAILED',
        failureSummary: 'Could not decrypt environment secrets.',
        completedAt: new Date(),
      },
      project,
      deps,
    );
    return;
  }

  // ── Start container from source image ───────────────────────────────────────
  let containerId;
  try {
    containerId = await deps.startContainer({
      containerName: cName,
      imageTag: sourceDeployment.imageTag,
      networkName: netName,
      hostPort,
      appPort,
      runtimeType,
      envVars,
      memoryMb: DEFAULT_MEMORY_MB,
      cpuCores: DEFAULT_CPU_CORES,
      projectId: projectId.toString(),
      deploymentId: deploymentId.toString(),
    });
    await Deployment.updateOne(
      { _id: deploymentId },
      { $set: { candidateContainerId: containerId, imageTag: sourceDeployment.imageTag } },
    );
    await logEvent(
      deploymentId,
      'DEPLOY',
      'INFO',
      `Rollback container started: ${cName}.`,
      correlationId,
    );
  } catch (err) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Failed to start rollback container: ${err.message}`,
      correlationId,
    );
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'CONTAINER_START_FAILED',
        failureSummary: err.message.slice(0, 1000),
        completedAt: new Date(),
      },
      project,
      deps,
    );
    return;
  }

  // ── Startup delay + crash detection ────────────────────────────────────────
  await new Promise((r) => setTimeout(r, deps.startupDelayMs));

  const state = await deps.inspectContainer(cName);
  if (!state.running) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Rollback container exited immediately (code ${state.exitCode}).`,
      correlationId,
    );
    await deps.stopAndRemoveContainer(cName);
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'CONTAINER_CRASHED_ON_STARTUP',
        failureSummary: `Container exited with code ${state.exitCode}.`,
        completedAt: new Date(),
      },
      project,
      deps,
    );
    return;
  }

  // ── Health check ────────────────────────────────────────────────────────────
  const rawHealthCheckPath = project.buildConfiguration?.healthCheckPath || '/';
  const healthCheckPath = rawHealthCheckPath.startsWith('/')
    ? rawHealthCheckPath
    : `/${rawHealthCheckPath}`;
  const healthUrl = `http://127.0.0.1:${hostPort}${healthCheckPath}`;
  const health = await deps.httpHealthCheck({ url: healthUrl, attempts: 12, intervalMs: 5_000 });

  if (!health.healthy) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Rollback health check failed: ${health.error ?? 'timeout'}`,
      correlationId,
    );
    await deps.stopAndRemoveContainer(cName);
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'HEALTH_CHECK_FAILED',
        failureSummary: `Health check failed: ${health.error ?? 'no response'}`.slice(0, 1000),
        completedAt: new Date(),
      },
      project,
      deps,
    );
    return;
  }

  await logEvent(
    deploymentId,
    'DEPLOY',
    'INFO',
    `Rollback health check passed (HTTP ${health.finalStatus}).`,
    correlationId,
  );

  // ── Nginx route update ──────────────────────────────────────────────────────
  if (env.NGINX_ENABLED) {
    const subdomain = project.platformSubdomain ?? project.slug;

    if (isValidSubdomainLabel(subdomain) && !isReservedSubdomain(subdomain)) {
      const nginxConfig = generateServerBlock({
        subdomain,
        domain: env.PLATFORM_DOMAIN,
        port: hostPort,
        deploymentId: deploymentId.toString(),
      });

      try {
        await deps.activateRoute({
          configDir: env.NGINX_HELLODEPLOY_CONFIG_DIR,
          slug: subdomain,
          configContent: nginxConfig,
          nginxBinary: env.NGINX_BINARY_PATH,
        });
        await logEvent(
          deploymentId,
          'DEPLOY',
          'INFO',
          `Nginx route updated for rollback.`,
          correlationId,
        );
      } catch (err) {
        await logEvent(
          deploymentId,
          'DEPLOY',
          'ERROR',
          `Nginx update failed: ${err.message}`,
          correlationId,
        );
        await deps.stopAndRemoveContainer(cName);
        await updateStatus(
          deploymentId,
          DeploymentStatus.FAILED,
          {
            failureCode: 'NGINX_ROUTE_FAILED',
            failureSummary: err.message.slice(0, 1000),
            completedAt: new Date(),
          },
          project,
          deps,
        );
        return;
      }
    }
  }

  // ── Stop current active container ───────────────────────────────────────────
  if (project.activeDeploymentId) {
    const currentActive = await Deployment.findById(project.activeDeploymentId).lean();
    if (currentActive?.activeContainerId) {
      await logEvent(
        deploymentId,
        'DEPLOY',
        'INFO',
        `Stopping current container: ${currentActive.activeContainerId.slice(0, 12)}.`,
        correlationId,
      );
      await deps.stopAndRemoveContainer(currentActive.activeContainerId);
      // Mark the previous active as ROLLED_BACK
      await Deployment.updateOne(
        { _id: currentActive._id },
        {
          $set: {
            status: DeploymentStatus.ROLLED_BACK,
            activeContainerId: null,
            completedAt: new Date(),
          },
        },
      );
    }
  }

  // ── Mark HEALTHY ────────────────────────────────────────────────────────────
  await updateStatus(
    deploymentId,
    DeploymentStatus.HEALTHY,
    { activeContainerId: containerId, completedAt: new Date() },
    project,
    deps,
  );

  await Project.updateOne({ _id: projectId }, { $set: { activeDeploymentId: deployment._id } });

  await logEvent(
    deploymentId,
    'DEPLOY',
    'INFO',
    `Rollback complete. Restored to deployment #${sourceDeployment.sequenceNumber}.`,
    correlationId,
  );
  logger.info('RollbackRelease: rollback complete', { deploymentId, sourceDeploymentId, hostPort });
}
