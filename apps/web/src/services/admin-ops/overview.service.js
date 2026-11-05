import {
  ContainerRole,
  HISTORY_RANGES,
  MetricFreshness,
  ServiceState,
} from '@hellodeploy/contracts';

import { getAdminOverview } from '../admin.service.js';
import { toActionLabel } from '../audit-search.service.js';
import { collectServerStats } from '../server-stats.service.js';
import { buildLineChart, buildSparkline } from './charts.js';
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
  const now = deps.now ?? new Date();
  const [counts, server, monitoring, samples] = await Promise.all([
    settle(loadCounts()),
    settle(loadServer()),
    settle(loadSnapshot()),
    settle(loadSamples()),
  ]);
  const snapshotState = monitoring ?? {
    snapshot: null,
    freshness: MetricFreshness.UNAVAILABLE,
    reason: 'Snapshot read failed',
  };
  const snapshot = snapshotState.snapshot;
  const rawSamples = samples ?? [];

  const services = buildServices(server, snapshotState);
  const deployments = buildDeployments(server);

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
    kpis: buildKpis({ server, deployments, policy, snapshotState, rawSamples }),
    incidents: [],
    incidentsAvailable: false,
    trends: buildTrends({ rawSamples, preferences, snapshot, now }),
    consumers: buildConsumers(snapshotState, preferences),
    services,
    deployments,
    attention: buildAttention({ counts, server }),
    counts: counts ?? null,
    activity: (counts?.recentActivity ?? []).map((event) => ({
      label: toActionLabel(event.action),
      outcome: event.outcome,
      createdAt: event.createdAt,
    })),
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

function buildKpis({ server, deployments, policy, snapshotState, rawSamples }) {
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

  const activeRunning = snapshot?.containerCounts?.byRole?.[ContainerRole.ACTIVE] ?? null;
  return [
    cpuKpi,
    memoryKpi,
    diskKpi,
    networkKpi,
    {
      key: 'apps',
      label: 'Healthy apps',
      display: 'Unknown',
      detail:
        activeRunning === null
          ? 'No container evidence'
          : `${activeRunning} live release container${activeRunning === 1 ? '' : 's'} running; health not probed yet`,
      tone: 'unknown',
      source: 'Application probes',
    },
    {
      key: 'deployments',
      label: 'Deployments',
      display: deployments.queue ? `${deployments.queue.active} active` : 'Unavailable',
      detail: deployments.queue
        ? `${deployments.queue.waiting} waiting · ${deployments.queue.paused ? 'queue paused' : 'queue running'}`
        : 'Queue unreachable',
      tone: !deployments.queue ? 'unknown' : deployments.queue.paused ? 'warning' : 'healthy',
      source: 'BullMQ',
      collectedAt: server?.collectedAt ?? null,
    },
  ];
}

function buildTrends({ rawSamples, preferences, snapshot, now }) {
  const rangeKey = preferences?.historyRange ?? '1h';
  const range = HISTORY_RANGES[rangeKey] ?? HISTORY_RANGES['1h'];
  const end = now.getTime();
  const start = end - Math.min(range.seconds, 3600) * 1000;
  const stepSeconds = snapshot?.intervals?.resourceSeconds ?? 15;
  const usage = buildLineChart(rawSamples, {
    start,
    end,
    stepSeconds,
    series: [
      { key: 'cpu', label: 'CPU', unit: '%', max: 100 },
      { key: 'mem', label: 'Memory', unit: '%', max: 100 },
      { key: 'swap', label: 'Swap', unit: '%', max: 100 },
    ],
  });
  const network = buildLineChart(rawSamples, {
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
    rangeLabel:
      range.seconds > 3600 ? `last hour (longer ranges need recorded history)` : `last ${rangeKey}`,
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

function buildDeployments(server) {
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
    collectedAt: server?.collectedAt ?? null,
  };
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

function buildAttention({ counts, server }) {
  const items = [];
  if (server?.worker && !server.worker.ready) {
    items.push({
      severity: 'critical',
      title: 'No deployment worker is connected',
      detail: 'Queued jobs will not be processed.',
      href: '/admin/server',
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
  return items;
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
