import { spawn } from 'node:child_process';
import { logger } from '@hellodeploy/observability';
import { RuntimeType, isNonRootImageUser } from '@hellodeploy/contracts';

// ─── Docker runner (command arrays only — no shell) ───────────────────────────

function runDocker(args, { env } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(env ? { env: { ...process.env, ...env } } : {}),
    });
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

const ARCHITECTURE_ALIASES = new Map([
  ['x86_64', 'amd64'],
  ['aarch64', 'arm64'],
]);

export function normalizeDockerArchitecture(value) {
  const architecture = String(value ?? '')
    .trim()
    .toLowerCase();
  return ARCHITECTURE_ALIASES.get(architecture) ?? architecture;
}

export function assertCompatibleImagePlatform(imageDetails, runtimeArchitecture) {
  if (imageDetails?.Os !== 'linux') {
    throw new Error(`Unsupported image operating system: ${imageDetails?.Os ?? 'unknown'}`);
  }
  const imageArchitecture = normalizeDockerArchitecture(imageDetails.Architecture);
  const hostArchitecture = normalizeDockerArchitecture(runtimeArchitecture);
  if (!imageArchitecture || !hostArchitecture || imageArchitecture !== hostArchitecture) {
    throw new Error(
      `Unsupported image architecture: ${imageArchitecture || 'unknown'}; runtime Docker requires ${hostArchitecture || 'unknown'}.`,
    );
  }
  return imageArchitecture;
}

/** An owner-supplied image failed a platform safety check. */
export class ImagePolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImagePolicyError';
    this.code = 'IMAGE_POLICY_FAILED';
  }
}

/**
 * Pull a digest-pinned image and verify it can run here. Owner-supplied images
 * also pass `policy`, because their Dockerfile is not platform-generated.
 *
 * @param {string} imageRef
 * @param {{ runDocker?: Function }} deps
 * @param {{ policy?: { requireNonRootUser?: boolean, rejectVolumes?: boolean,
 *   maxImageBytes?: number }, dockerConfigDir?: string }} options
 */
export async function pullAndVerifyImage(imageRef, deps = {}, options = {}) {
  if (!/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(imageRef ?? '')) {
    throw new Error('Remote image reference must be pinned to a sha256 digest.');
  }
  const docker = deps.runDocker ?? runDocker;
  // A per-pull config keeps one project's registry credentials away from every
  // other pull the worker makes.
  const pullOptions = options.dockerConfigDir
    ? { env: { DOCKER_CONFIG: options.dockerConfigDir } }
    : undefined;
  await docker(['pull', imageRef], pullOptions);
  const details = JSON.parse(
    await docker(['image', 'inspect', '--format', '{{json .}}', imageRef]),
  );
  const runtimeArchitecture = JSON.parse(
    await docker(['info', '--format', '{{json .Architecture}}']),
  );
  const architecture = assertCompatibleImagePlatform(details, runtimeArchitecture);
  if (options.policy) {
    assertImagePolicy(details, options.policy);
  }
  return { imageId: details.Id, architecture };
}

function assertImagePolicy(details, { requireNonRootUser, rejectVolumes, maxImageBytes }) {
  if (requireNonRootUser && !isNonRootImageUser(details.Config?.User)) {
    throw new ImagePolicyError(
      'The image runs as root. Set a non-root USER, such as USER 10001, in its final stage.',
    );
  }
  const volumes = Object.keys(details.Config?.Volumes ?? {});
  if (rejectVolumes && volumes.length > 0) {
    throw new ImagePolicyError(
      `The image declares volumes (${volumes.slice(0, 5).join(', ')}), which would create unmanaged storage on the host.`,
    );
  }
  if (maxImageBytes && Number(details.Size) > maxImageBytes) {
    throw new ImagePolicyError(
      `The image is ${Math.round(details.Size / 1024 / 1024)} MB, larger than the ${Math.round(maxImageBytes / 1024 / 1024)} MB limit.`,
    );
  }
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
    return true;
  } catch {
    logger.warn('Container: failed to remove network (may still have containers)', { netName });
    return false;
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
 *   pidsLimit?: number,
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
  pidsLimit = 100,
  projectId,
  deploymentId,
  staticRuntime,
}) {
  const isStaticRuntime =
    staticRuntime ?? [RuntimeType.STATIC, RuntimeType.REACT, RuntimeType.VUE].includes(runtimeType);

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
    String(pidsLimit),
    // Security hardening (blueprint non-negotiable controls)
    '--security-opt',
    'no-new-privileges:true',
    '--cap-drop',
    'ALL',
    // NOTE: on-failure left apps down after a reboot or Docker restart: a SIGTERM shutdown
    // exits 0, which on-failure never restarts. Platform stops always go through
    // stopAndRemoveContainer, so unless-stopped never revives a container we retired.
    '--restart',
    'unless-stopped',
    // Bound Docker's json-file log growth independently of database log capture.
    '--log-driver',
    'json-file',
    '--log-opt',
    'max-size=10m',
    '--log-opt',
    'max-file=3',
    // Labels for identification
    '--label',
    `hellodeploy.managed=true`,
    '--label',
    `hellodeploy.project=${projectId}`,
    '--label',
    `hellodeploy.deployment=${deploymentId}`,
    ...envArgs,
    // Always inject PORT so the app knows which port to listen on. It comes
    // after the project's own variables because Docker keeps the last value:
    // a PORT secret must not move the app off the port the health check and
    // nginx route target.
    '--env',
    `PORT=${appPort}`,
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
 * @returns {Promise<{ status: string, running: boolean, restarting: boolean,
 *   restartCount: number, exitCode: number, startedAt: Date | null }>}
 */
export async function inspectContainer(containerIdOrName) {
  try {
    const json = await runDocker([
      'inspect',
      '--format',
      '{"state":{{json .State}},"restartCount":{{.RestartCount}}}',
      containerIdOrName,
    ]);
    const { state, restartCount } = JSON.parse(json);
    // NOTE: under `--restart unless-stopped` a crashing app reports Running=true
    // between restarts, so Restarting and RestartCount are the crash signals.
    return {
      status: state.Status ?? 'unknown',
      running: state.Running ?? false,
      restarting: state.Restarting ?? false,
      restartCount: restartCount ?? 0,
      exitCode: state.ExitCode ?? -1,
      startedAt: parseContainerStartedAt(state.StartedAt),
    };
  } catch {
    return {
      status: 'missing',
      running: false,
      restarting: false,
      restartCount: 0,
      exitCode: -1,
      startedAt: null,
    };
  }
}

/**
 * Docker's State.StartedAt as a Date, or null when the container never started:
 * Docker reports the zero time `0001-01-01T00:00:00Z` for that.
 */
export function parseContainerStartedAt(value) {
  const startedAt = new Date(value);
  return Number.isNaN(startedAt.getTime()) || startedAt.getTime() <= 0 ? null : startedAt;
}

/**
 * Last `tail` lines of a container's stdout and stderr. Non-fatal: returns []
 * when the container is gone or docker fails, since callers only use this to
 * explain a failure that is already being reported.
 */
export function getContainerLogs(containerIdOrName, tail = 50) {
  return new Promise((resolve) => {
    const proc = spawn('docker', ['logs', '--tail', String(tail), containerIdOrName], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = [];
    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => chunks.push(d));
    proc.on('close', (code) => {
      if (code !== 0) {
        resolve([]);
        return;
      }
      resolve(
        Buffer.concat(chunks)
          .toString('utf8')
          .split('\n')
          .map((line) => line.trimEnd())
          .filter(Boolean),
      );
    });
    proc.on('error', () => resolve([]));
  });
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
    return true;
  } catch (err) {
    logger.warn('Container: failed to remove', {
      container: containerIdOrName,
      error: err.message,
    });
    return false;
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
