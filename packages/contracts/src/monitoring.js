/**
 * Admin operations monitoring contract shared by the web process (reader) and
 * the worker (collector). Everything here is pure: enums, defaults, the
 * metric envelope and the validators for personal preferences and the
 * platform-wide monitoring policy.
 *
 * A metric whose value is unknown carries `value: null` and a `reason`; it is
 * never reported as 0.
 */

export const MONITORING_SNAPSHOT_KEY = 'monitoring:snapshot';
export const MONITORING_SAMPLES_KEY = 'monitoring:samples';
export const MONITORING_LEASE_KEY = 'monitoring:collector:lease';
export const MONITORING_POLICY_KEY = 'monitoringPolicy';
export const ADMIN_OPS_EVENT_CHANNEL = 'admin-ops:events';
export const MONITORING_SNAPSHOT_SCHEMA = 1;
// Raw samples kept in Redis for the shortest history range: 1h at 15s.
export const MONITORING_RAW_SAMPLE_LIMIT = 240;

export const MetricScope = Object.freeze({
  HOST: 'host',
  PLATFORM: 'platform',
  PROJECT: 'project',
  CONTAINER: 'container',
  BUILDER: 'builder',
});

export const MetricFreshness = Object.freeze({
  FRESH: 'fresh',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
});

export const AppHealth = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  STARTING: 'starting',
  RESTARTING: 'restarting',
  STOPPED: 'stopped',
  MAINTENANCE: 'maintenance',
  UNKNOWN: 'unknown',
});

export const ServiceState = Object.freeze({
  OPERATIONAL: 'operational',
  DEGRADED: 'degraded',
  DOWN: 'down',
  DISABLED: 'disabled',
  UNSUPPORTED: 'unsupported',
  UNKNOWN: 'unknown',
});

export const ContainerRole = Object.freeze({
  ACTIVE: 'active',
  CANDIDATE: 'candidate',
  RETAINED: 'retained',
  // Labelled as HelloDeploy's but no deployment record claims it.
  ORPHANED: 'orphaned',
  BUILD: 'build',
  UNMANAGED: 'unmanaged',
});

export const IncidentSeverity = Object.freeze({
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
});

export const IncidentState = Object.freeze({
  ACTIVE: 'active',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
});

export const OPEN_INCIDENT_STATES = Object.freeze([
  IncidentState.ACTIVE,
  IncidentState.ACKNOWLEDGED,
]);

export const SampleResolution = Object.freeze({
  MINUTE: '1m',
  FIVE_MINUTES: '5m',
  HOUR: '1h',
  DAY: '1d',
});

export const RESOLUTION_SECONDS = Object.freeze({ '1m': 60, '5m': 300, '1h': 3600, '1d': 86_400 });

/** History range selector → window length and the tier that serves it. */
export const HISTORY_RANGES = Object.freeze({
  '15m': { seconds: 900, resolution: 'raw' },
  '1h': { seconds: 3600, resolution: '1m' },
  '6h': { seconds: 21_600, resolution: '5m' },
  '24h': { seconds: 86_400, resolution: '5m' },
  '7d': { seconds: 604_800, resolution: '1h' },
  '30d': { seconds: 2_592_000, resolution: '1d' },
});

// ─── Personal preferences ─────────────────────────────────────────────────────

export const DASHBOARD_DENSITIES = Object.freeze(['compact', 'comfortable', 'spacious']);
export const DASHBOARD_REFRESH_SECONDS = Object.freeze([0, 15, 30, 60, 120, 300]);
export const DASHBOARD_TABLE_ROWS = Object.freeze([10, 25, 50]);

/**
 * Panels an administrator may hide. Platform health, active incidents and the
 * KPI strip are deliberately absent: personalization must never hide them.
 */
export const OPTIONAL_DASHBOARD_WIDGETS = Object.freeze({
  trends: 'Resource trends',
  capacity: 'Capacity and allocation',
  apps: 'Applications',
  consumers: 'Resource consumers',
  deployments: 'Deployments and queue',
  services: 'Platform services',
  attention: 'Administrative attention',
  activity: 'Recent activity',
});

export const DASHBOARD_PREFERENCE_DEFAULTS = Object.freeze({
  sidebarCollapsed: false,
  density: 'compact',
  hiddenWidgets: Object.freeze([]),
  historyRange: '1h',
  refreshSeconds: 15,
  tableRows: 25,
});

/** Stored (possibly partial or legacy) preferences → complete, valid object. */
export function normalizeDashboardPreferences(stored) {
  const source = stored && typeof stored === 'object' ? stored : {};
  const defaults = DASHBOARD_PREFERENCE_DEFAULTS;
  return {
    sidebarCollapsed:
      typeof source.sidebarCollapsed === 'boolean'
        ? source.sidebarCollapsed
        : defaults.sidebarCollapsed,
    density: DASHBOARD_DENSITIES.includes(source.density) ? source.density : defaults.density,
    hiddenWidgets: Array.isArray(source.hiddenWidgets)
      ? [...new Set(source.hiddenWidgets.filter((key) => key in OPTIONAL_DASHBOARD_WIDGETS))]
      : [],
    historyRange:
      source.historyRange in HISTORY_RANGES ? source.historyRange : defaults.historyRange,
    refreshSeconds: DASHBOARD_REFRESH_SECONDS.includes(source.refreshSeconds)
      ? source.refreshSeconds
      : defaults.refreshSeconds,
    tableRows: DASHBOARD_TABLE_ROWS.includes(source.tableRows)
      ? source.tableRows
      : defaults.tableRows,
  };
}

/**
 * Validate a submitted preferences form (strings from urlencoded bodies or
 * typed JSON). Unknown values are rejected, not silently replaced, so the
 * administrator sees why a save did not take effect.
 */
export function validateDashboardPreferencesInput(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const density = String(body.density ?? '');
  if (!DASHBOARD_DENSITIES.includes(density)) {
    errors.density = 'Choose Compact, Comfortable or Spacious.';
  }
  const historyRange = String(body.historyRange ?? '');
  if (!(historyRange in HISTORY_RANGES)) {
    errors.historyRange = 'Choose one of the listed history ranges.';
  }
  const refreshSeconds = Number(body.refreshSeconds);
  if (!DASHBOARD_REFRESH_SECONDS.includes(refreshSeconds)) {
    errors.refreshSeconds = 'Choose one of the listed refresh intervals.';
  }
  const tableRows = Number(body.tableRows);
  if (!DASHBOARD_TABLE_ROWS.includes(tableRows)) {
    errors.tableRows = 'Choose 10, 25 or 50 rows.';
  }
  const rawVisible = body.visibleWidgets ?? [];
  const visible = (Array.isArray(rawVisible) ? rawVisible : [rawVisible]).map(String);
  if (visible.some((key) => !(key in OPTIONAL_DASHBOARD_WIDGETS))) {
    errors.visibleWidgets = 'One of the selected panels does not exist.';
  }
  const sidebarCollapsed = toBoolean(body.sidebarCollapsed);

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      sidebarCollapsed,
      density,
      hiddenWidgets: Object.keys(OPTIONAL_DASHBOARD_WIDGETS).filter(
        (key) => !visible.includes(key),
      ),
      historyRange,
      refreshSeconds,
      tableRows,
    },
  };
}

// ─── Platform monitoring policy ───────────────────────────────────────────────

/**
 * Hard limits enforced on every save. They bound collector cost and storage
 * growth regardless of what an administrator asks for.
 */
export const MONITORING_POLICY_LIMITS = Object.freeze({
  intervals: Object.freeze({
    resourceSeconds: Object.freeze({ min: 10, max: 300 }),
    diskSeconds: Object.freeze({ min: 15, max: 900 }),
    serviceSeconds: Object.freeze({ min: 15, max: 900 }),
    probeSeconds: Object.freeze({ min: 15, max: 900 }),
  }),
  percent: Object.freeze({ min: 1, max: 100 }),
  sustainSeconds: Object.freeze({ min: 0, max: 3600 }),
  probeCount: Object.freeze({ min: 1, max: 10 }),
  pressure: Object.freeze({ min: 0, max: 100 }),
  retention: Object.freeze({
    minuteHours: Object.freeze({ min: 1, max: 48 }),
    fiveMinuteDays: Object.freeze({ min: 1, max: 14 }),
    hourlyDays: Object.freeze({ min: 7, max: 60 }),
    dailyDays: Object.freeze({ min: 30, max: 180 }),
  }),
  reservePercent: Object.freeze({ min: 0, max: 50 }),
  muteMaxSeconds: 7 * 86_400,
});

export const THRESHOLD_RULES = Object.freeze({
  cpu: 'Host CPU',
  memory: 'Host memory',
  disk: 'Disk usage',
  containerMemory: 'Container memory (of its limit)',
});

export const OPTIONAL_COLLECTORS = Object.freeze({
  containerStats: 'Per-container CPU and memory (one docker stats call per cycle)',
  appProbes: 'Application HTTP health probes on the loopback port',
  dockerDiskUsage:
    'Docker images, build cache and volumes (docker system df, every 30 min, in the background)',
  nginxValidate: 'Nginx configuration validation through the route helper (every 5 min)',
  publicReachability: 'Public HTTPS reachability of each project subdomain',
});

export const MONITORING_POLICY_DEFAULTS = Object.freeze({
  revision: 0,
  intervals: Object.freeze({
    resourceSeconds: 15,
    diskSeconds: 30,
    serviceSeconds: 30,
    probeSeconds: 30,
  }),
  thresholds: Object.freeze({
    cpu: Object.freeze({ warning: 80, critical: 95, clear: 70, sustainSeconds: 300 }),
    memory: Object.freeze({ warning: 80, critical: 90, clear: 75, sustainSeconds: 300 }),
    disk: Object.freeze({ warning: 80, critical: 90, clear: 75, sustainSeconds: 60 }),
    containerMemory: Object.freeze({ warning: 80, critical: 95, clear: 70, sustainSeconds: 300 }),
  }),
  // Memory is only critical with pressure evidence (PSI some avg60, %), when
  // the kernel exposes it.
  memoryPressureCritical: 10,
  probes: Object.freeze({ failuresBeforeUnhealthy: 3, successesBeforeHealthy: 2 }),
  retention: Object.freeze({ minuteHours: 24, fiveMinuteDays: 7, hourlyDays: 30, dailyDays: 90 }),
  capacity: Object.freeze({
    memoryReservePercent: 15,
    cpuReservePercent: 10,
    diskReservePercent: 15,
  }),
  collectors: Object.freeze({
    containerStats: true,
    appProbes: true,
    dockerDiskUsage: true,
    nginxValidate: true,
    publicReachability: false,
  }),
  notifications: Object.freeze({ muteUntil: null, muteReason: '' }),
});

function clampInt(value, { min, max }, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

/** Stored policy → complete policy; any invalid stored field falls back to its default. */
export function normalizeMonitoringPolicy(stored) {
  const source = stored && typeof stored === 'object' ? stored : {};
  const d = MONITORING_POLICY_DEFAULTS;
  const L = MONITORING_POLICY_LIMITS;
  const intervals = {};
  for (const [key, limit] of Object.entries(L.intervals)) {
    intervals[key] = clampInt(source.intervals?.[key], limit, d.intervals[key]);
  }
  const thresholds = {};
  for (const rule of Object.keys(THRESHOLD_RULES)) {
    const candidate = {
      warning: clampInt(source.thresholds?.[rule]?.warning, L.percent, d.thresholds[rule].warning),
      critical: clampInt(
        source.thresholds?.[rule]?.critical,
        L.percent,
        d.thresholds[rule].critical,
      ),
      clear: clampInt(source.thresholds?.[rule]?.clear, L.percent, d.thresholds[rule].clear),
      sustainSeconds: clampInt(
        source.thresholds?.[rule]?.sustainSeconds,
        L.sustainSeconds,
        d.thresholds[rule].sustainSeconds,
      ),
    };
    thresholds[rule] =
      candidate.clear < candidate.warning && candidate.warning < candidate.critical
        ? candidate
        : { ...d.thresholds[rule] };
  }
  const retention = {};
  for (const [key, limit] of Object.entries(L.retention)) {
    retention[key] = clampInt(source.retention?.[key], limit, d.retention[key]);
  }
  const capacity = {};
  for (const key of Object.keys(d.capacity)) {
    capacity[key] = clampInt(source.capacity?.[key], L.reservePercent, d.capacity[key]);
  }
  const collectors = {};
  for (const key of Object.keys(OPTIONAL_COLLECTORS)) {
    collectors[key] =
      typeof source.collectors?.[key] === 'boolean' ? source.collectors[key] : d.collectors[key];
  }
  const muteUntil = source.notifications?.muteUntil
    ? new Date(source.notifications.muteUntil)
    : null;
  return {
    revision: Number.isInteger(source.revision) && source.revision >= 0 ? source.revision : 0,
    intervals,
    thresholds,
    memoryPressureCritical: clampInt(
      source.memoryPressureCritical,
      L.pressure,
      d.memoryPressureCritical,
    ),
    probes: {
      failuresBeforeUnhealthy: clampInt(
        source.probes?.failuresBeforeUnhealthy,
        L.probeCount,
        d.probes.failuresBeforeUnhealthy,
      ),
      successesBeforeHealthy: clampInt(
        source.probes?.successesBeforeHealthy,
        L.probeCount,
        d.probes.successesBeforeHealthy,
      ),
    },
    retention,
    capacity,
    collectors,
    notifications: {
      muteUntil: muteUntil && !Number.isNaN(muteUntil.getTime()) ? muteUntil.toISOString() : null,
      muteReason: String(source.notifications?.muteReason ?? '').slice(0, 200),
    },
  };
}

function readInt(errors, field, raw, { min, max }, label) {
  const text = String(raw ?? '').trim();
  const value = Number(text);
  if (text === '' || !Number.isInteger(value)) {
    errors[field] = `${label} must be a whole number.`;
    return null;
  }
  if (value < min || value > max) {
    errors[field] = `${label} must be between ${min} and ${max}.`;
    return null;
  }
  return value;
}

/**
 * Validate a submitted platform policy form. Field names are flat
 * (`thresholds.cpu.warning`) because they come from an HTML form.
 *
 * @returns {{ok: true, value: object} | {ok: false, errors: Record<string,string>}}
 */
export function validateMonitoringPolicyInput(input, { now = new Date(), current = null } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const L = MONITORING_POLICY_LIMITS;
  const errors = {};
  const intervals = {};
  const intervalLabels = {
    resourceSeconds: 'CPU, memory, network and container interval',
    diskSeconds: 'Disk interval',
    serviceSeconds: 'Service check interval',
    probeSeconds: 'Application probe interval',
  };
  for (const [key, limit] of Object.entries(L.intervals)) {
    intervals[key] = readInt(
      errors,
      `intervals.${key}`,
      body[`intervals.${key}`],
      limit,
      intervalLabels[key],
    );
  }

  const thresholds = {};
  for (const [rule, label] of Object.entries(THRESHOLD_RULES)) {
    const warning = readInt(
      errors,
      `thresholds.${rule}.warning`,
      body[`thresholds.${rule}.warning`],
      L.percent,
      `${label} warning`,
    );
    const critical = readInt(
      errors,
      `thresholds.${rule}.critical`,
      body[`thresholds.${rule}.critical`],
      L.percent,
      `${label} critical`,
    );
    const clear = readInt(
      errors,
      `thresholds.${rule}.clear`,
      body[`thresholds.${rule}.clear`],
      L.percent,
      `${label} recovery`,
    );
    const sustainSeconds = readInt(
      errors,
      `thresholds.${rule}.sustainSeconds`,
      body[`thresholds.${rule}.sustainSeconds`],
      L.sustainSeconds,
      `${label} duration`,
    );
    if (warning !== null && critical !== null && warning >= critical) {
      errors[`thresholds.${rule}.warning`] = `${label} warning must be lower than critical.`;
    }
    if (clear !== null && warning !== null && clear >= warning) {
      errors[`thresholds.${rule}.clear`] =
        `${label} recovery must be lower than warning, so an alert cannot flap.`;
    }
    thresholds[rule] = { warning, critical, clear, sustainSeconds };
  }

  const memoryPressureCritical = readInt(
    errors,
    'memoryPressureCritical',
    body.memoryPressureCritical,
    L.pressure,
    'Memory pressure for critical',
  );
  const probes = {
    failuresBeforeUnhealthy: readInt(
      errors,
      'probes.failuresBeforeUnhealthy',
      body['probes.failuresBeforeUnhealthy'],
      L.probeCount,
      'Failed probes before Unhealthy',
    ),
    successesBeforeHealthy: readInt(
      errors,
      'probes.successesBeforeHealthy',
      body['probes.successesBeforeHealthy'],
      L.probeCount,
      'Passing probes before Healthy',
    ),
  };

  const retentionLabels = {
    minuteHours: '1-minute history (hours)',
    fiveMinuteDays: '5-minute history (days)',
    hourlyDays: 'Hourly history (days)',
    dailyDays: 'Daily history (days)',
  };
  const retention = {};
  for (const [key, limit] of Object.entries(L.retention)) {
    retention[key] = readInt(
      errors,
      `retention.${key}`,
      body[`retention.${key}`],
      limit,
      retentionLabels[key],
    );
  }
  if (
    retention.fiveMinuteDays !== null &&
    retention.hourlyDays !== null &&
    retention.dailyDays !== null &&
    !(
      retention.fiveMinuteDays <= retention.hourlyDays &&
      retention.hourlyDays <= retention.dailyDays
    )
  ) {
    errors['retention.hourlyDays'] =
      'Coarser history must be kept at least as long as finer history.';
  }

  const capacity = {};
  for (const key of Object.keys(MONITORING_POLICY_DEFAULTS.capacity)) {
    capacity[key] = readInt(
      errors,
      `capacity.${key}`,
      body[`capacity.${key}`],
      L.reservePercent,
      'Capacity reserve',
    );
  }

  const collectors = {};
  for (const key of Object.keys(OPTIONAL_COLLECTORS)) {
    collectors[key] = toBoolean(body[`collectors.${key}`]);
  }

  // '' keeps the current mute, '0' ends it, a number of minutes starts a new one.
  const currentMute = current?.notifications?.muteUntil
    ? new Date(current.notifications.muteUntil)
    : null;
  let muteUntil = currentMute && currentMute > now ? currentMute.toISOString() : null;
  let muteReason = muteUntil ? (current?.notifications?.muteReason ?? '') : '';
  const muteMinutesRaw = String(body['notifications.muteMinutes'] ?? '').trim();
  if (muteMinutesRaw === '0') {
    muteUntil = null;
  } else if (muteMinutesRaw !== '') {
    const minutes = readInt(
      errors,
      'notifications.muteMinutes',
      muteMinutesRaw,
      { min: 1, max: L.muteMaxSeconds / 60 },
      'Notification mute',
    );
    if (minutes !== null) {
      muteUntil = new Date(now.getTime() + minutes * 60_000).toISOString();
    }
  }
  if (body['notifications.muteReason'] !== undefined) {
    muteReason = String(body['notifications.muteReason']).trim().slice(0, 200);
  }

  const revision = Number(body.revision);
  if (!Number.isInteger(revision) || revision < 0) {
    errors.revision = 'The form is out of date. Reload the page and try again.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: {
      revision,
      intervals,
      thresholds,
      memoryPressureCritical,
      probes,
      retention,
      capacity,
      collectors,
      notifications: { muteUntil, muteReason: muteUntil ? muteReason : '' },
    },
  };
}

/**
 * Keys whose values differ between two normalized policies, flattened, for an
 * audit record that shows what changed without repeating the whole policy.
 */
export function diffMonitoringPolicy(before, after) {
  const changes = {};
  const walk = (a, b, prefix) => {
    for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
      if (key === 'revision') {
        continue;
      }
      const path = prefix ? `${prefix}.${key}` : key;
      const left = a?.[key];
      const right = b?.[key];
      if (left && right && typeof left === 'object' && typeof right === 'object') {
        walk(left, right, path);
      } else if (left !== right) {
        changes[path] = { from: left ?? null, to: right ?? null };
      }
    }
  };
  walk(before, after, '');
  return changes;
}

export function isNotificationMuted(policy, now = new Date()) {
  const until = policy?.notifications?.muteUntil;
  return Boolean(until) && new Date(until) > now;
}

// ─── Metric envelope ──────────────────────────────────────────────────────────

/**
 * Build one metric reading. `value` must be a finite number or null; anything
 * else becomes null with a reason, so a parsing bug can never surface as 0.
 */
export function createMetric({ key, value, unit, scope, source, collectedAt, reason }) {
  const isValid = typeof value === 'number' && Number.isFinite(value);
  return {
    key,
    value: isValid ? value : null,
    unit,
    scope,
    source,
    collectedAt: collectedAt ?? null,
    freshness: isValid ? MetricFreshness.FRESH : MetricFreshness.UNAVAILABLE,
    ...(isValid ? {} : { reason: reason ?? 'No reading' }),
  };
}

/**
 * Freshness of a reading as seen by a reader at `now`: stale once it is older
 * than twice its collection interval.
 */
export function getFreshness(collectedAt, intervalSeconds, now = Date.now()) {
  if (!collectedAt) {
    return MetricFreshness.UNAVAILABLE;
  }
  const age = now - new Date(collectedAt).getTime();
  if (!Number.isFinite(age)) {
    return MetricFreshness.UNAVAILABLE;
  }
  return age > intervalSeconds * 2000 ? MetricFreshness.STALE : MetricFreshness.FRESH;
}

function toBoolean(raw) {
  const value = Array.isArray(raw) ? raw[raw.length - 1] : raw;
  return value === true || value === 'true' || value === 'on' || value === '1';
}
