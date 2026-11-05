import {
  AppHealth,
  ContainerRole,
  HISTORY_RANGES,
  MetricFreshness,
  ServiceState,
} from '@hellodeploy/contracts';

import { User } from '@hellodeploy/database';

import { env } from '../../config/env.js';
import { getAdminOverview } from '../admin.service.js';
import { toActionLabel } from '../audit-search.service.js';
import { getBuilderStatus } from '../builder-control.service.js';
import { collectServerStats } from '../server-stats.service.js';
import { buildCapacity } from './capacity.js';
import { buildLineChart, buildSparkline } from './charts.js';
import { getDeploymentActivity } from './deployments.service.js';
import { getHistory } from './history.service.js';
import { listOpenIncidents, listRecentlyResolved } from './incidents.service.js';
import {
  formatBitRate,
  formatBytes,
  formatDuration,
  formatPercent,
  toneForPercent,
} from './format.js';
import { getMonitoringSnapshot, getRawSamples, metricValue } from './snapshot.service.js';

const ROLE_LABEL = {
  [ContainerRole.ACTIVE]: 'Live release',
  [ContainerRole.CANDIDATE]: 'Candidate',
  [ContainerRole.RETAINED]: 'Retained release',
  [ContainerRole.ORPHANED]: 'Orphaned',
  [ContainerRole.BUILD]: 'Build',
};

/**
 * Admin operations overview view model. Each panel is built from its own
 * source and degrades on its own: one failed source makes that panel
 * Unavailable, never the whole page, and never a misleading zero.
 */
export async function buildOverview({ policy, preferences, deps = {} } = {}) {
  const loadCounts = deps.getAdminOverview ?? getAdminOverview;
  const loadServer = deps.collectServerStats ?? collectServerStats;
  const loadSnapshot = deps.getMonitoringSnapshot ?? getMonitoringSnapshot;
  const loadSamples = deps.getRawSamples ?? getRawSamples;
  const loadDeployments = deps.getDeploymentActivity ?? getDeploymentActivity;
  const loadBuilder = deps.getBuilderStatus ?? getBuilderStatus;
  const loadOpen = deps.listOpenIncidents ?? listOpenIncidents;
  const loadResolved = deps.listRecentlyResolved ?? listRecentlyResolved;
  const loadHistory = deps.getHistory ?? getHistory;
  const loadClosures = deps.getPendingClosures ?? getPendingClosures;
  const builderEnabled = deps.builderControlEnabled ?? env.BUILDER_CONTROL_ENABLED;
  const now = deps.now ?? new Date();
  const rangeKey = preferences?.historyRange ?? '1h';
  const [
    counts,
    server,
    monitoring,
    samples,
    activity,
    builderStatus,
    open,
    resolved,
    history,
    closures,
  ] = await Promise.all([
    settle(loadCounts()),
    settle(loadServer()),
    settle(loadSnapshot()),
    settle(loadSamples()),
    settle(loadDeployments({ now })),
    builderEnabled ? settle(loadBuilder()) : Promise.resolve(null),
    settle(loadOpen()),
    settle(loadResolved({ now })),
    settle(loadHistory(rangeKey, { now })),
    settle(loadClosures()),
  ]);
  const snapshotState = monitoring ?? {
    snapshot: null,
    freshness: MetricFreshness.UNAVAILABLE,
    reason: 'Snapshot read failed',
  };
  const snapshot = snapshotState.snapshot;
  const rawSamples = samples ?? [];

  const services = buildServices(server, snapshotState);
  const deployments = buildDeployments(server, activity);
  const apps = buildApps(snapshotState, preferences);
  const builder = buildBuilder({ builderEnabled, builderStatus, snapshot });
  const capacity = buildCapacity(snapshotState, policy);

  return {
    generatedAt: now.toISOString(),
    status: overallStatus({ services, snapshotState }),
    monitoring: {
      freshness: snapshotState.freshness,
      collectedAt: snapshot?.collectedAt ?? null,
      ageSeconds: snapshotState.ageSeconds ?? null,
      reason: snapshotState.reason,
      durationMs: snapshot?.durationMs ?? null,
    },
    kpis: buildKpis({ server, deployments, policy, snapshotState, rawSamples, apps }),
    incidents: open ?? [],
    // Rules run in the worker with the collector: without a fresh snapshot,
    // "no incidents" cannot be confirmed.
    incidentsAvailable: open !== null && snapshotState.freshness === MetricFreshness.FRESH,
    incidentsStored: open !== null,
    resolvedIncidents: resolved ?? [],
    trends: buildTrends({ rawSamples, preferences, snapshot, now, history }),
    consumers: buildConsumers(snapshotState, preferences),
    apps,
    services,
    builder,
    deployments,
    capacity,
    attention: buildAttention({
      counts,
      server,
      apps,
      deployments,
      snapshotState,
      capacity,
      closures,
      incidents: open ?? [],
      now,
    }),
    counts: counts ?? null,
    activity: buildActivity({ counts, deployments }),
    release: server?.platformRelease ?? null,
  };
}

async function settle(promise) {
  try {
    return await promise;
  } catch {
    return null;
  }
}

function buildKpis({ server, deployments, policy, snapshotState, rawSamples, apps }) {
  const snapshot = snapshotState.snapshot;
  const stale = snapshotState.freshness === MetricFreshness.STALE;
  const thresholds = policy?.thresholds;
  const recent = rawSamples.slice(-40);
  const collectorSource = stale ? 'Worker collector · stale' : 'Worker collector';
  const collectedAt = snapshot?.collectedAt ?? null;
  const toneFor = (value, rule) => (stale ? 'unknown' : toneForPercent(value, rule));
  const unavailable = (key, label, detail) => ({
    key,
    label,
    display: 'Unavailable',
    detail,
    tone: 'unknown',
    source: 'Worker collector',
  });

  const cpu = metricValue(snapshot, 'host.cpu.utilization');
  const cores = metricValue(snapshot, 'host.cpu.cores');
  const load1 = metricValue(snapshot, 'host.load.1m');
  const memPercent = metricValue(snapshot, 'host.memory.usedPercent');
  const memAvailable = metricValue(snapshot, 'host.memory.available');
  const memTotal = metricValue(snapshot, 'host.memory.total');
  const swapUsed = metricValue(snapshot, 'host.swap.used');
  const swapTotal = metricValue(snapshot, 'host.swap.total');
  const diskPercent = metricValue(snapshot, 'host.disk.root.usedPercent');
  const diskAvailable = metricValue(snapshot, 'host.disk.root.available');
  const rx = metricValue(snapshot, 'host.network.rx');
  const tx = metricValue(snapshot, 'host.network.tx');

  const cpuKpi =
    cpu === null
      ? unavailable('cpu', 'CPU', snapshotState.reason ?? 'Waiting for a second sample')
      : {
          key: 'cpu',
          label: 'CPU',
          display: formatPercent(cpu),
          detail: `Load ${load1 === null ? '–' : load1.toFixed(2)} on ${cores ?? '?'} cores`,
          tone: toneFor(cpu, thresholds?.cpu),
          source: collectorSource,
          collectedAt,
          trend: buildSparkline(recent.map((s) => s.cpu)),
        };

  let memoryKpi;
  if (memPercent !== null) {
    const swap = swapTotal
      ? ` · swap ${formatBytes(swapUsed)} of ${formatBytes(swapTotal)}`
      : ' · no swap';
    memoryKpi = {
      key: 'memory',
      label: 'Memory used',
      display: formatPercent(memPercent),
      detail: `${formatBytes(memAvailable)} available of ${formatBytes(memTotal)}${swap}`,
      tone: toneFor(memPercent, thresholds?.memory),
      source: collectorSource,
      collectedAt,
      trend: buildSparkline(recent.map((s) => s.mem)),
    };
  } else if (server?.memory) {
    memoryKpi = {
      key: 'memory',
      label: 'Memory used',
      display: formatPercent(server.memory.usedPercent),
      detail: `${formatBytes(server.memory.freeMb * 1048576)} available of ${formatBytes(server.memory.totalMb * 1048576)}`,
      tone: toneForPercent(server.memory.usedPercent, thresholds?.memory),
      source: 'Web process fallback (MemAvailable)',
      collectedAt: server.collectedAt,
    };
  } else {
    memoryKpi = unavailable('memory', 'Memory used', 'No reading');
  }

  let diskKpi;
  if (diskPercent !== null) {
    diskKpi = {
      key: 'disk',
      label: 'Disk used',
      display: formatPercent(diskPercent),
      detail: `${formatBytes(diskAvailable)} free on the root filesystem`,
      tone: toneFor(diskPercent, thresholds?.disk),
      source: collectorSource,
      collectedAt,
    };
  } else if (server?.disk) {
    diskKpi = {
      key: 'disk',
      label: 'Disk used',
      display: formatPercent(server.disk.usedPercent),
      detail: `${server.disk.freeGb} GB free of ${server.disk.totalGb} GB`,
      tone: toneForPercent(server.disk.usedPercent, thresholds?.disk),
      source: 'Web process fallback (workspace filesystem)',
      collectedAt: server.collectedAt,
    };
  } else {
    diskKpi = unavailable('disk', 'Disk used', 'No reading');
  }

  const networkKpi =
    rx === null || tx === null
      ? unavailable('network', 'Network', snapshotState.reason ?? 'Waiting for a second sample')
      : {
          key: 'network',
          label: 'Network',
          display: `↓ ${formatBitRate(rx)}`,
          detail: `↑ ${formatBitRate(tx)} · physical interfaces`,
          tone: stale ? 'unknown' : 'healthy',
          source: collectorSource,
          collectedAt,
          trend: buildSparkline(
            recent.map((s) =>
              typeof s.rx === 'number' && typeof s.tx === 'number' ? s.rx + s.tx : null,
            ),
            null,
          ),
        };

  return [
    cpuKpi,
    memoryKpi,
    diskKpi,
    networkKpi,
    appsKpi(apps, stale),
    {
      key: 'deployments',
      label: 'Deployments',
      display: deployments.queue
        ? `${deployments.queue.active} active`
        : deployments.active
          ? `${deployments.active.length} in progress`
          : 'Unavailable',
      detail: deployments.queue
        ? `${deployments.queue.waiting} waiting · ${deployments.queue.paused ? 'queue paused' : 'queue running'}`
        : 'Queue unreachable',
      tone: deploymentTone(deployments),
      source: 'BullMQ',
      collectedAt: server?.collectedAt ?? null,
    },
  ];
}

function buildTrends({ rawSamples, preferences, snapshot, now, history }) {
  const rangeKey = preferences?.historyRange ?? '1h';
  const range = HISTORY_RANGES[rangeKey] ?? HISTORY_RANGES['1h'];
  const end = now.getTime();
  const fromHistory = range.resolution !== 'raw' && range.seconds > 3600;
  const points = fromHistory ? (history?.points ?? []) : rawSamples;
  const start = fromHistory
    ? end - range.seconds * 1000
    : end - Math.min(range.seconds, 3600) * 1000;
  const stepSeconds = fromHistory
    ? (history?.stepSeconds ?? 300)
    : (snapshot?.intervals?.resourceSeconds ?? 15);
  const usage = buildLineChart(points, {
    start,
    end,
    stepSeconds,
    series: [
      { key: 'cpu', label: 'CPU', unit: '%', max: 100 },
      { key: 'mem', label: 'Memory', unit: '%', max: 100 },
      { key: 'swap', label: 'Swap', unit: '%', max: 100 },
    ],
  });
  const network = buildLineChart(points, {
    start,
    end,
    stepSeconds,
    series: [
      { key: 'rx', label: 'Received', unit: 'bytes/s' },
      { key: 'tx', label: 'Sent', unit: 'bytes/s' },
    ],
  });
  return {
    available: usage.hasData || network.hasData,
    rangeLabel: fromHistory
      ? `last ${rangeKey}, ${history?.resolution ?? ''} averages`
      : `last ${rangeKey}, ${stepSeconds}s samples`,
    usage,
    network,
  };
}

function buildConsumers(snapshotState, preferences) {
  const snapshot = snapshotState.snapshot;
  if (!snapshot) {
    return { available: false, reason: snapshotState.reason };
  }
  const services = (snapshot.services ?? [])
    .filter((service) => service.installed)
    .map((service) => ({
      name: service.label,
      kind: 'Platform service',
      state: service.activeState,
      cpu: service.cpuPercentOfHost,
      memoryBytes: service.memoryBytes,
      limitBytes: null,
      percentOfLimit: null,
      restarts: service.restarts,
      uptime: null,
    }));
  const containers = (snapshot.containers ?? [])
    .filter((c) => c.role !== ContainerRole.UNMANAGED && c.running)
    .map((c) => ({
      name: c.projectSlug ?? c.name ?? 'Unattributed container',
      href: c.projectSlug ? `/projects/${c.projectSlug}` : null,
      kind: ROLE_LABEL[c.role] ?? c.role,
      state: c.restarting ? 'restarting' : c.status,
      cpu: c.cpuPercentOfHost,
      memoryBytes: c.memoryBytes,
      limitBytes: c.memoryLimitBytes,
      percentOfLimit: c.memoryPercentOfLimit,
      restarts: c.restartCount,
      uptime: c.startedAt
        ? formatDuration((Date.parse(snapshot.collectedAt) - Date.parse(c.startedAt)) / 1000)
        : null,
    }));
  const others = (snapshot.containers ?? []).filter(
    (c) => c.role === ContainerRole.UNMANAGED && c.running,
  );
  const sumOf = (rows, field) =>
    rows.some((r) => typeof r[field] === 'number')
      ? rows.reduce((t, r) => t + (typeof r[field] === 'number' ? r[field] : 0), 0)
      : null;
  const rows = [...containers, ...services].sort((a, b) => (b.cpu ?? -1) - (a.cpu ?? -1));
  return {
    available: true,
    stale: snapshotState.freshness === MetricFreshness.STALE,
    collectedAt: snapshot.collectedAt,
    statsAvailable: snapshot.sources?.containerStats?.ok === true,
    statsReason: snapshot.sources?.containerStats?.reason ?? null,
    dockerAvailable: snapshot.sources?.docker?.ok === true,
    dockerReason: snapshot.sources?.docker?.reason ?? null,
    rows: rows.slice(0, preferences?.tableRows ?? 25),
    totalRows: rows.length,
    others:
      others.length > 0
        ? {
            count: others.length,
            cpu: sumOf(others, 'cpuPercentOfHost'),
            memoryBytes: sumOf(others, 'memoryBytes'),
          }
        : null,
    dockerDiskUsage: snapshot.dockerDiskUsage ?? null,
  };
}

function buildDeployments(server, activity) {
  const queue = server?.queue;
  return {
    queue: queue
      ? {
          waiting: queue.waiting ?? 0,
          active: queue.active ?? 0,
          delayed: queue.delayed ?? 0,
          failedRetained: queue.failed ?? 0,
          completedRetained: queue.completed ?? 0,
          paused: Boolean(queue.paused),
        }
      : null,
    workers: server?.worker ?? null,
    active: activity
      ? activity.active.map((row) => ({
          ...row,
          stageLabel: STAGE_LABEL[row.stage] ?? row.stage,
          elapsed: formatDuration(row.elapsedSeconds),
        }))
      : null,
    recent: activity
      ? activity.recent.map((row) => ({
          ...row,
          result: STAGE_LABEL[row.status] ?? row.status,
          tone: RESULT_TONE[row.status] ?? 'unknown',
        }))
      : null,
    unresolvedFailures: activity?.unresolvedFailures ?? null,
    collectedAt: server?.collectedAt ?? null,
  };
}

function deploymentTone(deployments) {
  if (!deployments.queue) {
    return 'unknown';
  }
  if (deployments.active?.some((row) => row.stuck)) {
    return 'critical';
  }
  if (deployments.queue.paused || (deployments.unresolvedFailures?.length ?? 0) > 0) {
    return 'warning';
  }
  return 'healthy';
}

const STAGE_LABEL = {
  QUEUED: 'Queued',
  VALIDATING: 'Validating',
  BUILDING: 'Building',
  DEPLOYING: 'Deploying',
  HEALTHY: 'Live',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  ROLLED_BACK: 'Rolled back',
};

const RESULT_TONE = {
  HEALTHY: 'healthy',
  FAILED: 'critical',
  CANCELLED: 'muted',
  ROLLED_BACK: 'muted',
};

const HEALTH_ORDER = [
  AppHealth.UNHEALTHY,
  AppHealth.RESTARTING,
  AppHealth.DEGRADED,
  AppHealth.STARTING,
  AppHealth.UNKNOWN,
  AppHealth.MAINTENANCE,
  AppHealth.STOPPED,
  AppHealth.HEALTHY,
];

export const HEALTH_LABEL = {
  [AppHealth.HEALTHY]: 'Healthy',
  [AppHealth.DEGRADED]: 'Degraded',
  [AppHealth.UNHEALTHY]: 'Unhealthy',
  [AppHealth.STARTING]: 'Starting',
  [AppHealth.RESTARTING]: 'Restarting',
  [AppHealth.STOPPED]: 'Stopped',
  [AppHealth.MAINTENANCE]: 'Maintenance',
  [AppHealth.UNKNOWN]: 'Unknown',
};

export const HEALTH_TONE = {
  [AppHealth.HEALTHY]: 'healthy',
  [AppHealth.DEGRADED]: 'warning',
  [AppHealth.UNHEALTHY]: 'critical',
  [AppHealth.STARTING]: 'info',
  [AppHealth.RESTARTING]: 'critical',
  [AppHealth.STOPPED]: 'muted',
  [AppHealth.MAINTENANCE]: 'muted',
  [AppHealth.UNKNOWN]: 'unknown',
};

/**
 * Applications by severity, then by resource use. A stale snapshot turns every
 * status into Unknown: an old "Healthy" is not evidence of health now.
 */
function buildApps(snapshotState, preferences) {
  const snapshot = snapshotState.snapshot;
  if (!snapshot?.apps) {
    return {
      available: false,
      reason: snapshotState.reason ?? 'The collector has not reported applications',
    };
  }
  const stale = snapshotState.freshness === MetricFreshness.STALE;
  const rows = snapshot.apps
    .map((app) => {
      const health = stale ? AppHealth.UNKNOWN : app.health;
      return {
        ...app,
        health,
        healthLabel: HEALTH_LABEL[health],
        tone: HEALTH_TONE[health],
        reason: stale ? 'Collector data is stale' : app.reason,
        uptime:
          app.startedAt && app.containerState === 'running'
            ? formatDuration((Date.parse(snapshot.collectedAt) - Date.parse(app.startedAt)) / 1000)
            : null,
        href: `/projects/${app.slug}`,
      };
    })
    .sort(
      (a, b) =>
        HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health) ||
        (b.cpuPercentOfHost ?? -1) - (a.cpuPercentOfHost ?? -1) ||
        a.slug.localeCompare(b.slug),
    );
  const counts = Object.fromEntries(HEALTH_ORDER.map((h) => [h, 0]));
  for (const row of rows) {
    counts[row.health] += 1;
  }
  return {
    available: true,
    stale,
    collectedAt: snapshot.collectedAt,
    counts,
    total: rows.length,
    rows: rows.slice(0, preferences?.tableRows ?? 25),
    publicChecked: rows.some((row) => row.public),
  };
}

function appsKpi(apps, stale) {
  if (!apps.available) {
    return {
      key: 'apps',
      label: 'Healthy apps',
      display: 'Unknown',
      detail: apps.reason,
      tone: 'unknown',
      source: 'Application probes',
    };
  }
  const { counts, total } = apps;
  const failing = counts.unhealthy + counts.restarting;
  const expected = total - counts.stopped - counts.maintenance;
  const parts = [];
  if (failing > 0) {
    parts.push(`${failing} failing`);
  }
  if (counts.degraded > 0) {
    parts.push(`${counts.degraded} degraded`);
  }
  if (counts.unknown + counts.starting > 0) {
    parts.push(`${counts.unknown + counts.starting} unconfirmed`);
  }
  if (counts.stopped + counts.maintenance > 0) {
    parts.push(`${counts.stopped + counts.maintenance} stopped or in maintenance`);
  }
  let tone = 'healthy';
  if (stale) {
    tone = 'unknown';
  } else if (failing > 0) {
    tone = 'critical';
  } else if (counts.degraded > 0) {
    tone = 'warning';
  } else if (counts.unknown + counts.starting > 0) {
    tone = 'unknown';
  }
  return {
    key: 'apps',
    label: 'Healthy apps',
    display: `${counts.healthy} / ${expected}`,
    detail: parts.length > 0 ? parts.join(' · ') : 'Every live app answers its health check',
    tone,
    source: 'Loopback health probes',
    collectedAt: apps.collectedAt,
  };
}

function buildBuilder({ builderEnabled, builderStatus, snapshot }) {
  const executor = snapshot?.worker?.buildExecutor ?? null;
  if (!builderEnabled) {
    return {
      enabled: false,
      state: 'disabled',
      label: 'Disabled',
      detail:
        executor === 'remote-buildkit'
          ? 'Builds use the configured remote BuildKit executor'
          : 'Builds run on the deployment worker on this host',
      executor,
    };
  }
  const status = builderStatus?.status ?? null;
  if (!status || !builderStatus.isFresh) {
    return {
      enabled: true,
      state: 'unknown',
      label: 'Unknown',
      detail: status
        ? 'The worker stopped reporting builder status'
        : 'No builder status published',
      executor,
      updatedAt: status?.updatedAt ?? null,
    };
  }
  return {
    enabled: true,
    state: String(status.state ?? 'unknown').toLowerCase(),
    label: status.state ?? 'Unknown',
    detail: status.activeBuild
      ? `Building since ${new Date(status.activeBuild.startedAt).toISOString().slice(11, 16)} UTC`
      : status.idleStopAt
        ? `Idle; stops at ${new Date(status.idleStopAt).toISOString().slice(11, 16)} UTC`
        : 'Idle',
    lastError: status.lastError ?? null,
    memoryMb: status.resources?.builderMemoryMb ?? null,
    executor,
    updatedAt: status.updatedAt ?? null,
  };
}

function buildActivity({ counts, deployments }) {
  const admin = (counts?.recentActivity ?? []).map((event) => ({
    kind: 'admin',
    label: toActionLabel(event.action),
    outcome: event.outcome,
    tone:
      event.outcome === 'SUCCESS'
        ? 'healthy'
        : event.outcome === 'FAILURE'
          ? 'critical'
          : 'warning',
    result:
      event.outcome === 'SUCCESS' ? 'Done' : event.outcome === 'FAILURE' ? 'Failed' : 'Denied',
    actor: 'Administrator',
    createdAt: event.createdAt,
    href: '/admin/audit-events',
  }));
  const deploys = (deployments.recent ?? []).map((row) => ({
    kind: 'deploy',
    label: `${row.project} deployment #${row.sequence}`,
    tone: row.tone,
    result: row.result,
    actor: 'Pipeline',
    detail: row.failureCode ? row.failureCode.replaceAll('_', ' ').toLowerCase() : null,
    createdAt: row.finishedAt,
    href: row.href,
  }));
  return [...admin, ...deploys]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 20);
}

const UNIT_ROWS = [
  { key: 'nginx', label: 'Nginx' },
  { key: 'nginxHelper', label: 'Nginx route helper' },
  { key: 'tunnel', label: 'Cloudflare tunnel (platform)' },
  { key: 'tunnelApps', label: 'Cloudflare tunnel (apps)' },
];

/**
 * Services the worker can see through systemd. A unit that is not installed
 * on this host is Not supported, not Down. Nginx also carries the result of
 * the helper's configuration check, which proves more than a running process.
 */
function unitRows(snapshot) {
  if (!snapshot?.services) {
    return UNIT_ROWS.map((row) => ({
      ...row,
      state: ServiceState.UNKNOWN,
      evidence: 'No collector evidence',
      checkedAt: null,
    }));
  }
  return UNIT_ROWS.map((row) => {
    const unit = snapshot.services.find((service) => service.key === row.key);
    if (!unit || !unit.installed) {
      return {
        ...row,
        state: ServiceState.UNSUPPORTED,
        evidence: 'Not installed on this host',
        checkedAt: unit?.checkedAt ?? null,
      };
    }
    let state = unit.activeState === 'active' ? ServiceState.OPERATIONAL : ServiceState.DOWN;
    let evidence = `systemd ${unit.activeState} (${unit.subState})${unit.restarts ? `, ${unit.restarts} restarts` : ''}`;
    let checkedAt = unit.checkedAt;
    if (row.key === 'nginx' && snapshot.nginx) {
      if (!snapshot.nginx.ok) {
        state = ServiceState.DEGRADED;
        evidence = `${evidence}; configuration check failed: ${snapshot.nginx.reason ?? 'no reason'}`;
      } else {
        evidence = `${evidence}; configuration valid`;
      }
      checkedAt = snapshot.nginx.at;
    }
    if (row.key.startsWith('tunnel')) {
      evidence = `${evidence}; local process only, public reachability is checked per app`;
    }
    return { ...row, state, evidence, checkedAt };
  });
}

function buildServices(server, snapshotState) {
  const at = server?.collectedAt ?? null;
  const snapshot = snapshotState.snapshot;
  const collectorEvidence = snapshot
    ? `Last cycle took ${snapshot.durationMs} ms${snapshotState.freshness === MetricFreshness.STALE ? `, ${snapshotState.ageSeconds}s ago` : ''}`
    : snapshotState.reason;
  let dockerEvidence = 'No collector evidence';
  if (snapshot?.sources?.docker?.ok) {
    dockerEvidence = `${snapshot.containerCounts?.running ?? 0} running of ${snapshot.containerCounts?.total ?? 0} containers`;
  } else if (snapshot) {
    dockerEvidence = snapshot.sources?.docker?.reason ?? 'Docker did not answer';
  }
  return [
    {
      key: 'web',
      label: 'Web',
      state: ServiceState.OPERATIONAL,
      evidence: 'Serving this page',
      checkedAt: at,
    },
    {
      key: 'worker',
      label: 'Deployment worker',
      state: !server?.worker
        ? ServiceState.UNKNOWN
        : server.worker.ready
          ? ServiceState.OPERATIONAL
          : ServiceState.DOWN,
      evidence: !server?.worker
        ? 'No reading'
        : server.worker.ready
          ? `${server.worker.workers ?? 'At least one'} connected to the queue`
          : 'No worker connected to the queue',
      checkedAt: at,
    },
    {
      key: 'collector',
      label: 'Monitoring collector',
      state:
        snapshotState.freshness === MetricFreshness.FRESH
          ? ServiceState.OPERATIONAL
          : snapshotState.freshness === MetricFreshness.STALE
            ? ServiceState.DEGRADED
            : ServiceState.DOWN,
      evidence: collectorEvidence,
      checkedAt: snapshot?.collectedAt ?? null,
    },
    {
      key: 'queue',
      label: 'Redis and queue',
      state: !server?.queue
        ? ServiceState.DOWN
        : server.queue.paused
          ? ServiceState.DEGRADED
          : ServiceState.OPERATIONAL,
      evidence: !server?.queue
        ? 'Queue counts could not be read'
        : server.queue.paused
          ? 'Queue is paused: new deployments will not start'
          : 'Queue counts read',
      checkedAt: at,
    },
    {
      key: 'mongo',
      label: 'MongoDB',
      state: !server?.mongo
        ? ServiceState.UNKNOWN
        : server.mongo.connected
          ? ServiceState.OPERATIONAL
          : ServiceState.DOWN,
      evidence: server?.mongo?.connected ? 'Ping answered' : 'Ping failed',
      checkedAt: at,
    },
    {
      key: 'docker',
      label: 'Docker',
      state: !snapshot
        ? ServiceState.UNKNOWN
        : snapshot.sources?.docker?.ok
          ? ServiceState.OPERATIONAL
          : ServiceState.DOWN,
      evidence: dockerEvidence,
      checkedAt: snapshot?.sources?.docker?.at ?? null,
    },
    ...unitRows(snapshot),
    {
      key: 'release',
      label: 'Release identity',
      state:
        server?.platformRelease?.matchesExpected === true
          ? ServiceState.OPERATIONAL
          : server?.platformRelease?.matchesExpected === false
            ? ServiceState.DEGRADED
            : ServiceState.UNKNOWN,
      evidence:
        server?.platformRelease?.matchesExpected === true
          ? `Running ${server.platformRelease.actualSha?.slice(0, 12)} as expected`
          : server?.platformRelease?.matchesExpected === false
            ? 'Running commit differs from the installed release metadata'
            : 'No release metadata on this host',
      checkedAt: at,
    },
    {
      key: 'backup',
      label: 'Backups',
      state: ServiceState.UNKNOWN,
      evidence: 'No authoritative backup record is readable by the platform',
      checkedAt: null,
    },
  ];
}

// The account page promises deletion within 30 days of a closure request.
const CLOSURE_DEADLINE_DAYS = 30;

async function getPendingClosures() {
  return User.find({ closureRequestedAt: { $ne: null } })
    .select('_id closureRequestedAt')
    .sort({ closureRequestedAt: 1 })
    .limit(50)
    .lean();
}

function buildAttention({
  counts,
  server,
  apps,
  deployments,
  snapshotState,
  capacity,
  closures,
  incidents = [],
  now = new Date(),
}) {
  const items = [];
  // An open incident is already in the strip above; do not list it twice.
  const covered = new Set(incidents.map((incident) => incident.fingerprint));
  if (capacity?.available && capacity.memory?.reserveBreached) {
    items.push({
      severity: 'warning',
      title: 'Available memory is inside the policy reserve',
      detail: 'New builds and releases compete with running apps for memory.',
      href: '/admin/overview/settings#platform-title',
    });
  }
  if (capacity?.available && capacity.memory?.overcommitted) {
    items.push({
      severity: 'warning',
      title: `Memory limits are overcommitted (${capacity.memory.overcommitRatio}× of what policy allows)`,
      detail: 'Apps cannot all reach their limits at once. Quotas are not changed automatically.',
      href: '/admin/projects',
    });
  }
  if (capacity?.available && capacity.disk?.reserveBreached) {
    items.push({
      severity: 'warning',
      title: 'Free disk space is inside the policy reserve',
      detail: 'Builds and image pulls may fail. Review Docker images and build cache.',
      href: '/admin/server',
    });
  }
  if ((closures?.length ?? 0) > 0) {
    const deadline = (c) =>
      new Date(c.closureRequestedAt).getTime() + CLOSURE_DEADLINE_DAYS * 86_400_000;
    const soonest = Math.min(...closures.map(deadline));
    const daysLeft = Math.ceil((soonest - now.getTime()) / 86_400_000);
    items.push({
      severity: daysLeft <= 0 ? 'critical' : daysLeft <= 7 ? 'warning' : 'info',
      title: `${closures.length} account closure request${closures.length === 1 ? '' : 's'} waiting`,
      detail:
        daysLeft <= 0
          ? `The oldest is past the ${CLOSURE_DEADLINE_DAYS}-day deletion commitment.`
          : `The oldest must be completed within ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
      href: '/admin/users',
    });
  }
  if (server?.worker && !server.worker.ready) {
    items.push({
      severity: 'critical',
      title: 'No deployment worker is connected',
      detail: 'Queued jobs will not be processed.',
      href: '/admin/server',
    });
  }
  if (snapshotState.freshness !== MetricFreshness.FRESH) {
    items.push({
      severity: 'warning',
      title: 'Monitoring data is not current',
      detail: snapshotState.reason ?? 'The collector has not reported.',
      href: '/admin/server',
    });
  }
  for (const app of (apps.available ? apps.rows : []).filter(
    (row) =>
      [AppHealth.UNHEALTHY, AppHealth.RESTARTING, AppHealth.DEGRADED].includes(row.health) &&
      !covered.has(`app:health:${row.projectId}`),
  )) {
    items.push({
      severity: app.health === AppHealth.DEGRADED ? 'warning' : 'critical',
      title: `${app.slug} is ${app.healthLabel.toLowerCase()}`,
      detail: app.reason,
      href: app.href,
    });
  }
  for (const row of (deployments.active ?? []).filter((d) => d.stuck)) {
    items.push({
      severity: 'warning',
      title: `${row.project} has been ${row.stageLabel.toLowerCase()} for ${row.elapsed}`,
      detail: 'The deployment may be stuck.',
      href: row.href,
    });
  }
  const failures = deployments.unresolvedFailures ?? [];
  if (failures.length > 0) {
    items.push({
      severity: 'warning',
      title: `${failures.length} project${failures.length === 1 ? '' : 's'} whose latest deployment failed`,
      detail: failures
        .slice(0, 3)
        .map((f) => f.project)
        .join(', '),
      href: failures.length === 1 ? failures[0].href : '/admin/projects',
    });
  }
  if (server?.queue?.paused) {
    items.push({
      severity: 'warning',
      title: 'Deployment queue is paused',
      detail: 'New deployments will not start until it is resumed.',
      href: '/admin/server',
    });
  }
  if (server?.platformRelease?.matchesExpected === false) {
    items.push({
      severity: 'warning',
      title: 'Running commit differs from the installed release',
      detail: 'Check the release metadata before the next deploy.',
      href: '/admin/server',
    });
  }
  const reviews = [
    [counts?.pendingApprovals, 'project review', '/admin/approval-requests'],
    [counts?.pendingDomainApprovals, 'custom domain approval', '/admin/domains'],
    [counts?.failedTeardowns, 'failed project cleanup', '/admin/server#failed-teardowns'],
  ];
  for (const [count, noun, href] of reviews) {
    if (count > 0) {
      items.push({
        severity: noun.startsWith('failed') ? 'warning' : 'info',
        title: `${count} ${noun}${count === 1 ? '' : 's'} waiting`,
        detail: null,
        href,
      });
    }
  }
  const rank = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

function overallStatus({ services, snapshotState }) {
  if (snapshotState.freshness === MetricFreshness.STALE) {
    return 'stale';
  }
  if (services.some((service) => service.state === ServiceState.DOWN)) {
    return 'degraded';
  }
  return 'live';
}
