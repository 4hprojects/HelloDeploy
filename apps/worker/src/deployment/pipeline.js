import { Project, Deployment, DeploymentEvent } from '@hellodeploy/database';
import { DeploymentStatus, RuntimeType } from '@hellodeploy/contracts';
import { getWorkerRedis } from '../queue/worker-redis.js';
import { redactLogLine } from './log-capture.js';
import { STATIC_PORT } from './dockerfile-generator.js';
import { containerName, networkName } from './container.js';
import { generateServerBlock } from '../nginx/template.js';
import { isReservedSubdomain, isValidSubdomainLabel } from '../nginx/reserved-subdomains.js';
import { env } from '../config/env.js';

/**
 * Shared release pipeline for ACTIVATE_RELEASE and ROLLBACK_RELEASE:
 * port allocation → network → secrets → container start → startup/crash
 * check → health check → nginx route → old-container swap → HEALTHY.
 *
 * The two jobs differ only in the knobs exposed via `opts`.
 */

export const DEFAULT_MEMORY_MB = 256;
export const DEFAULT_CPU_CORES = 0.25;

// How long to wait after container start before health-checking (ms)
export const STARTUP_DELAY_MS = 3_000;

// Static runtimes always serve on STATIC_PORT — the generated nginx-unprivileged
// image listens there regardless of buildConfiguration.applicationPort.
const STATIC_RUNTIME_PORT = {
  [RuntimeType.STATIC]: STATIC_PORT,
  [RuntimeType.REACT]: STATIC_PORT,
  [RuntimeType.VUE]: STATIC_PORT,
};

export function resolveAppPort(project) {
  const runtimeType = project.runtimeType ?? RuntimeType.NODEJS;
  return STATIC_RUNTIME_PORT[runtimeType] ?? project.buildConfiguration?.applicationPort ?? 3000;
}

// Fire-and-forget live push for SSE viewers; the DB records remain the source
// of truth and the web side falls back to polling them.
function publishDeployEvent(deploymentId, payload) {
  const redis = getWorkerRedis();
  if (redis && redis.status === 'ready') {
    redis.publish(`deploy-logs:${deploymentId}`, JSON.stringify(payload)).catch(() => {});
  }
}

export async function logEvent(deploymentId, stage, level, message, correlationId) {
  const event = await DeploymentEvent.create({
    deploymentId,
    stage,
    level,
    messageRedacted: redactLogLine(message),
    correlationId,
  });

  publishDeployEvent(deploymentId, {
    type: 'log',
    id: event._id.toString(),
    stage,
    level,
    message: event.messageRedacted,
    timestamp: event.createdAt,
  });
}

/**
 * Transition a deployment and run the terminal-status side effects:
 * image removal on FAILED (when `removeImageOnFailure`) and owner notification.
 */
export async function updateStatus(deploymentId, toStatus, extra = {}, options = {}) {
  const { project = null, deps = null, removeImageOnFailure = false } = options;

  await Deployment.updateOne(
    { _id: deploymentId },
    { $set: { status: toStatus, currentStage: toStatus, ...extra } },
  );

  if (toStatus !== DeploymentStatus.HEALTHY && toStatus !== DeploymentStatus.FAILED) {
    return;
  }

  // Instant terminal-status push for live SSE viewers.
  publishDeployEvent(deploymentId, { type: 'status', status: toStatus });

  const freshDeployment = await Deployment.findById(deploymentId).lean();

  // A failed activation leaves behind a freshly built image that will never
  // serve traffic. Tags are unique per deployment (slug-sha-seq), so removal
  // cannot affect other releases. Fire-and-forget — cleanup must not block.
  if (
    toStatus === DeploymentStatus.FAILED &&
    removeImageOnFailure &&
    deps?.removeDockerImage &&
    freshDeployment?.imageTag
  ) {
    deps.removeDockerImage(freshDeployment.imageTag);
  }

  if (project && deps?.notifyDeploymentResult) {
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
 * Run the shared activate/rollback release pipeline.
 *
 * @param {{
 *   project: object,               // Project document
 *   deploymentId: string,
 *   imageTag: string,              // image to run (fresh build or rollback source)
 *   correlationId: string,
 *   deps: object,                  // boundary deps (allocatePort, startContainer, ...)
 *   opts: {
 *     removeImageOnFailure: boolean,   // activate: true (unique tag); rollback: false (shared image)
 *     failOnInvalidSubdomain: boolean, // activate: fail the deploy; rollback: skip nginx silently
 *     persistSubdomain: boolean,       // activate assigns platformSubdomain on first deploy
 *     markPreviousRolledBack: boolean, // rollback marks the replaced release ROLLED_BACK
 *     recordImageTagOnStart: boolean,  // rollback stamps the source imageTag on its record
 *     logLabel: string,                // 'Container' | 'Rollback container' — event log wording
 *   },
 * }} params
 * @returns {Promise<{ ok: boolean, containerId?: string }>}
 */
export async function runReleasePipeline({
  project,
  deploymentId,
  imageTag,
  correlationId,
  deps,
  opts,
}) {
  const projectId = project._id;
  const statusOptions = {
    project,
    deps,
    removeImageOnFailure: opts.removeImageOnFailure,
  };
  const fail = async (failureCode, failureSummary) => {
    await updateStatus(
      deploymentId,
      DeploymentStatus.FAILED,
      { failureCode, failureSummary: failureSummary.slice(0, 1000), completedAt: new Date() },
      statusOptions,
    );
    return { ok: false };
  };

  const runtimeType = project.runtimeType ?? RuntimeType.NODEJS;
  const appPort = resolveAppPort(project);
  const netName = networkName(project.slug);
  const cName = containerName(project.slug, deploymentId);

  // ── Allocate port ───────────────────────────────────────────────────────────
  let hostPort;
  try {
    hostPort = await deps.allocatePort(deploymentId);
    await Deployment.updateOne(
      { _id: deploymentId },
      { $set: { containerName: cName, containerNetworkName: netName } },
    );
    await logEvent(deploymentId, 'DEPLOY', 'INFO', `Allocated port ${hostPort}.`, correlationId);
  } catch (err) {
    await logEvent(deploymentId, 'DEPLOY', 'ERROR', err.message, correlationId);
    return fail('PORT_ALLOCATION_FAILED', err.message);
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
    return fail('NETWORK_SETUP_FAILED', err.message);
  }

  // ── Decrypt env vars ────────────────────────────────────────────────────────
  let envVars = {};
  try {
    envVars = await deps.getProjectEnvVars(projectId);
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
    return fail('SECRET_DECRYPTION_FAILED', 'Could not decrypt environment secrets.');
  }

  // ── Start container ─────────────────────────────────────────────────────────
  let containerId;
  try {
    containerId = await deps.startContainer({
      containerName: cName,
      imageTag,
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
      {
        $set: {
          candidateContainerId: containerId,
          ...(opts.recordImageTagOnStart ? { imageTag } : {}),
        },
      },
    );

    await logEvent(
      deploymentId,
      'DEPLOY',
      'INFO',
      `${opts.logLabel} started: ${cName}.`,
      correlationId,
    );
  } catch (err) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Failed to start container: ${err.message}`,
      correlationId,
    );
    return fail('CONTAINER_START_FAILED', err.message);
  }

  // ── Startup stabilization + crash-loop detection ────────────────────────────
  // Poll instead of one flat sleep: an immediately crashing container fails the
  // deployment as soon as the exit is visible instead of after the full window.
  const startupDeadline = Date.now() + deps.startupDelayMs;
  let state = await deps.inspectContainer(cName);
  while (state.running && Date.now() < startupDeadline) {
    await new Promise((r) => setTimeout(r, Math.min(500, startupDeadline - Date.now())));
    state = await deps.inspectContainer(cName);
  }
  if (!state.running) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `${opts.logLabel} exited immediately (code ${state.exitCode}). Possible crash or missing start command.`,
      correlationId,
    );
    await deps.stopAndRemoveContainer(cName);
    return fail(
      'CONTAINER_CRASHED_ON_STARTUP',
      `Container exited with code ${state.exitCode} immediately after start.`,
    );
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

  const health = await deps.httpHealthCheck({ url: healthUrl, attempts: 12, intervalMs: 5_000 });

  if (!health.healthy) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Health check failed: ${health.error ?? 'timeout'}`,
      correlationId,
    );
    await deps.stopAndRemoveContainer(cName);
    return fail(
      'HEALTH_CHECK_FAILED',
      `Health check did not pass: ${health.error ?? 'no response within timeout'}`,
    );
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
    const subdomain = project.platformSubdomain ?? project.slug;
    const subdomainUsable = isValidSubdomainLabel(subdomain) && !isReservedSubdomain(subdomain);

    if (!subdomainUsable && opts.failOnInvalidSubdomain) {
      await logEvent(
        deploymentId,
        'DEPLOY',
        'ERROR',
        `Subdomain "${subdomain}" is invalid or reserved.`,
        correlationId,
      );
      await deps.stopAndRemoveContainer(cName);
      return fail('SUBDOMAIN_INVALID', `Subdomain "${subdomain}" cannot be used.`);
    }

    if (subdomainUsable) {
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
        await deps.stopAndRemoveContainer(cName);
        return fail('NGINX_ROUTE_FAILED', `Nginx configuration failed: ${err.message}`);
      }

      // Persist subdomain assignment on first-time deployment
      if (opts.persistSubdomain && !project.platformSubdomain) {
        await Project.updateOne({ _id: projectId }, { $set: { platformSubdomain: subdomain } });
      }
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
      await deps.stopAndRemoveContainer(oldDeployment.activeContainerId);

      if (opts.markPreviousRolledBack) {
        await Deployment.updateOne(
          { _id: oldDeployment._id },
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
  }

  // ── Mark HEALTHY ────────────────────────────────────────────────────────────
  await updateStatus(
    deploymentId,
    DeploymentStatus.HEALTHY,
    { activeContainerId: containerId, completedAt: new Date() },
    statusOptions,
  );

  await Project.updateOne({ _id: projectId }, { $set: { activeDeploymentId: deploymentId } });

  return { ok: true, containerId, hostPort, containerName: cName };
}
