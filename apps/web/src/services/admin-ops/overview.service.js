import { ServiceState } from '@hellodeploy/contracts';

import { getAdminOverview } from '../admin.service.js';
import { toActionLabel } from '../audit-search.service.js';
import { collectServerStats } from '../server-stats.service.js';
import { formatBytes, formatPercent, toneForPercent } from './format.js';

/**
 * Admin operations overview view model. Each panel is built from its own
 * source and degrades on its own: one failed source makes that panel
 * Unavailable, never the whole page, and never a misleading zero.
 */
export async function buildOverview({ policy, deps = {} } = {}) {
  const loadCounts = deps.getAdminOverview ?? getAdminOverview;
  const loadServer = deps.collectServerStats ?? collectServerStats;
  const now = deps.now ?? new Date();
  const [counts, server] = await Promise.all([settle(loadCounts()), settle(loadServer())]);

  const services = buildServices(server);
  const deployments = buildDeployments(server);
  const kpis = buildKpis({ server, deployments, policy });
  const attention = buildAttention({ counts, server });

  return {
    generatedAt: now.toISOString(),
    status: overallStatus({ services, server }),
    kpis,
    incidents: [],
    incidentsAvailable: false,
    services,
    deployments,
    attention,
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

function buildKpis({ server, deployments, policy }) {
  const memory = server?.memory ?? null;
  const disk = server?.disk ?? null;
  const thresholds = policy?.thresholds;
  return [
    {
      key: 'cpu',
      label: 'CPU',
      display: 'Unavailable',
      detail: server?.cpu
        ? `Load ${server.cpu.load1} / ${server.cpu.cores} cores`
        : 'Host collector not reporting',
      tone: 'unknown',
      source: 'Host collector',
    },
    {
      key: 'memory',
      label: 'Memory used',
      display: memory ? formatPercent(memory.usedPercent) : 'Unavailable',
      detail: memory
        ? `${formatBytes(memory.freeMb * 1048576)} available of ${formatBytes(memory.totalMb * 1048576)}`
        : 'No reading',
      tone: memory ? toneForPercent(memory.usedPercent, thresholds?.memory) : 'unknown',
      source: 'Web process (MemAvailable)',
      collectedAt: server?.collectedAt ?? null,
    },
    {
      key: 'disk',
      label: 'Disk used',
      display: disk ? formatPercent(disk.usedPercent) : 'Unavailable',
      detail: disk ? `${disk.freeGb} GB free of ${disk.totalGb} GB` : 'No reading',
      tone: disk ? toneForPercent(disk.usedPercent, thresholds?.disk) : 'unknown',
      source: 'Web process (workspace filesystem)',
      collectedAt: server?.collectedAt ?? null,
    },
    {
      key: 'network',
      label: 'Network',
      display: 'Unavailable',
      detail: 'Host collector not reporting',
      tone: 'unknown',
      source: 'Host collector',
    },
    {
      key: 'apps',
      label: 'Healthy apps',
      display: 'Unknown',
      detail:
        server?.running === null || server?.running === undefined
          ? 'No health evidence'
          : `${server.running} recorded as released; health not probed`,
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

function buildServices(server) {
  const at = server?.collectedAt ?? null;
  const rows = [
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
  return rows;
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

function overallStatus({ services }) {
  if (services.some((service) => service.state === ServiceState.DOWN)) {
    return 'degraded';
  }
  return 'live';
}
