import { spawn } from 'node:child_process';
import { logger } from '@hellodeploy/observability';
import { RuntimeType } from '@hellodeploy/contracts';

// ─── Docker runner (command arrays only — no shell) ───────────────────────────

function runDocker(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    proc.stdout.on('data', (d) => out.push(d));
    proc.stderr.on('data', (d) => err.push(d));
    proc.on('close', (code) => {
      const stdout = Buffer.concat(out).toString('utf8').trim();
      const stderr = Buffer.concat(err).toString('utf8').trim();
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`docker ${args[0]} failed (exit ${code}): ${stderr.slice(0, 500)}`));
      }
    });
    proc.on('error', (e) => reject(new Error(`docker spawn error: ${e.message}`)));
  });
}

// ─── Container name / network name helpers ─────────────────────────────────────

export function containerName(projectSlug, deploymentId) {
  return `hellodeploy-${projectSlug}-${deploymentId.toString().slice(0, 8)}`;
}

export function networkName(projectSlug) {
  return `hellodeploy-${projectSlug}`;
}

// ─── Network ───────────────────────────────────────────────────────────────────

/**
 * Create a Docker bridge network for a project if it doesn't already exist.
 * Idempotent.
 */
export async function ensureNetwork(netName) {
  try {
    await runDocker(['network', 'inspect', netName]);
    // network exists
  } catch {
    await runDocker(['network', 'create', '--driver', 'bridge', netName]);
    logger.info('Container: created Docker network', { netName });
  }
}

/**
 * Remove a Docker network. Non-fatal — logs a warning on failure.
 */
export async function removeNetwork(netName) {
  try {
    await runDocker(['network', 'rm', netName]);
    logger.info('Container: removed Docker network', { netName });
  } catch {
    logger.warn('Container: failed to remove network (may still have containers)', { netName });
  }
}

// ─── Container lifecycle ───────────────────────────────────────────────────────

/**
 * Start a candidate container with hardened runtime settings.
 * SECURITY: command array only — values are never interpolated into a shell string.
 * Env var values are passed directly — they are NEVER logged.
 *
 * @param {{
 *   containerName: string,
 *   imageTag: string,
 *   networkName: string,
 *   hostPort: number,       // loopback port on host (127.0.0.1:hostPort)
 *   appPort: number,        // container-internal port
 *   runtimeType: string,
 *   envVars: Record<string, string>,  // NEVER log these
 *   memoryMb: number,
 *   cpuCores: number,
 *   projectId: string,
 *   deploymentId: string,
 * }} opts
 * @returns {Promise<string>} container ID
 */
export async function startContainer({
  containerName: name,
  imageTag,
  networkName: netName,
  hostPort,
  appPort,
  runtimeType,
  envVars,
  memoryMb,
  cpuCores,
  projectId,
  deploymentId,
}) {
  const isStaticRuntime = [RuntimeType.STATIC, RuntimeType.REACT, RuntimeType.VUE].includes(
    runtimeType,
  );

  // Build --env flags for each secret (NEVER log this list)
  const envArgs = [];
  for (const [key, value] of Object.entries(envVars)) {
    envArgs.push('--env', `${key}=${value}`);
  }

  const args = [
    'run',
    '--detach',
    '--name',
    name,
    '--network',
    netName,
    '--publish',
    `127.0.0.1:${hostPort}:${appPort}`,
    // Resource limits (blueprint: mandatory)
    '--memory',
    `${memoryMb}m`,
    '--memory-swap',
    `${memoryMb}m`, // disable swap
    '--cpus',
    String(cpuCores),
    '--pids-limit',
    '100',
    // Security hardening (blueprint non-negotiable controls)
    '--security-opt',
    'no-new-privileges:true',
    '--cap-drop',
    'ALL',
    // Crash loop protection (max 3 restarts before giving up)
    '--restart',
    'on-failure:3',
    // Labels for identification
    '--label',
    `hellodeploy.managed=true`,
    '--label',
    `hellodeploy.project=${projectId}`,
    '--label',
    `hellodeploy.deployment=${deploymentId}`,
    // Always inject PORT so the app knows which port to listen on
    '--env',
    `PORT=${appPort}`,
    ...envArgs,
  ];

  // Static containers get a read-only root filesystem + tmpfs for nginx temp files
  if (isStaticRuntime) {
    args.push('--read-only');
    args.push('--tmpfs', '/tmp:rw,size=32m,noexec');
    args.push('--tmpfs', '/var/cache/nginx:rw,size=32m,noexec');
    args.push('--tmpfs', '/var/run:rw,size=4m,noexec');
  } else {
    // Node.js runtimes get a writable /tmp tmpfs
    args.push('--tmpfs', '/tmp:rw,size=64m');
  }

  args.push(imageTag);

  const containerId = await runDocker(args);
  logger.info('Container: started', { name, hostPort, appPort, runtimeType });
  return containerId;
}

/**
 * Inspect a container and return its current state.
 *
 * @param {string} containerIdOrName
 * @returns {Promise<{ status: string, running: boolean, exitCode: number }>}
 */
export async function inspectContainer(containerIdOrName) {
  try {
    const json = await runDocker(['inspect', '--format', '{{json .State}}', containerIdOrName]);
    const state = JSON.parse(json);
    return {
      status: state.Status ?? 'unknown',
      running: state.Running ?? false,
      exitCode: state.ExitCode ?? -1,
    };
  } catch {
    return { status: 'missing', running: false, exitCode: -1 };
  }
}

/**
 * Gracefully stop and remove a container. Non-fatal.
 */
export async function stopAndRemoveContainer(containerIdOrName) {
  try {
    await runDocker(['stop', '--time', '15', containerIdOrName]);
  } catch {
    // container may already be stopped
  }
  try {
    await runDocker(['rm', '--force', containerIdOrName]);
    logger.info('Container: removed', { container: containerIdOrName });
  } catch (err) {
    logger.warn('Container: failed to remove', {
      container: containerIdOrName,
      error: err.message,
    });
  }
}

/**
 * Collect basic metrics from a running container.
 * Returns null if the container is not running or stats are unavailable.
 *
 * @param {string} containerIdOrName
 * @returns {Promise<{ cpuPercent: string, memUsage: string } | null>}
 */
export async function getContainerStats(containerIdOrName) {
  try {
    const output = await runDocker([
      'stats',
      '--no-stream',
      '--format',
      '{{.CPUPerc}}\t{{.MemUsage}}',
      containerIdOrName,
    ]);
    const [cpuPercent, memUsage] = output.split('\t');
    return { cpuPercent: cpuPercent?.trim(), memUsage: memUsage?.trim() };
  } catch {
    return null;
  }
}
