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
import { redactLogLine } from '../deployment/log-capture.js';
import { generateServerBlock } from '../nginx/template.js';
import { activateRoute } from '../nginx/route-manager.js';
import { isReservedSubdomain, isValidSubdomainLabel } from '../nginx/reserved-subdomains.js';
import { cleanupOldReleases } from '../deployment/retention.js';
import { notifyDeploymentResult } from '../notification/deployment-notification.js';
import { env } from '../config/env.js';

// Resource defaults (overridden by project quota in Phase 10)
const DEFAULT_MEMORY_MB = 256;
const DEFAULT_CPU_CORES = 0.25;

// Application port per runtime (used when buildConfiguration.applicationPort is null)
const DEFAULT_APP_PORT = {
  [RuntimeType.STATIC]: 80,
  [RuntimeType.REACT]: 80,
  [RuntimeType.VUE]: 80,
};

// How long to wait after container start before health-checking (ms)
const STARTUP_DELAY_MS = 3_000;

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function logEvent(deploymentId, stage, level, message, correlationId) {
  await DeploymentEvent.create({
    deploymentId,
    stage,
    level,
    messageRedacted: redactLogLine(message),
    correlationId,
  });
}

async function updateStatus(deploymentId, toStatus, extra = {}, project = null) {
  await Deployment.updateOne(
    { _id: deploymentId },
    { $set: { status: toStatus, currentStage: toStatus, ...extra } },
  );

  if (project && (toStatus === DeploymentStatus.HEALTHY || toStatus === DeploymentStatus.FAILED)) {
    const freshDeployment = await Deployment.findById(deploymentId).lean();
    notifyDeploymentResult({
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
    }).catch(() => {}); // notification failures must never affect the deployment pipeline
  }
}

// ─── Job handler ───────────────────────────────────────────────────────────────

/**
 * ACTIVATE_RELEASE job handler.
 *
 * Prerequisites: BUILD_DEPLOYMENT succeeded and status is DEPLOYING.
 *
 * Steps:
 *   1. Allocate loopback port
 *   2. Ensure Docker network exists
 *   3. Decrypt project environment secrets
 *   4. docker run with hardened settings
 *   5. Wait for startup delay
 *   6. Inspect container state (crash-loop detection)
 *   7. HTTP health check with retries
 *   8. On success: stop old active container, mark HEALTHY
 *   9. On failure: stop candidate, mark FAILED (existing HEALTHY container keeps running)
 */
export async function handleActivateRelease(job) {
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
    await updateStatus(deploymentId, DeploymentStatus.FAILED, {
      failureCode: 'PROJECT_NOT_FOUND',
      failureSummary: 'Project not found.',
      completedAt: new Date(),
    });
    return;
  }

  const runtimeType = project.runtimeType ?? RuntimeType.NODEJS;
  const appPort =
    project.buildConfiguration?.applicationPort ?? DEFAULT_APP_PORT[runtimeType] ?? 3000;

  const netName = networkName(project.slug);
  const cName = containerName(project.slug, deploymentId);

  // ── Allocate port ───────────────────────────────────────────────────────────
  let hostPort;
  try {
    hostPort = await allocatePort();
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
      { failureCode: 'PORT_ALLOCATION_FAILED', failureSummary: err.message, completedAt: new Date() },
      project,
    );
    return;
  }

  // ── Ensure network ──────────────────────────────────────────────────────────
  try {
    await ensureNetwork(netName);
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
    );
    return;
  }

  // ── Decrypt env vars ────────────────────────────────────────────────────────
  let envVars = {};
  try {
    envVars = await getProjectEnvVars(projectId);
    await logEvent(
      deploymentId,
      'DEPLOY',
      'INFO',
      `Injecting ${Object.keys(envVars).length} environment secret(s).`,
      correlationId,
    );
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
    );
    return;
  }

  // ── Start container ─────────────────────────────────────────────────────────
  let containerId;
  try {
    containerId = await startContainer({
      containerName: cName,
      imageTag: deployment.imageTag,
      networkName: netName,
      hostPort,
      appPort,
      runtimeType,
      envVars, // plaintext secrets — passed directly to docker, NEVER logged
      memoryMb: DEFAULT_MEMORY_MB,
      cpuCores: DEFAULT_CPU_CORES,
      projectId: projectId.toString(),
      deploymentId: deploymentId.toString(),
    });

    await Deployment.updateOne(
      { _id: deploymentId },
      { $set: { candidateContainerId: containerId } },
    );

    await logEvent(deploymentId, 'DEPLOY', 'INFO', `Container started: ${cName}.`, correlationId);
  } catch (err) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Failed to start container: ${err.message}`,
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
    );
    return;
  }

  // ── Wait for startup + crash-loop detection ─────────────────────────────────
  await new Promise((r) => setTimeout(r, STARTUP_DELAY_MS));

  const state = await inspectContainer(cName);
  if (!state.running) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Container exited immediately (code ${state.exitCode}). Possible crash or missing start command.`,
      correlationId,
    );
    await stopAndRemoveContainer(cName);
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'CONTAINER_CRASHED_ON_STARTUP',
        failureSummary: `Container exited with code ${state.exitCode} immediately after start.`,
        completedAt: new Date(),
      },
      project,
    );
    return;
  }

  // ── HTTP health check ───────────────────────────────────────────────────────
  const rawHealthCheckPath = project.buildConfiguration?.healthCheckPath || '/';
  const healthCheckPath = rawHealthCheckPath.startsWith('/')
    ? rawHealthCheckPath
    : `/${rawHealthCheckPath}`;
  const healthUrl = `http://127.0.0.1:${hostPort}${healthCheckPath}`;
  await logEvent(
    deploymentId,
    'DEPLOY',
    'INFO',
    `Running health check: ${healthUrl}`,
    correlationId,
  );

  const health = await httpHealthCheck({ url: healthUrl, attempts: 12, intervalMs: 5_000 });

  if (!health.healthy) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Health check failed: ${health.error ?? 'timeout'}`,
      correlationId,
    );
    await stopAndRemoveContainer(cName);
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      {
        failureCode: 'HEALTH_CHECK_FAILED',
        failureSummary:
          `Health check did not pass: ${health.error ?? 'no response within timeout'}`.slice(0, 1000),
        completedAt: new Date(),
      },
      project,
    );
    return;
  }

  await logEvent(
    deploymentId,
    'DEPLOY',
    'INFO',
    `Health check passed (HTTP ${health.finalStatus}).`,
    correlationId,
  );

  // ── Nginx route activation ──────────────────────────────────────────────────
  if (env.NGINX_ENABLED) {
    // Determine subdomain: prefer existing assignment, otherwise use project slug
    const subdomain = project.platformSubdomain ?? project.slug;

    if (!isValidSubdomainLabel(subdomain) || isReservedSubdomain(subdomain)) {
      await logEvent(
        deploymentId,
        'DEPLOY',
        'ERROR',
        `Subdomain "${subdomain}" is invalid or reserved.`,
        correlationId,
      );
      await stopAndRemoveContainer(cName);
      await updateStatus(
        deploymentId,
        DeploymentStatus.FAILED,
        {
          failureCode: 'SUBDOMAIN_INVALID',
          failureSummary: `Subdomain "${subdomain}" cannot be used.`,
          completedAt: new Date(),
        },
        project,
      );
      return;
    }

    const nginxConfig = generateServerBlock({
      subdomain,
      domain: env.PLATFORM_DOMAIN,
      port: hostPort,
      deploymentId: deploymentId.toString(),
    });

    try {
      await activateRoute({
        configDir: env.NGINX_HELLODEPLOY_CONFIG_DIR,
        slug: subdomain,
        configContent: nginxConfig,
        nginxBinary: env.NGINX_BINARY_PATH,
      });
      await logEvent(
        deploymentId,
        'DEPLOY',
        'INFO',
        `Nginx route active: ${subdomain}.${env.PLATFORM_DOMAIN}`,
        correlationId,
      );
    } catch (err) {
      await logEvent(
        deploymentId,
        'DEPLOY',
        'ERROR',
        `Nginx route activation failed: ${err.message}`,
        correlationId,
      );
      await stopAndRemoveContainer(cName);
      await updateStatus(
        deploymentId,
        DeploymentStatus.FAILED,
        {
          failureCode: 'NGINX_ROUTE_FAILED',
          failureSummary: `Nginx configuration failed: ${err.message}`.slice(0, 1000),
          completedAt: new Date(),
        },
        project,
      );
      return;
    }

    // Persist subdomain assignment on first-time deployment
    if (!project.platformSubdomain) {
      await Project.updateOne({ _id: projectId }, { $set: { platformSubdomain: subdomain } });
    }
  }

  // ── Swap: stop old active container if one exists ───────────────────────────
  if (project.activeDeploymentId) {
    const oldDeployment = await Deployment.findById(project.activeDeploymentId).lean();
    if (oldDeployment?.activeContainerId) {
      await logEvent(
        deploymentId,
        'DEPLOY',
        'INFO',
        `Stopping previous container: ${oldDeployment.activeContainerId.slice(0, 12)}.`,
        correlationId,
      );
      await stopAndRemoveContainer(oldDeployment.activeContainerId);
    }
  }

  // ── Mark HEALTHY ────────────────────────────────────────────────────────────
  await updateStatus(
    deploymentId,
    DeploymentStatus.HEALTHY,
    { activeContainerId: containerId, completedAt: new Date() },
    project,
  );

  await Project.updateOne({ _id: projectId }, { $set: { activeDeploymentId: deployment._id } });

  await logEvent(
    deploymentId,
    'DEPLOY',
    'INFO',
    `Deployment HEALTHY. Container: ${cName} on port ${hostPort}.`,
    correlationId,
  );
  logger.info('ActivateRelease: deployment healthy', { deploymentId, hostPort, cName });

  // ── Post-activation: retention cleanup ──────────────────────────────────────
  // Fire-and-forget — failures must not affect the HEALTHY status.
  cleanupOldReleases(projectId).catch((err) => {
    logger.warn('ActivateRelease: retention cleanup error', { projectId, error: err.message });
  });
}
