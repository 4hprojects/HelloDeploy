/**
 * Deterministic monitoring data for the browser fixture and route tests. The
 * snapshot is produced by the real collector over fake host and Docker
 * readers, so the screenshots exercise the same code path as production.
 */
import { createMonitoringCollector } from '../../apps/worker/src/monitoring/collector.js';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

function hostCounters(tick) {
  return {
    cpu: { total: 100_000 + tick * 400, idle: 60_000 + tick * 260, iowait: 100 },
    memory: {
      totalBytes: 7.2 * GiB,
      availableBytes: 2.3 * GiB,
      usedBytes: 4.9 * GiB,
      swapTotalBytes: 4 * GiB,
      swapUsedBytes: 2.1 * GiB,
    },
    pressure: { some60: 0.4, full10: 0 },
    interfaces: {
      eth0: { rx: 9_000_000_000 + tick * 470_000, tx: 2_000_000_000 + tick * 150_000 },
    },
    load: { load1: 0.7, load5: 0.85, load15: 0.97 },
    uptimeSeconds: 885_000,
  };
}

const PROJECTS = [
  {
    _id: 'a'.repeat(24),
    slug: 'northstar-notes',
    name: 'Northstar Notes',
    status: 'ACTIVE',
    activeDeploymentId: 'd'.repeat(24),
    buildConfiguration: { healthCheckPath: '/health' },
  },
  {
    _id: 'b'.repeat(24),
    slug: 'atlas-api',
    name: 'Atlas API',
    status: 'ACTIVE',
    activeDeploymentId: 'e'.repeat(24),
    buildConfiguration: { healthCheckPath: '/' },
  },
  {
    _id: 'c'.repeat(24),
    slug: 'paused-portfolio',
    name: 'Paused Portfolio',
    status: 'ACTIVE',
    activeDeploymentId: '9'.repeat(24),
    maintenanceMode: { enabled: true },
  },
  {
    _id: '8'.repeat(24),
    slug: 'old-landing',
    name: 'Old Landing',
    status: 'SUSPENDED',
    activeDeploymentId: null,
  },
];
const DEPLOYMENTS = [
  {
    _id: 'd'.repeat(24),
    projectId: 'a'.repeat(24),
    activeContainerId: '1'.repeat(64),
    containerPort: 41001,
    sequenceNumber: 8,
    updatedAt: new Date('2026-11-04T01:30:00Z'),
  },
  {
    _id: 'e'.repeat(24),
    projectId: 'b'.repeat(24),
    activeContainerId: '2'.repeat(64),
    containerPort: 41002,
    sequenceNumber: 14,
    updatedAt: new Date('2026-11-04T01:30:00Z'),
  },
  { _id: 'f'.repeat(24), projectId: 'b'.repeat(24), activeContainerId: null, sequenceNumber: 13 },
  { _id: '9'.repeat(24), projectId: 'c'.repeat(24), activeContainerId: null, sequenceNumber: 3 },
];

// Northstar answers; Atlas has failed its last three probes.
const PROBES = {
  ['a'.repeat(24)]: {
    consecutiveFailures: 0,
    consecutiveSuccesses: 12,
    lastSuccessAt: '2026-11-05T00:00:00.000Z',
    lastFailureAt: null,
    last: { ok: true, statusCode: 200, latencyMs: 14, at: '2026-11-05T00:00:00.000Z' },
    public: null,
  },
  ['b'.repeat(24)]: {
    consecutiveFailures: 3,
    consecutiveSuccesses: 0,
    lastSuccessAt: '2026-11-04T23:58:30.000Z',
    lastFailureAt: '2026-11-05T00:00:00.000Z',
    last: { ok: false, statusCode: 503, latencyMs: 41, at: '2026-11-05T00:00:00.000Z' },
    public: null,
  },
};

function container(id, name, overrides = {}) {
  return {
    id,
    name,
    status: 'running',
    running: true,
    restarting: false,
    oomKilled: false,
    exitCode: 0,
    dockerHealth: null,
    startedAt: '2026-11-04T01:30:25.000Z',
    restartCount: 0,
    memoryLimitBytes: 256 * MiB,
    cpuLimitCores: 0.25,
    managed: true,
    projectId: null,
    deploymentId: null,
    ...overrides,
  };
}

const CONTAINERS = [
  container('1'.repeat(64), 'hellodeploy-northstar-notes-dddddddd', {
    projectId: 'a'.repeat(24),
    deploymentId: 'd'.repeat(24),
  }),
  container('2'.repeat(64), 'hellodeploy-atlas-api-eeeeeeee', {
    projectId: 'b'.repeat(24),
    deploymentId: 'e'.repeat(24),
    restartCount: 2,
  }),
  container('3'.repeat(64), 'hellodeploy-atlas-api-ffffffff', {
    projectId: 'b'.repeat(24),
    deploymentId: 'f'.repeat(24),
    running: false,
    status: 'exited',
  }),
  container('4'.repeat(64), 'some-other-service', {
    managed: false,
    memoryLimitBytes: null,
    cpuLimitCores: null,
  }),
];

const STATS = new Map([
  [
    '1'.repeat(64),
    {
      cpuPercentOfCore: 3.2,
      memoryBytes: 112 * MiB,
      memoryLimitBytes: 256 * MiB,
      netRxBytes: 1e9,
      netTxBytes: 4e8,
      blockReadBytes: 5e8,
      blockWriteBytes: 6e7,
      pids: 11,
    },
  ],
  [
    '2'.repeat(64),
    {
      cpuPercentOfCore: 21.5,
      memoryBytes: 221 * MiB,
      memoryLimitBytes: 256 * MiB,
      netRxBytes: 3e8,
      netTxBytes: 1e8,
      blockReadBytes: 1e8,
      blockWriteBytes: 2e7,
      pids: 18,
    },
  ],
  [
    '4'.repeat(64),
    {
      cpuPercentOfCore: 1.1,
      memoryBytes: 90 * MiB,
      memoryLimitBytes: 7 * GiB,
      netRxBytes: 1e6,
      netTxBytes: 1e6,
      blockReadBytes: 0,
      blockWriteBytes: 0,
      pids: 4,
    },
  ],
]);

const UNITS = new Map([
  [
    'hellodeploy-web.service',
    {
      loaded: true,
      activeState: 'active',
      subState: 'running',
      memoryBytes: 43 * MiB,
      cpuUsageNs: 3.7e11,
      restarts: 0,
    },
  ],
  [
    'hellodeploy-worker.service',
    {
      loaded: true,
      activeState: 'active',
      subState: 'running',
      memoryBytes: 74 * MiB,
      cpuUsageNs: 1.2e11,
      restarts: 0,
    },
  ],
  [
    'redis-server.service',
    {
      loaded: true,
      activeState: 'active',
      subState: 'running',
      memoryBytes: 12 * MiB,
      cpuUsageNs: 9e10,
      restarts: 0,
    },
  ],
  [
    'docker.service',
    {
      loaded: true,
      activeState: 'active',
      subState: 'running',
      memoryBytes: 180 * MiB,
      cpuUsageNs: 8e11,
      restarts: 0,
    },
  ],
]);

/** Ninety minutes of 15 s samples ending at `end`, with one collection gap. */
export function createFixtureSamples(end = Date.now()) {
  const samples = [];
  for (let i = 239; i >= 0; i -= 1) {
    if (i >= 100 && i < 108) {
      continue;
    }
    const wave = Math.sin(i / 12);
    samples.push({
      t: new Date(end - i * 15_000).toISOString(),
      cpu: Math.round((34 + wave * 12 + (i % 7)) * 10) / 10,
      mem: Math.round((67 + wave * 3) * 10) / 10,
      swap: 52.4,
      disk: 11.8,
      rx: Math.round(470_000 + wave * 120_000),
      tx: Math.round(150_000 + wave * 40_000),
      ccpu: 6.2,
      cmem: 333 * MiB,
    });
  }
  return samples;
}

export async function createAdminOpsFixture() {
  let tick = 0;
  let clock = Date.parse('2026-11-05T00:00:00Z');
  const collector = createMonitoringCollector({
    redis: null,
    logger: { info() {}, warn() {}, error() {} },
    workspacePath: '/var/lib/hellodeploy/builds',
    now: () => new Date(clock),
    deps: {
      coreCount: 4,
      readHostCounters: async () => hostCounters(tick),
      readFilesystem: async () => ({
        totalBytes: 937 * GiB,
        usedBytes: 106 * GiB,
        availableBytes: 784 * GiB,
        usedPercent: 11.9,
        inodesUsedPercent: 2.1,
      }),
      listContainerIds: async () => CONTAINERS.map((c) => c.id),
      inspectContainers: async () => CONTAINERS,
      readContainerStats: async () => STATS,
      readDockerDiskUsage: async () => ({
        images: { sizeBytes: 9.1e9, reclaimableBytes: 4.5e9 },
        buildCache: { sizeBytes: 18.7e9, reclaimableBytes: 15.4e9 },
        volumes: { sizeBytes: 18.9e9, reclaimableBytes: 0 },
      }),
      readUnits: async () => UNITS,
      loadRecords: async () => ({ projects: PROJECTS, deployments: DEPLOYMENTS }),
      loadPolicy: async () => null,
      probeTracker: { run: async () => {}, get: (projectId) => PROBES[projectId] ?? null },
    },
  });
  await collector.collect();
  tick = 15;
  clock += 15_000;
  const snapshot = await collector.collect();
  return {
    snapshot,
    deps: {
      getMonitoringSnapshot: async () => ({
        snapshot: { ...snapshot, collectedAt: new Date().toISOString() },
        freshness: 'fresh',
        ageSeconds: 0,
        reason: null,
      }),
      getRawSamples: async () => createFixtureSamples(),
    },
  };
}

/**
 * Incidents and recorded history in the fixture database, so the incident
 * strip and the longer history ranges render through their real queries.
 */
export async function seedAdminOpsRecords(
  { MonitoringIncident, MonitoringSample },
  end = Date.now(),
) {
  const minute = 60_000;
  await MonitoringIncident.create([
    {
      fingerprint: `app:health:${'b'.repeat(24)}`,
      rule: 'app.health',
      scope: 'project',
      entityId: 'b'.repeat(24),
      entityLabel: 'atlas-api',
      href: '/projects/atlas-api',
      severity: 'critical',
      state: 'active',
      title: 'atlas-api is unhealthy',
      detail: 'Health check returned 503',
      firstSeen: new Date(end - 12 * minute),
      lastSeen: new Date(end - minute),
      occurrences: 2,
    },
    {
      fingerprint: 'host:memory',
      rule: 'host.memory',
      scope: 'host',
      severity: 'warning',
      state: 'acknowledged',
      title: 'Host memory is running low',
      detail: '82% used, pressure 0.4%',
      firstSeen: new Date(end - 95 * minute),
      lastSeen: new Date(end - minute),
      acknowledgedAt: new Date(end - 60 * minute),
    },
    {
      fingerprint: 'host:disk:root',
      rule: 'host.disk',
      scope: 'host',
      severity: 'warning',
      state: 'resolved',
      title: 'Root filesystem is filling up',
      detail: '81% used',
      firstSeen: new Date(end - 300 * minute),
      lastSeen: new Date(end - 200 * minute),
      resolvedAt: new Date(end - 200 * minute),
      resolution: 'recovered',
      expiresAt: new Date(end + 90 * 86_400_000),
    },
  ]);
  const docs = [];
  for (let i = 288; i > 0; i -= 1) {
    if (i > 100 && i < 110) {
      continue;
    }
    const wave = Math.sin(i / 20);
    const stat = (value) => ({
      avg: Math.round(value * 10) / 10,
      max: Math.round(value * 11) / 10,
    });
    docs.push({
      resolution: '5m',
      bucketStart: new Date(Math.floor((end - i * 5 * minute) / (5 * minute)) * 5 * minute),
      count: 20,
      cpu: stat(30 + wave * 15),
      mem: stat(66 + wave * 4),
      swap: stat(52),
      disk: stat(11.8),
      rx: stat(450_000 + wave * 150_000),
      tx: stat(140_000 + wave * 40_000),
      expiresAt: new Date(end + 7 * 86_400_000),
    });
  }
  await MonitoringSample.insertMany(docs);
}
