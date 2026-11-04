import { randomUUID } from 'node:crypto';
import { cpus } from 'node:os';

import { Deployment, PlatformSetting, Project } from '@hellodeploy/database';
import {
  ContainerRole,
  MONITORING_LEASE_KEY,
  MONITORING_POLICY_KEY,
  MONITORING_RAW_SAMPLE_LIMIT,
  MONITORING_SAMPLES_KEY,
  MONITORING_SNAPSHOT_KEY,
  MONITORING_SNAPSHOT_SCHEMA,
  MetricScope,
  ProjectStatus,
  createMetric,
  normalizeMonitoringPolicy,
} from '@hellodeploy/contracts';

import { classifyContainers } from './classify.js';
import {
  inspectContainers,
  listContainerIds,
  readContainerStats,
  readDockerDiskUsage,
} from './docker.js';
import {
  computeCpuUtilization,
  computeNetworkRates,
  readFilesystem,
  readHostCounters,
  round,
} from './proc.js';
import { PLATFORM_UNITS, computeUnitCpu, readUnits } from './systemd.js';

const POLICY_CACHE_MS = 30_000;
// `docker system df` sizes every volume and build cache entry, which took
// ~27 s on the production host (19 GB of volumes): it runs rarely and in the
// background, never inside a cycle.
const DOCKER_DF_INTERVAL_MS = 30 * 60_000;
const BREAKER_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 5 * 60_000;

/**
 * The single shared collector. One cycle reads the host once, asks Docker
 * three bounded questions, and publishes one sanitized snapshot to Redis
 * that every administrator's browser reads. Browsers never trigger a cycle.
 *
 * Every source fails on its own: an unreadable source is reported as
 * unavailable with a reason, and repeated failures open a breaker so a
 * broken daemon is not hammered every cycle.
 */
export function createMonitoringCollector({
  redis,
  logger,
  workspacePath = null,
  dockerRoot = '/var/lib/docker',
  deps = {},
  now = () => new Date(),
}) {
  const host = deps.readHostCounters ?? readHostCounters;
  const statfsReader = deps.readFilesystem ?? readFilesystem;
  const docker = {
    listContainerIds: deps.listContainerIds ?? listContainerIds,
    inspectContainers: deps.inspectContainers ?? inspectContainers,
    readContainerStats: deps.readContainerStats ?? readContainerStats,
    readDockerDiskUsage: deps.readDockerDiskUsage ?? readDockerDiskUsage,
  };
  const units = deps.readUnits ?? readUnits;
  const loadRecords = deps.loadRecords ?? loadContainerRecords;
  const loadPolicy = deps.loadPolicy ?? loadStoredPolicy;
  const coreCount = deps.coreCount ?? cpus().length;
  const leaseToken = randomUUID();

  const state = {
    previousCpu: null,
    previousNet: null,
    previousUnits: null,
    previousProcessCpu: null,
    lastSampleAt: null,
    lastDiskAt: 0,
    disks: null,
    lastUnitsAt: 0,
    units: null,
    lastDockerDfAt: 0,
    dockerDfRunning: false,
    dockerDiskUsage: null,
    policy: null,
    policyAt: 0,
    breakers: {},
    sources: {},
    jobs: { lastCompletedAt: null, lastFailedAt: null },
    cycle: 0,
  };

  async function getPolicy() {
    if (state.policy && Date.now() - state.policyAt < POLICY_CACHE_MS) {
      return state.policy;
    }
    try {
      state.policy = normalizeMonitoringPolicy(await loadPolicy());
    } catch (error) {
      logger.warn('Monitoring: policy read failed, keeping the last known policy', {
        error: error.message,
      });
      state.policy ??= normalizeMonitoringPolicy(null);
    }
    state.policyAt = Date.now();
    return state.policy;
  }

  /** Run `read` unless its breaker is open; record the outcome for the snapshot. */
  async function guarded(source, read) {
    const breaker = (state.breakers[source] ??= { failures: 0, openUntil: 0 });
    const at = now().toISOString();
    if (breaker.openUntil > Date.now()) {
      state.sources[source] = { ok: false, at, reason: 'Paused after repeated failures' };
      return null;
    }
    try {
      const value = await read();
      breaker.failures = 0;
      state.sources[source] = { ok: true, at };
      return value;
    } catch (error) {
      breaker.failures += 1;
      if (breaker.failures >= BREAKER_THRESHOLD) {
        breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
        logger.warn('Monitoring: source paused after repeated failures', {
          source,
          error: error.message,
        });
      }
      state.sources[source] = { ok: false, at, reason: sanitizeReason(error) };
      return null;
    }
  }

  async function holdLease(ttlSeconds) {
    if (!redis || redis.status !== 'ready') {
      return false;
    }
    const acquired = await redis.set(MONITORING_LEASE_KEY, leaseToken, 'EX', ttlSeconds, 'NX');
    if (acquired === 'OK') {
      return true;
    }
    if ((await redis.get(MONITORING_LEASE_KEY)) === leaseToken) {
      await redis.expire(MONITORING_LEASE_KEY, ttlSeconds);
      return true;
    }
    return false;
  }

  async function collect() {
    const started = Date.now();
    const policy = await getPolicy();
    const at = now();
    const collectedAt = at.toISOString();
    const elapsedSeconds = state.lastSampleAt ? (at.getTime() - state.lastSampleAt) / 1000 : null;

    const counters = await guarded('host', async () => {
      const value = await host();
      if (!value.cpu && !value.memory) {
        throw new Error('Host counters are unreadable');
      }
      return value;
    });

    const cpuUtilization = computeCpuUtilization(state.previousCpu, counters?.cpu);
    const network = computeNetworkRates(
      state.previousNet,
      counters?.interfaces ? { interfaces: counters.interfaces } : null,
      elapsedSeconds,
    );
    state.previousCpu = counters?.cpu ?? null;
    state.previousNet = counters?.interfaces ? { interfaces: counters.interfaces } : null;
    state.lastSampleAt = at.getTime();

    if (Date.now() - state.lastDiskAt >= policy.intervals.diskSeconds * 1000 || !state.disks) {
      state.disks = await guarded('disk', () =>
        readDisks({ statfsReader, workspacePath, dockerRoot }),
      );
      state.lastDiskAt = Date.now();
    }

    const containers = await guarded('docker', async () => {
      const ids = await docker.listContainerIds();
      const inspected = await docker.inspectContainers(ids);
      const stats = policy.collectors.containerStats
        ? await docker.readContainerStats().catch((error) => {
            state.sources.containerStats = {
              ok: false,
              at: collectedAt,
              reason: sanitizeReason(error),
            };
            return null;
          })
        : null;
      if (stats) {
        state.sources.containerStats = { ok: true, at: collectedAt };
      } else if (!policy.collectors.containerStats) {
        state.sources.containerStats = { ok: false, at: collectedAt, reason: 'Disabled by policy' };
      }
      const records = await loadRecords(inspected);
      return classifyContainers(inspected, records).map((container) =>
        toContainerRow(container, stats?.get(container.id), records, coreCount),
      );
    });

    if (Date.now() - state.lastUnitsAt >= policy.intervals.serviceSeconds * 1000 || !state.units) {
      const unitSeconds = state.lastUnitsAt ? (Date.now() - state.lastUnitsAt) / 1000 : null;
      const read = await guarded('systemd', () => units());
      if (read) {
        state.units = PLATFORM_UNITS.map((entry) => {
          const current = read.get(entry.unit);
          const previous = state.previousUnits?.get(entry.unit);
          return {
            key: entry.key,
            label: entry.label,
            installed: Boolean(current?.loaded),
            activeState: current?.activeState ?? 'unknown',
            subState: current?.subState ?? 'unknown',
            memoryBytes: current?.memoryBytes ?? null,
            cpuPercentOfHost: computeUnitCpu(previous, current, unitSeconds, coreCount),
            restarts: current?.restarts ?? null,
            checkedAt: collectedAt,
          };
        });
        state.previousUnits = read;
      }
      state.lastUnitsAt = Date.now();
    }

    if (
      policy.collectors.dockerDiskUsage &&
      !state.dockerDfRunning &&
      Date.now() - state.lastDockerDfAt >= DOCKER_DF_INTERVAL_MS
    ) {
      state.lastDockerDfAt = Date.now();
      state.dockerDfRunning = true;
      guarded('dockerDiskUsage', () => docker.readDockerDiskUsage())
        .then((usage) => {
          if (usage) {
            state.dockerDiskUsage = { ...usage, collectedAt: now().toISOString() };
          }
        })
        .finally(() => {
          state.dockerDfRunning = false;
        });
    } else if (!policy.collectors.dockerDiskUsage) {
      state.dockerDiskUsage = null;
      state.sources.dockerDiskUsage = { ok: false, at: collectedAt, reason: 'Disabled by policy' };
    }

    const processCpu = process.cpuUsage();
    const workerCpu =
      state.previousProcessCpu && elapsedSeconds > 0
        ? round(
            ((processCpu.user + processCpu.system - state.previousProcessCpu) /
              (elapsedSeconds * 1e6 * coreCount)) *
              100,
            2,
          )
        : null;
    state.previousProcessCpu = processCpu.user + processCpu.system;

    state.cycle += 1;
    const snapshot = buildSnapshot({
      collectedAt,
      counters,
      cpuUtilization,
      network,
      coreCount,
      disks: state.disks,
      containers,
      units: state.units,
      dockerDiskUsage: state.dockerDiskUsage,
      worker: {
        rssBytes: process.memoryUsage().rss,
        cpuPercentOfHost: workerCpu,
        uptimeSeconds: Math.floor(process.uptime()),
        lastJobCompletedAt: state.jobs.lastCompletedAt,
        lastJobFailedAt: state.jobs.lastFailedAt,
      },
      policy,
      sources: state.sources,
      cycle: state.cycle,
      durationMs: Date.now() - started,
    });
    return snapshot;
  }

  async function publish(snapshot) {
    const ttl = Math.max(90, snapshot.intervals.resourceSeconds * 4);
    const sample = toRawSample(snapshot);
    await redis
      .multi()
      .set(MONITORING_SNAPSHOT_KEY, JSON.stringify(snapshot), 'EX', ttl)
      .lpush(MONITORING_SAMPLES_KEY, JSON.stringify(sample))
      .ltrim(MONITORING_SAMPLES_KEY, 0, MONITORING_RAW_SAMPLE_LIMIT - 1)
      .expire(MONITORING_SAMPLES_KEY, 2 * 3600)
      .exec();
  }

  /**
   * One collection cycle, if this process holds the collector lease.
   * @returns {Promise<object|null>} the published snapshot, or null when skipped
   */
  async function runCycle() {
    const policy = await getPolicy();
    const leaseTtl = Math.max(30, policy.intervals.resourceSeconds * 3);
    if (!(await holdLease(leaseTtl).catch(() => false))) {
      return null;
    }
    const snapshot = await collect();
    await publish(snapshot);
    return snapshot;
  }

  return {
    runCycle,
    collect,
    getPolicy,
    recordJobOutcome(outcome, at = now()) {
      if (outcome === 'completed') {
        state.jobs.lastCompletedAt = at.toISOString();
      } else if (outcome === 'failed') {
        state.jobs.lastFailedAt = at.toISOString();
      }
    },
  };
}

/**
 * Start the collection loop. The next cycle is scheduled after the previous
 * one finishes, so a slow cycle can never overlap itself, and a policy change
 * to the interval takes effect on the following cycle.
 */
export function startMonitoringLoop({ collector, logger, onSnapshot = async () => {} }) {
  let timer = null;
  let stopped = false;
  const run = async () => {
    timer = null;
    let delaySeconds = 15;
    try {
      const policy = await collector.getPolicy();
      delaySeconds = policy.intervals.resourceSeconds;
      const snapshot = await collector.runCycle();
      if (snapshot) {
        await onSnapshot(snapshot);
      }
    } catch (error) {
      logger.error('Monitoring: collection cycle failed', { error: error.message });
    }
    if (!stopped) {
      timer = setTimeout(run, delaySeconds * 1000);
      timer.unref?.();
    }
  };
  timer = setTimeout(run, 1000);
  timer.unref?.();
  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
    }
  };
}

async function readDisks({ statfsReader, workspacePath, dockerRoot }) {
  const targets = [
    { key: 'root', label: 'Root filesystem', path: '/' },
    ...(workspacePath ? [{ key: 'workspace', label: 'Build workspace', path: workspacePath }] : []),
    { key: 'docker', label: 'Docker data', path: dockerRoot },
  ];
  const disks = [];
  for (const target of targets) {
    let reading;
    try {
      reading = await statfsReader(target.path);
    } catch {
      continue;
    }
    // Paths on one filesystem report identical capacity; list it once.
    const duplicate = disks.find(
      (disk) => disk.totalBytes === reading.totalBytes && disk.usedBytes === reading.usedBytes,
    );
    if (duplicate) {
      duplicate.alsoServes.push(target.label);
      continue;
    }
    disks.push({ key: target.key, label: target.label, alsoServes: [], ...reading });
  }
  if (disks.length === 0) {
    throw new Error('No filesystem could be read');
  }
  return disks;
}

async function loadContainerRecords(containers) {
  const ids = containers.filter((c) => c.managed).map((c) => c.id);
  const labelled = containers
    .map((c) => c.deploymentId)
    .filter((id) => /^[0-9a-f]{24}$/.test(id ?? ''));
  const [projects, deployments] = await Promise.all([
    Project.find({ status: { $ne: ProjectStatus.ARCHIVED } })
      .select('_id slug name status activeDeploymentId maintenanceMode.enabled')
      .lean(),
    Deployment.find({
      $or: [
        { activeContainerId: { $in: ids } },
        { candidateContainerId: { $in: ids } },
        { _id: { $in: labelled } },
      ],
    })
      .select('_id projectId status activeContainerId candidateContainerId sequenceNumber')
      .lean(),
  ]);
  return { projects, deployments };
}

async function loadStoredPolicy() {
  const setting = await PlatformSetting.findOne({ key: MONITORING_POLICY_KEY }).lean();
  return setting?.value ?? null;
}

function toContainerRow(container, stats, { projects, deployments }, coreCount) {
  const project = projects.find((p) => String(p._id) === container.projectId) ?? null;
  const deployment = deployments.find((d) => String(d._id) === container.deploymentId) ?? null;
  const isPlatformOwned =
    container.role !== ContainerRole.UNMANAGED && container.role !== ContainerRole.BUILD;
  const memoryLimitBytes = container.memoryLimitBytes ?? null;
  const memoryBytes = stats?.memoryBytes ?? null;
  return {
    // Unmanaged containers belong to other software on the host: they are
    // counted toward host load but never named or attributed.
    id: isPlatformOwned ? container.id.slice(0, 12) : null,
    name: isPlatformOwned ? container.name : null,
    role: container.role,
    projectId: isPlatformOwned ? container.projectId : null,
    projectSlug: isPlatformOwned ? (project?.slug ?? null) : null,
    deploymentId: isPlatformOwned ? container.deploymentId : null,
    deploymentSequence: isPlatformOwned ? (deployment?.sequenceNumber ?? null) : null,
    status: container.status,
    running: container.running,
    restarting: container.restarting,
    oomKilled: container.oomKilled,
    exitCode: container.exitCode,
    dockerHealth: container.dockerHealth,
    startedAt: container.startedAt,
    restartCount: container.restartCount,
    cpuPercentOfCore: stats?.cpuPercentOfCore ?? null,
    cpuPercentOfHost:
      typeof stats?.cpuPercentOfCore === 'number'
        ? round(stats.cpuPercentOfCore / coreCount, 2)
        : null,
    cpuLimitCores: container.cpuLimitCores,
    memoryBytes,
    memoryLimitBytes,
    memoryPercentOfLimit:
      memoryBytes !== null && memoryLimitBytes
        ? round((memoryBytes / memoryLimitBytes) * 100, 1)
        : null,
    netRxBytes: stats?.netRxBytes ?? null,
    netTxBytes: stats?.netTxBytes ?? null,
    blockReadBytes: stats?.blockReadBytes ?? null,
    blockWriteBytes: stats?.blockWriteBytes ?? null,
    pids: stats?.pids ?? null,
  };
}

function buildSnapshot({
  collectedAt,
  counters,
  cpuUtilization,
  network,
  coreCount,
  disks,
  containers,
  units,
  dockerDiskUsage,
  worker,
  policy,
  sources,
  cycle,
  durationMs,
}) {
  const memory = counters?.memory ?? null;
  const metric = (key, value, unit, reason, scope = MetricScope.HOST) =>
    createMetric({ key, value, unit, scope, source: 'worker-collector', collectedAt, reason });
  const firstSample = 'Needs a second sample';
  const memUsedPercent = memory ? round((memory.usedBytes / memory.totalBytes) * 100, 1) : null;
  const swapPercent =
    memory && memory.swapTotalBytes > 0
      ? round((memory.swapUsedBytes / memory.swapTotalBytes) * 100, 1)
      : null;
  const root = disks?.[0] ?? null;
  const running = (containers ?? []).filter((c) => c.running);
  const sum = (rows, field) =>
    rows.some((r) => typeof r[field] === 'number')
      ? rows.reduce((total, r) => total + (typeof r[field] === 'number' ? r[field] : 0), 0)
      : null;
  const byRole = {};
  for (const role of Object.values(ContainerRole)) {
    byRole[role] = (containers ?? []).filter((c) => c.role === role && c.running).length;
  }
  const managedRunning = running.filter(
    (c) => c.role !== ContainerRole.UNMANAGED && c.role !== ContainerRole.BUILD,
  );

  return {
    schema: MONITORING_SNAPSHOT_SCHEMA,
    collectedAt,
    cycle,
    durationMs,
    intervals: policy.intervals,
    policyRevision: policy.revision,
    sources,
    metrics: [
      metric(
        'host.cpu.utilization',
        cpuUtilization,
        '%',
        counters?.cpu ? firstSample : 'Unreadable',
      ),
      metric('host.cpu.cores', coreCount, 'cores'),
      metric('host.load.1m', counters?.load?.load1, 'load'),
      metric('host.load.5m', counters?.load?.load5, 'load'),
      metric('host.load.15m', counters?.load?.load15, 'load'),
      metric('host.memory.total', memory?.totalBytes, 'bytes'),
      metric('host.memory.available', memory?.availableBytes, 'bytes'),
      metric('host.memory.used', memory?.usedBytes, 'bytes'),
      metric('host.memory.usedPercent', memUsedPercent, '%'),
      metric(
        'host.memory.pressureSome60',
        counters?.pressure?.some60,
        '%',
        'PSI not exposed by the kernel',
      ),
      metric('host.swap.total', memory?.swapTotalBytes, 'bytes'),
      metric('host.swap.used', memory?.swapUsedBytes, 'bytes'),
      metric(
        'host.swap.usedPercent',
        swapPercent,
        '%',
        memory ? 'No swap configured' : 'Unreadable',
      ),
      metric('host.disk.root.usedPercent', root?.usedPercent, '%'),
      metric('host.disk.root.available', root?.availableBytes, 'bytes'),
      metric('host.network.rx', network.rxBytesPerSecond, 'bytes/s', firstSample),
      metric('host.network.tx', network.txBytesPerSecond, 'bytes/s', firstSample),
      metric('host.uptime', counters?.uptimeSeconds, 's'),
      metric(
        'platform.containers.cpuPercentOfHost',
        containers ? sum(managedRunning, 'cpuPercentOfHost') : null,
        '%',
        'Container stats unavailable',
        MetricScope.PLATFORM,
      ),
      metric(
        'platform.containers.memory',
        containers ? sum(managedRunning, 'memoryBytes') : null,
        'bytes',
        'Container stats unavailable',
        MetricScope.PLATFORM,
      ),
    ],
    networkResets: network.resetInterfaces,
    disks: disks ?? null,
    containers: containers ?? null,
    containerCounts: containers
      ? { total: containers.length, running: running.length, byRole }
      : null,
    dockerDiskUsage,
    services: units ?? null,
    worker,
  };
}

/** The compact point kept for the 15-minute view and sparklines. */
export function toRawSample(snapshot) {
  const value = (key) => snapshot.metrics.find((m) => m.key === key)?.value ?? null;
  return {
    t: snapshot.collectedAt,
    cpu: value('host.cpu.utilization'),
    mem: value('host.memory.usedPercent'),
    swap: value('host.swap.usedPercent'),
    disk: value('host.disk.root.usedPercent'),
    rx: value('host.network.rx'),
    tx: value('host.network.tx'),
    ccpu: value('platform.containers.cpuPercentOfHost'),
    cmem: value('platform.containers.memory'),
  };
}

function sanitizeReason(error) {
  // Command output can carry paths or ids; keep only the first line, bounded.
  return String(error?.message ?? 'Failed')
    .split('\n')[0]
    .slice(0, 160);
}
