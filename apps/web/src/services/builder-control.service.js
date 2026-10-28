import {
  AuditOutcome,
  BUILDER_BUILD_STRATEGIES,
  BUILDER_RUNTIME_FAMILIES,
  BUILDER_SETTINGS_KEY,
  BUILDER_STATUS_KEY,
  BuilderControlAction,
  BuilderState,
  DeploymentStatus,
  MAX_BUILDER_IDLE_MINUTES,
  MIN_BUILDER_IDLE_MINUTES,
  PlatformRole,
  evaluateBuilderEligibility,
  getBuilderRuntimeFamily,
  isBuilderStatusFresh,
  isOwnerImageStrategy,
  normalizeBuilderSettings,
} from '@hellodeploy/contracts';
import { AuditEvent, Deployment, PlatformSetting, Project, User } from '@hellodeploy/database';
import { logger, writeAuditEvent } from '@hellodeploy/observability';

import { env } from '../config/env.js';
import { getBuilderControlQueue, getRedisConnection } from '../queue/client.js';

/**
 * The web side of the on-demand builder. The web never runs Docker or systemd
 * and holds no builder or registry credential: it reads the status the worker
 * publishes, stores super-admin settings, and queues control requests that the
 * worker re-authorizes before acting.
 */

const LIFECYCLE_ACTIONS = new Set([
  BuilderControlAction.START,
  BuilderControlAction.STOP,
  BuilderControlAction.EMERGENCY_STOP,
]);

/**
 * The latest status the worker published, or null when Redis is unavailable or
 * nothing was published. `isFresh` is false when the worker stopped reporting.
 */
export async function getBuilderStatus(redis = getRedisConnection(), now = Date.now()) {
  if (!redis || redis.status !== 'ready') {
    return { status: null, isFresh: false };
  }
  try {
    const raw = await redis.get(BUILDER_STATUS_KEY);
    const status = raw ? JSON.parse(raw) : null;
    return { status, isFresh: isBuilderStatusFresh(status, now) };
  } catch (error) {
    logger.warn('Builder control: status could not be read', { error: error.message });
    return { status: null, isFresh: false };
  }
}

export async function getBuilderSettings() {
  const setting = await PlatformSetting.findOne({ key: BUILDER_SETTINGS_KEY }).lean();
  return normalizeBuilderSettings(setting?.value);
}

/** What the environment allows per runtime: the upper limit for every setting. */
export function getBuilderPermissionCeiling(pilots = env.builderPilots) {
  return Object.fromEntries(
    BUILDER_RUNTIME_FAMILIES.map((family) => [
      family,
      {
        enabled: Boolean(pilots[family]?.enabled),
        projectIds: [...(pilots[family]?.projectIds ?? [])],
      },
    ]),
  );
}

/**
 * Save the idle shutdown and per-runtime permissions. Permissions can only
 * narrow the environment: a runtime whose flag is off cannot be enabled, and a
 * project outside its environment allowlist cannot be added.
 */
export async function updateBuilderSettings({
  idleMinutes,
  runtimes,
  adminId,
  adminRole,
  sourceIp,
  correlationId,
  ceiling = getBuilderPermissionCeiling(),
}) {
  if (adminRole !== PlatformRole.SUPER_ADMIN) {
    return {
      success: false,
      error: 'Only a super administrator can change build service settings.',
    };
  }
  const idle = Number(idleMinutes);
  if (
    !Number.isInteger(idle) ||
    idle < MIN_BUILDER_IDLE_MINUTES ||
    idle > MAX_BUILDER_IDLE_MINUTES
  ) {
    return {
      success: false,
      error: `Idle shutdown must be a whole number of minutes from ${MIN_BUILDER_IDLE_MINUTES} to ${MAX_BUILDER_IDLE_MINUTES}.`,
    };
  }
  const value = { idleMinutes: idle, runtimes: {} };
  for (const family of BUILDER_RUNTIME_FAMILIES) {
    const requested = runtimes?.[family] ?? {};
    const enabled = requested.enabled === true;
    const projectIds = [
      ...new Set((requested.projectIds ?? []).map((id) => String(id).toLowerCase())),
    ];
    if (enabled && !ceiling[family].enabled) {
      return {
        success: false,
        error: `The ${family} runtime is off in the server configuration, so it cannot be enabled here.`,
      };
    }
    if (projectIds.some((id) => !ceiling[family].projectIds.includes(id))) {
      return {
        success: false,
        error: `Only projects in the server's ${family} allowlist can be allowed here.`,
      };
    }
    value.runtimes[family] = { enabled, projectIds };
  }
  await PlatformSetting.findOneAndUpdate(
    { key: BUILDER_SETTINGS_KEY },
    { $set: { value, updatedBy: adminId } },
    { upsert: true, setDefaultsOnInsert: true },
  );
  await writeAuditEvent({
    action: 'admin.builder_settings_updated',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'platform_setting',
    targetId: BUILDER_SETTINGS_KEY,
    sourceIp,
    correlationId,
    metadata: {
      idleMinutes: idle,
      runtimes: Object.fromEntries(
        BUILDER_RUNTIME_FAMILIES.map((family) => [
          family,
          {
            enabled: value.runtimes[family].enabled,
            projectCount: value.runtimes[family].projectIds.length,
          },
        ]),
      ),
    },
  });
  return { success: true };
}

/**
 * Queue a control request for the worker. Start, Stop and Emergency Stop need
 * a super administrator; the registry check is open to every administrator.
 */
export async function requestBuilderAction({
  action,
  adminId,
  adminRole,
  sourceIp,
  correlationId,
  queue = getBuilderControlQueue(),
}) {
  if (!Object.values(BuilderControlAction).includes(action)) {
    return { success: false, error: 'Unknown build service action.' };
  }
  const isSuperAdmin = adminRole === PlatformRole.SUPER_ADMIN;
  if (
    (LIFECYCLE_ACTIONS.has(action) && !isSuperAdmin) ||
    (!isSuperAdmin && adminRole !== PlatformRole.ADMIN)
  ) {
    await writeAuditEvent({
      action: `admin.builder_${toAuditVerb(action)}_requested`,
      outcome: AuditOutcome.DENIED,
      actorId: adminId,
      actorRole: adminRole,
      targetType: 'builder',
      sourceIp,
      correlationId,
    });
    return {
      success: false,
      error: 'Only a super administrator can start or stop the build service.',
    };
  }
  if (!queue) {
    return {
      success: false,
      error: 'The build service cannot be reached right now (queue unavailable).',
    };
  }
  await queue.add(action, {
    action,
    actorId: String(adminId),
    actorRole: adminRole,
    requestedAt: new Date().toISOString(),
  });
  await writeAuditEvent({
    action: `admin.builder_${toAuditVerb(action)}_requested`,
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'builder',
    sourceIp,
    correlationId,
  });
  return { success: true };
}

/**
 * The owner-facing reason a deployment cannot use the on-demand builder right
 * now, or null. Called before a deployment is queued, so a refused build never
 * reaches the deployment queue and never waits in front of a Node deployment.
 */
export async function checkBuilderDeploymentGate(
  project,
  {
    isEnabled = env.BUILDER_CONTROL_ENABLED,
    loadOwnerRole = async (ownerId) =>
      (await User.findById(ownerId).select('platformRole').lean())?.platformRole ?? null,
    loadSettings = getBuilderSettings,
    loadStatus = () => getBuilderStatus(),
  } = {},
) {
  const strategy = project.buildStrategy;
  if (!isEnabled || (!getBuilderRuntimeFamily(strategy) && !isOwnerImageStrategy(strategy))) {
    return null;
  }
  const [ownerRole, settings] = await Promise.all([loadOwnerRole(project.ownerId), loadSettings()]);
  const refusal = evaluateBuilderEligibility({
    strategy,
    projectId: project._id,
    ownerRole,
    settings,
  });
  if (refusal) {
    return refusal.message;
  }
  const { status, isFresh } = await loadStatus();
  if (!isFresh || ![BuilderState.READY, BuilderState.BUILDING].includes(status?.state)) {
    return 'The build service for this runtime is turned off. Ask a platform administrator to start it, then deploy again.';
  }
  return null;
}

/** Everything the builder page shows, with one page of the activity history. */
export async function getBuilderPageData({ activityPage = 1, activityLimit = 25 } = {}) {
  const ceiling = getBuilderPermissionCeiling();
  const allowlistedIds = [
    ...new Set(BUILDER_RUNTIME_FAMILIES.flatMap((family) => ceiling[family].projectIds)),
  ];
  const activityFilter = { action: { $regex: /^(admin\.builder_|builder\.)/ } };
  const [{ status, isFresh }, settings, builds, activity, activityTotal, projects] =
    await Promise.all([
      getBuilderStatus(),
      getBuilderSettings(),
      Deployment.find({
        status: {
          $in: [DeploymentStatus.QUEUED, DeploymentStatus.VALIDATING, DeploymentStatus.BUILDING],
        },
        'configurationSnapshot.buildStrategy': { $in: BUILDER_BUILD_STRATEGIES },
      })
        .sort({ createdAt: 1 })
        .limit(20)
        .select('projectId status sequenceNumber createdAt configurationSnapshot.buildStrategy')
        .populate('projectId', 'name slug')
        .lean(),
      AuditEvent.find(activityFilter)
        .sort({ createdAt: -1 })
        .skip((activityPage - 1) * activityLimit)
        .limit(activityLimit)
        .select('action outcome actorId actorRole createdAt metadata')
        .lean(),
      AuditEvent.countDocuments(activityFilter),
      allowlistedIds.length > 0
        ? Project.find({ _id: { $in: allowlistedIds } })
            .select('name slug ownerId')
            .populate('ownerId', 'platformRole')
            .lean()
        : [],
    ]);
  return {
    status,
    isFresh,
    settings,
    ceiling,
    builds,
    activity,
    activityPage,
    activityTotalPages: Math.max(1, Math.ceil(activityTotal / activityLimit)),
    projectsById: Object.fromEntries(
      projects.map((project) => [
        String(project._id),
        {
          name: project.name,
          slug: project.slug,
          isAdminOwned: [PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN].includes(
            project.ownerId?.platformRole,
          ),
        },
      ]),
    ),
  };
}

function toAuditVerb(action) {
  return action.replaceAll('-', '_');
}

const STATE_PRESENTATION = Object.freeze({
  [BuilderState.STOPPED]: { label: 'Stopped', badge: 'badge--neutral' },
  [BuilderState.STARTING]: { label: 'Starting', badge: 'badge--warning' },
  [BuilderState.READY]: { label: 'Ready', badge: 'badge--success' },
  [BuilderState.BUILDING]: { label: 'Building', badge: 'badge--warning' },
  [BuilderState.STOPPING]: { label: 'Stopping', badge: 'badge--warning' },
  [BuilderState.FAILED]: { label: 'Failed', badge: 'badge--danger' },
});

function formatTime(value) {
  return value ? new Date(value).toLocaleString('en-GB') : '—';
}

function withUnit(value, unit) {
  return value === null || value === undefined || Number.isNaN(value)
    ? 'Unavailable'
    : `${value} ${unit}`;
}

/**
 * The text the Build Service page shows for a status record. The page renders
 * it and its live updates reuse it, so the two never disagree.
 */
export function presentBuilderStatus({ status, isFresh, idleMinutes }) {
  const state = (isFresh && STATE_PRESENTATION[status?.state]) || {
    label: 'Not reporting',
    badge: 'badge--danger',
  };
  const resources = status?.resources ?? null;
  const limits = status?.limits ?? null;
  const registry = status?.registry ?? null;
  const fields = {
    lastError: status?.lastError ?? '',
    runningSince: formatTime(status?.startedAt),
    idleShutdown: `After ${idleMinutes} minutes without a build${status?.idleStopAt ? ` (next: ${formatTime(status.idleStopAt)})` : ''}. A running build is never stopped by idle shutdown.`,
    activeBuild: status?.activeBuild
      ? `Deployment ${status.activeBuild.deploymentId}, started ${formatTime(status.activeBuild.startedAt)}`
      : 'None',
    reported: formatTime(status?.updatedAt),
    registryDetail: registry
      ? `Checked ${formatTime(registry.checkedAt)}.${registry.error ? ` ${registry.error}` : ''}`
      : '',
  };
  if (resources && limits) {
    Object.assign(fields, {
      memAvailable: `${withUnit(resources.memAvailableMb, 'MB')} (a start or build needs ${limits.memoryMaxMb + limits.hostReserveMb} MB)`,
      swap: `${resources.swapFreeMb} of ${resources.swapTotalMb} MB (needs ${limits.minSwapFreeMb} MB)`,
      pressure: `${resources.memoryPressureSome60}% (must be below ${limits.maxMemoryPressureSome60}%)`,
      appPressure: `${withUnit(resources.appMemoryPressureFull10, '%').replace(' %', '%')} (a build is cancelled above ${limits.abortAppMemoryPressureFull10}%)`,
      disk: `${withUnit(resources.diskFreeGb, 'GB')} (needs ${limits.minDiskFreeGb} GB)`,
      store: `${withUnit(resources.storeFreeGb, 'GB')} (needs ${limits.minStoreFreeGb} GB)`,
      builderMemory: `${resources.builderMemoryMb ?? '—'}${resources.builderMemoryMb === null || resources.builderMemoryMb === undefined ? '' : ' MB'} of ${limits.memoryMaxMb} MB`,
      readAt: formatTime(resources.sampledAt),
    });
  }
  return {
    state,
    registry: registry
      ? registry.ok
        ? { label: 'Reachable', badge: 'badge--success' }
        : { label: 'Unreachable', badge: 'badge--danger' }
      : { label: 'Not checked', badge: 'badge--neutral' },
    fields,
    show: {
      notReporting: !isFresh,
      lastError: Boolean(status?.lastError),
      resources: Boolean(resources && limits),
      noResources: !(resources && limits),
      registryDetail: Boolean(registry),
    },
    limits,
  };
}

/** The live part of the Build Service page, for its polling. */
export async function getBuilderLiveStatus() {
  const [{ status, isFresh }, settings] = await Promise.all([
    getBuilderStatus(),
    getBuilderSettings(),
  ]);
  return presentBuilderStatus({ status, isFresh, idleMinutes: settings.idleMinutes });
}
