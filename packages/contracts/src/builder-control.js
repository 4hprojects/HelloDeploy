import {
  BuildStrategy,
  JAVA_BUILD_STRATEGIES,
  NEXT_BUILD_STRATEGIES,
  PHP_BUILD_STRATEGIES,
  PYTHON_BUILD_STRATEGIES,
  isJavaBuildStrategy,
  isNextBuildStrategy,
  isPhpBuildStrategy,
  isPythonBuildStrategy,
} from './build-strategies.js';
import { PlatformRole } from './enums.js';

/**
 * Shared rules for the on-demand builder that administrators start and stop.
 * The worker owns the builder and publishes its status; the web only reads that
 * status and queues control requests. See docs/multi-runtime/BUILDER_CONTROL_DESIGN.md.
 */

export const BuilderState = Object.freeze({
  STOPPED: 'STOPPED',
  STARTING: 'STARTING',
  READY: 'READY',
  BUILDING: 'BUILDING',
  STOPPING: 'STOPPING',
  FAILED: 'FAILED',
});

export const BuilderControlAction = Object.freeze({
  START: 'start',
  STOP: 'stop',
  EMERGENCY_STOP: 'emergency-stop',
  CHECK_REGISTRY: 'check-registry',
});

/** Redis key holding the worker's latest builder status as JSON. */
export const BUILDER_STATUS_KEY = 'builder:status';
/** The worker publishes every 15 s; older status is treated as unknown. */
export const BUILDER_STATUS_PUBLISH_MS = 15_000;
export const BUILDER_STATUS_STALE_MS = 60_000;

/** PlatformSetting key for the settings super-admins edit. */
export const BUILDER_SETTINGS_KEY = 'builderControl';
export const DEFAULT_BUILDER_IDLE_MINUTES = 30;
export const MIN_BUILDER_IDLE_MINUTES = 5;
export const MAX_BUILDER_IDLE_MINUTES = 240;

/**
 * Resource protection. These are code constants on purpose: no setting,
 * environment variable or admin action can loosen them. The service caps
 * (memory, CPU, store size) are enforced by the builder's systemd unit and must
 * match these values. Initial values for testing, to be adjusted from measurement.
 */
export const BUILDER_LIMITS = Object.freeze({
  memoryMaxMb: 1536,
  cpuCores: 2,
  storeSizeGb: 30,
  // Admission, checked before the builder starts and before every build.
  hostReserveMb: 1024,
  minSwapFreeMb: 512,
  maxMemoryPressureSome60: 10,
  minDiskFreeGb: 20,
  minStoreFreeGb: 5,
  // Monitoring during a build: any breach cancels it.
  abortAvailableMb: 600,
  abortMemoryPressureFull10: 5,
  abortDiskFreeGb: 10,
  monitorIntervalMs: 5_000,
  // A build still running this long after its timeout gets the service killed.
  watchdogGraceMs: 60_000,
});

const DOCKER_DAEMON_SOCKETS = new Set(['unix:///var/run/docker.sock', 'unix:///run/docker.sock']);

/**
 * Whether a BuildKit address can be the isolated builder: its own Unix socket
 * or a TCP address, never the production Docker daemon or a Docker-hosted
 * builder container.
 */
export function isIsolatedBuilderEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 255) {
    return false;
  }
  if (DOCKER_DAEMON_SOCKETS.has(endpoint) || /docker\.sock$/.test(endpoint)) {
    return false;
  }
  return (
    /^unix:\/\/\/[A-Za-z0-9._/-]+$/.test(endpoint) ||
    /^tcp:\/\/[A-Za-z0-9.-]+:\d{1,5}$/.test(endpoint)
  );
}

export const BuilderRuntimeFamily = Object.freeze({
  NEXT: 'next',
  PYTHON: 'python',
  PHP: 'php',
  JAVA: 'java',
});

export const BUILDER_RUNTIME_FAMILIES = Object.freeze(Object.values(BuilderRuntimeFamily));

export const BUILDER_RUNTIME_LABELS = Object.freeze({
  next: 'Next.js',
  python: 'Python',
  php: 'PHP',
  java: 'Java',
});

/**
 * The runtime family a strategy builds with on the on-demand builder, or null
 * for builds that never use it (the legacy Node path and owner images).
 */
export function getBuilderRuntimeFamily(strategy) {
  if (isNextBuildStrategy(strategy)) {
    return BuilderRuntimeFamily.NEXT;
  }
  if (isPythonBuildStrategy(strategy)) {
    return BuilderRuntimeFamily.PYTHON;
  }
  if (isPhpBuildStrategy(strategy)) {
    return BuilderRuntimeFamily.PHP;
  }
  if (isJavaBuildStrategy(strategy)) {
    return BuilderRuntimeFamily.JAVA;
  }
  return null;
}

/** Every strategy that builds on the on-demand builder. */
export const BUILDER_BUILD_STRATEGIES = Object.freeze([
  ...NEXT_BUILD_STRATEGIES,
  ...PYTHON_BUILD_STRATEGIES,
  ...PHP_BUILD_STRATEGIES,
  ...JAVA_BUILD_STRATEGIES,
]);

/** Deployments of these strategies are refused while builder control is on. */
export function isOwnerImageStrategy(strategy) {
  return strategy === BuildStrategy.DOCKERFILE_V1 || strategy === BuildStrategy.OCI_IMAGE_V1;
}

/**
 * Normalize stored settings. Missing or malformed values fall back to the
 * closed default: every runtime off and no project allowed.
 */
export function normalizeBuilderSettings(value) {
  const idle = Number(value?.idleMinutes);
  const runtimes = {};
  for (const family of BUILDER_RUNTIME_FAMILIES) {
    const stored = value?.runtimes?.[family];
    runtimes[family] = {
      enabled: stored?.enabled === true,
      projectIds: Array.isArray(stored?.projectIds)
        ? [...new Set(stored.projectIds.map((id) => String(id).toLowerCase()))]
        : [],
    };
  }
  return {
    idleMinutes:
      Number.isInteger(idle) && idle >= MIN_BUILDER_IDLE_MINUTES && idle <= MAX_BUILDER_IDLE_MINUTES
        ? idle
        : DEFAULT_BUILDER_IDLE_MINUTES,
    runtimes,
  };
}

/**
 * Whether a status record is recent enough to act on. A missing or old record
 * means the worker is not reporting, so the builder counts as unavailable.
 */
export function isBuilderStatusFresh(status, now = Date.now()) {
  const updatedAt = Date.parse(status?.updatedAt ?? '');
  return Number.isFinite(updatedAt) && now - updatedAt <= BUILDER_STATUS_STALE_MS;
}

/**
 * Decide whether a deployment may use the on-demand builder. The caller has
 * already applied the environment pilot flag, which stays the upper limit;
 * these database permissions can only narrow it.
 *
 * @param {{ strategy: string|null|undefined, projectId: unknown, ownerRole: string|null|undefined,
 *   settings: ReturnType<typeof normalizeBuilderSettings> }} input
 * @returns {{ code: string, message: string } | null} null when allowed or not a builder build
 */
export function evaluateBuilderEligibility({ strategy, projectId, ownerRole, settings }) {
  if (isOwnerImageStrategy(strategy)) {
    return {
      code: 'BUILD_STRATEGY_DISABLED',
      message: 'Owner Dockerfiles and prebuilt images are disabled on this platform.',
    };
  }
  const family = getBuilderRuntimeFamily(strategy);
  if (!family) {
    return null;
  }
  // The same-host builder shares this server's kernel, so only repositories
  // owned by platform administrators may use it.
  if (ownerRole !== PlatformRole.ADMIN && ownerRole !== PlatformRole.SUPER_ADMIN) {
    return {
      code: 'BUILDER_PROJECT_NOT_ALLOWED',
      message: `${BUILDER_RUNTIME_LABELS[family]} builds are limited to projects owned by a platform administrator.`,
    };
  }
  const runtime = settings.runtimes[family];
  if (!runtime.enabled || !runtime.projectIds.includes(String(projectId ?? '').toLowerCase())) {
    return {
      code: 'BUILDER_PROJECT_NOT_ALLOWED',
      message: `An administrator has not allowed ${BUILDER_RUNTIME_LABELS[family]} builds for this project.`,
    };
  }
  return null;
}

/**
 * Compare a host resource sample with the admission thresholds.
 *
 * @param {HostResourceSample} sample
 * @returns {string[]} reasons the builder may not start or build; empty when admitted
 * @typedef {{ memAvailableMb: number, swapFreeMb: number, swapTotalMb: number,
 *   memoryPressureSome60: number, memoryPressureFull10: number, diskFreeGb: number,
 *   storeFreeGb: number|null }} HostResourceSample
 */
export function evaluateBuilderAdmission(sample) {
  const limits = BUILDER_LIMITS;
  const reasons = [];
  const neededMb = limits.memoryMaxMb + limits.hostReserveMb;
  if (!(sample.memAvailableMb >= neededMb)) {
    reasons.push(`Available memory is ${sample.memAvailableMb} MB; ${neededMb} MB is required.`);
  }
  if (sample.swapTotalMb > 0 && !(sample.swapFreeMb >= limits.minSwapFreeMb)) {
    reasons.push(`Free swap is ${sample.swapFreeMb} MB; ${limits.minSwapFreeMb} MB is required.`);
  }
  if (!(sample.memoryPressureSome60 < limits.maxMemoryPressureSome60)) {
    reasons.push(
      `Memory pressure is ${sample.memoryPressureSome60}%; it must be below ${limits.maxMemoryPressureSome60}%.`,
    );
  }
  if (!(sample.diskFreeGb >= limits.minDiskFreeGb)) {
    reasons.push(`Free disk is ${sample.diskFreeGb} GB; ${limits.minDiskFreeGb} GB is required.`);
  }
  if (sample.storeFreeGb === null || sample.storeFreeGb === undefined) {
    reasons.push('The build cache storage could not be read.');
  } else if (!(sample.storeFreeGb >= limits.minStoreFreeGb)) {
    reasons.push(
      `The build cache has ${sample.storeFreeGb} GB free; ${limits.minStoreFreeGb} GB is required.`,
    );
  }
  return reasons;
}

/**
 * Reasons to cancel a running build: the host is close to running out of
 * memory or disk, which would endanger the live applications.
 *
 * @param {HostResourceSample} sample
 * @returns {string[]}
 */
export function evaluateBuilderPressure(sample) {
  const limits = BUILDER_LIMITS;
  const reasons = [];
  if (!(sample.memAvailableMb >= limits.abortAvailableMb)) {
    reasons.push(
      `Available memory fell to ${sample.memAvailableMb} MB (minimum ${limits.abortAvailableMb} MB).`,
    );
  }
  if (!(sample.memoryPressureFull10 <= limits.abortMemoryPressureFull10)) {
    reasons.push(
      `Memory pressure reached ${sample.memoryPressureFull10}% (maximum ${limits.abortMemoryPressureFull10}%).`,
    );
  }
  if (!(sample.diskFreeGb >= limits.abortDiskFreeGb)) {
    reasons.push(
      `Free disk fell to ${sample.diskFreeGb} GB (minimum ${limits.abortDiskFreeGb} GB).`,
    );
  }
  return reasons;
}
