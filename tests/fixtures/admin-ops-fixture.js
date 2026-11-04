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
  { _id: 'a'.repeat(24), slug: 'northstar-notes', activeDeploymentId: 'd'.repeat(24) },
  { _id: 'b'.repeat(24), slug: 'atlas-api', activeDeploymentId: 'e'.repeat(24) },
];
const DEPLOYMENTS = [
  {
    _id: 'd'.repeat(24),
    projectId: 'a'.repeat(24),
    activeContainerId: '1'.repeat(64),
    sequenceNumber: 8,
  },
  {
    _id: 'e'.repeat(24),
    projectId: 'b'.repeat(24),
    activeContainerId: '2'.repeat(64),
    sequenceNumber: 14,
  },
  { _id: 'f'.repeat(24), projectId: 'b'.repeat(24), activeContainerId: null, sequenceNumber: 13 },
];

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
