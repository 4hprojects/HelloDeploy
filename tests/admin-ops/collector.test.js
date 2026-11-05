import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  computeCpuUtilization,
  computeNetworkRates,
  parseMemoryInfo,
  parseNetDev,
  parseProcStat,
  readFilesystem,
} from '../../apps/worker/src/monitoring/proc.js';
import {
  parseDockerDiskUsage,
  parseDockerInspect,
  parseDockerSize,
  parseDockerStats,
} from '../../apps/worker/src/monitoring/docker.js';
import { classifyContainers } from '../../apps/worker/src/monitoring/classify.js';
import { computeUnitCpu, parseSystemctlShow } from '../../apps/worker/src/monitoring/systemd.js';
import {
  createMonitoringCollector,
  toRawSample,
} from '../../apps/worker/src/monitoring/collector.js';
import { createAdminOpsFixture } from '../fixtures/admin-ops-fixture.js';

const MEMINFO = `MemTotal:        7511040 kB
MemFree:          339200 kB
MemAvailable:    2322432 kB
Buffers:          102400 kB
Cached:          2600000 kB
SwapTotal:       4193280 kB
SwapFree:        2010000 kB
`;

const NETDEV = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 5000 10 0 0 0 0 0 0 5000 10 0 0 0 0 0 0
  eth0: 1000000 900 0 0 0 0 0 0 400000 800 0 0 0 0 0 0
veth12ab: 777 3 0 0 0 0 0 0 888 4 0 0 0 0 0 0
docker0: 999 3 0 0 0 0 0 0 999 4 0 0 0 0 0 0
`;

describe('host CPU', () => {
  it('normalizes utilization across all cores', () => {
    const before = parseProcStat('cpu  100 0 100 800 0 0 0 0 0 0\n');
    const after = parseProcStat('cpu  250 0 150 1000 0 0 0 0 0 0\n');
    assert.equal(computeCpuUtilization(before, after), 50);
  });

  it('counts iowait as idle time, not busy time', () => {
    const before = parseProcStat('cpu  0 0 0 0 0 0 0 0\n');
    const after = parseProcStat('cpu  50 0 0 0 50 0 0 0\n');
    assert.equal(computeCpuUtilization(before, after), 50);
  });

  it('has no reading from the first sample alone', () => {
    assert.equal(computeCpuUtilization(null, parseProcStat('cpu  1 0 1 1\n')), null);
  });

  it('has no reading when the counters did not advance', () => {
    const sample = parseProcStat('cpu  1 0 1 1\n');
    assert.equal(computeCpuUtilization(sample, sample), null);
  });
});

describe('host memory', () => {
  it('treats reclaimable cache as available, from MemAvailable', () => {
    const memory = parseMemoryInfo(MEMINFO);
    assert.equal(memory.usedBytes, (7511040 - 2322432) * 1024);
  });

  it('reports swap in use from total minus free', () => {
    assert.equal(parseMemoryInfo(MEMINFO).swapUsedBytes, (4193280 - 2010000) * 1024);
  });

  it('refuses to guess when MemAvailable is missing', () => {
    assert.equal(parseMemoryInfo('MemTotal: 1000 kB\nMemFree: 10 kB\n'), null);
  });
});

describe('host network', () => {
  it('counts physical interfaces only', () => {
    assert.deepEqual(Object.keys(parseNetDev(NETDEV)), ['eth0']);
  });

  it('turns counter deltas into bytes per second', () => {
    const rates = computeNetworkRates(
      { interfaces: { eth0: { rx: 1000, tx: 500 } } },
      { interfaces: { eth0: { rx: 16_000, tx: 2000 } } },
      15,
    );
    assert.deepEqual([rates.rxBytesPerSecond, rates.txBytesPerSecond], [1000, 100]);
  });

  it('skips an interface whose counter reset instead of reporting a negative spike', () => {
    const rates = computeNetworkRates(
      { interfaces: { eth0: { rx: 900_000, tx: 500 }, eth1: { rx: 0, tx: 0 } } },
      { interfaces: { eth0: { rx: 100, tx: 600 }, eth1: { rx: 1500, tx: 1500 } } },
      15,
    );
    assert.deepEqual([rates.rxBytesPerSecond, rates.resetInterfaces], [100, ['eth0']]);
  });

  it('has no reading when the only interface just appeared', () => {
    const rates = computeNetworkRates(
      { interfaces: { eth0: { rx: 1, tx: 1 } } },
      { interfaces: { wlan0: { rx: 5000, tx: 5000 } } },
      15,
    );
    assert.equal(rates.rxBytesPerSecond, null);
  });

  it('keeps a genuinely idle link at zero, not unavailable', () => {
    const counters = { interfaces: { eth0: { rx: 10, tx: 10 } } };
    assert.equal(computeNetworkRates(counters, counters, 15).rxBytesPerSecond, 0);
  });
});

describe('filesystems', () => {
  it('reports usage the way df does, with the root reserve counted as full', async () => {
    const disk = await readFilesystem('/', {
      statfs: async () => ({
        bsize: 4096,
        blocks: 1000,
        bfree: 300,
        bavail: 250,
        files: 100,
        ffree: 40,
      }),
    });
    assert.equal(disk.usedPercent, 73.7);
  });
});

describe('docker output parsing', () => {
  it('reads binary and decimal sizes', () => {
    assert.deepEqual(
      [parseDockerSize('112.5MiB'), parseDockerSize('1.57GB'), parseDockerSize('0B')],
      [117_964_800, 1_570_000_000, 0],
    );
  });

  it('keeps container CPU relative to one core as docker reports it', () => {
    const stats = parseDockerStats(
      '{"ID":"abc","CPUPerc":"187.50%","MemUsage":"10MiB / 256MiB","NetIO":"1kB / 2kB","BlockIO":"0B / 0B","PIDs":"3"}',
    );
    assert.equal(stats.get('abc').cpuPercentOfCore, 187.5);
  });

  it('reads a missing CPU value as null', () => {
    const stats = parseDockerStats(
      '{"ID":"abc","CPUPerc":"--","MemUsage":"-- / --","NetIO":"--","BlockIO":"--","PIDs":"--"}',
    );
    assert.deepEqual(
      [stats.get('abc').cpuPercentOfCore, stats.get('abc').memoryBytes],
      [null, null],
    );
  });

  it('treats a zero Docker memory limit as unlimited, not zero', () => {
    const [row] = parseDockerInspect(
      '{"id":"x","name":"/a","state":{"Status":"running","Running":true},"restartCount":0,"memory":0,"nanoCpus":0,"labels":{}}',
    );
    assert.deepEqual([row.memoryLimitBytes, row.cpuLimitCores], [null, null]);
  });

  it('keeps only state, limits and HelloDeploy labels from inspect output', () => {
    const [row] = parseDockerInspect(
      JSON.stringify({
        id: 'x',
        name: '/hellodeploy-a-1',
        state: { Status: 'running', Running: true, StartedAt: '2026-11-04T01:30:25Z' },
        restartCount: 1,
        memory: 268435456,
        nanoCpus: 250000000,
        labels: { 'hellodeploy.managed': 'true', 'com.example.secret': 'hunter2' },
      }),
    );
    assert.equal(JSON.stringify(row).includes('hunter2'), false);
  });

  it('reads docker system df rows by type', () => {
    const usage = parseDockerDiskUsage(
      '{"Type":"Build Cache","Size":"18.67GB","Reclaimable":"15.41GB"}\n{"Type":"Images","Size":"9.121GB","Reclaimable":"4.559GB (49%)"}',
    );
    assert.equal(usage.images.reclaimableBytes, 4_559_000_000);
  });
});

describe('container classification', () => {
  const projects = [{ _id: 'p1', activeDeploymentId: 'd2' }];
  const deployments = [
    { _id: 'd1', projectId: 'p1', activeContainerId: 'c1' },
    { _id: 'd2', projectId: 'p1', activeContainerId: 'c2' },
    { _id: 'd3', projectId: 'p1', candidateContainerId: 'c3', activeContainerId: null },
  ];
  const managed = (id, deploymentId) => ({
    id,
    name: `hellodeploy-x-${id}`,
    managed: true,
    projectId: 'p1',
    deploymentId,
  });
  const roles = classifyContainers(
    [
      managed('c1', 'd1'),
      managed('c2', 'd2'),
      managed('c3', 'd3'),
      managed('c9', 'gone'),
      { id: 'b1', name: 'buildx_buildkit_builder0', managed: false },
      { id: 'u1', name: 'postgres', managed: false },
    ],
    { projects, deployments },
  ).map((c) => c.role);

  it('marks only the active deployment container of the project as the live release', () => {
    assert.deepEqual(roles.slice(0, 2), ['retained', 'active']);
  });

  it('keeps a deploying candidate apart from the live release', () => {
    assert.equal(roles[2], 'candidate');
  });

  it('flags a labelled container no deployment claims as orphaned', () => {
    assert.equal(roles[3], 'orphaned');
  });

  it('separates build containers from other software on the host', () => {
    assert.deepEqual(roles.slice(4), ['build', 'unmanaged']);
  });
});

describe('systemd units', () => {
  it('reads an absent unit as not installed with no usage', () => {
    const units = parseSystemctlShow(
      'Id=nosuch.service\nLoadState=not-found\nActiveState=inactive\nSubState=dead\nMemoryCurrent=[not set]\nCPUUsageNSec=[not set]\n',
    );
    assert.deepEqual(
      [units.get('nosuch.service').loaded, units.get('nosuch.service').memoryBytes],
      [false, null],
    );
  });

  it('turns cgroup CPU nanoseconds into a share of the host', () => {
    assert.equal(computeUnitCpu({ cpuUsageNs: 0 }, { cpuUsageNs: 6e9 }, 15, 4), 10);
  });
});

describe('collector cycle', () => {
  function collectorWith(overrides = {}) {
    let tick = 0;
    const warnings = [];
    const collector = createMonitoringCollector({
      redis: null,
      logger: { info() {}, warn: (msg) => warnings.push(msg), error() {} },
      deps: {
        coreCount: 4,
        readHostCounters: async () => {
          tick += 1;
          return {
            cpu: { total: 1000 * tick, idle: 600 * tick, iowait: 0 },
            memory: {
              totalBytes: 100,
              availableBytes: 40,
              usedBytes: 60,
              swapTotalBytes: 0,
              swapUsedBytes: 0,
            },
            pressure: null,
            interfaces: { eth0: { rx: 1000 * tick, tx: 0 } },
            load: { load1: 1, load5: 1, load15: 1 },
            uptimeSeconds: 10,
          };
        },
        readFilesystem: async () => ({
          totalBytes: 100,
          usedBytes: 10,
          availableBytes: 90,
          usedPercent: 10,
        }),
        listContainerIds: async () => [],
        inspectContainers: async () => [],
        readContainerStats: async () => new Map(),
        readDockerDiskUsage: async () => ({}),
        readUnits: async () => new Map(),
        loadRecords: async () => ({ projects: [], deployments: [] }),
        loadPolicy: async () => null,
        ...overrides,
      },
    });
    return { collector, warnings };
  }

  const value = (snapshot, key) => snapshot.metrics.find((m) => m.key === key);

  it('reports CPU as unavailable on the first cycle rather than zero', async () => {
    const { collector } = collectorWith();
    const snapshot = await collector.collect();
    assert.deepEqual(
      [
        value(snapshot, 'host.cpu.utilization').value,
        value(snapshot, 'host.cpu.utilization').freshness,
      ],
      [null, 'unavailable'],
    );
  });

  it('reports CPU from the second cycle', async () => {
    const { collector } = collectorWith();
    await collector.collect();
    assert.equal(value(await collector.collect(), 'host.cpu.utilization').value, 40);
  });

  it('reports no swap as unavailable with a reason, not as 0% used', async () => {
    const { collector } = collectorWith();
    const swap = value(await collector.collect(), 'host.swap.usedPercent');
    assert.deepEqual([swap.value, swap.reason], [null, 'No swap configured']);
  });

  it('keeps publishing host metrics when Docker fails', async () => {
    const { collector } = collectorWith({
      listContainerIds: async () => {
        throw new Error('Cannot connect to the Docker daemon');
      },
    });
    const snapshot = await collector.collect();
    assert.deepEqual(
      [
        snapshot.sources.docker.ok,
        snapshot.containers,
        value(snapshot, 'host.memory.usedPercent').value,
      ],
      [false, null, 60],
    );
  });

  it('stops calling a source after three consecutive failures', async () => {
    let calls = 0;
    const { collector } = collectorWith({
      listContainerIds: async () => {
        calls += 1;
        throw new Error('daemon down');
      },
    });
    for (let i = 0; i < 5; i += 1) {
      await collector.collect();
    }
    assert.equal(calls, 3);
  });

  it('skips per-container stats when the policy turns them off', async () => {
    let statsCalls = 0;
    const { collector } = collectorWith({
      readContainerStats: async () => {
        statsCalls += 1;
        return new Map();
      },
      loadPolicy: async () => ({ collectors: { containerStats: false } }),
    });
    await collector.collect();
    assert.equal(statsCalls, 0);
  });

  it('does not collect without the shared lease', async () => {
    const collector = createMonitoringCollector({
      redis: {
        status: 'ready',
        set: async () => null,
        get: async () => 'someone-else',
        multi() {},
      },
      logger: { info() {}, warn() {}, error() {} },
      deps: { loadPolicy: async () => null },
    });
    assert.equal(await collector.runCycle(), null);
  });
});

describe('published snapshot', () => {
  it('never names or attributes containers HelloDeploy does not manage', async () => {
    const { snapshot } = await createAdminOpsFixture();
    const unmanaged = snapshot.containers.find((c) => c.role === 'unmanaged');
    assert.deepEqual([unmanaged.name, unmanaged.id, unmanaged.projectId], [null, null, null]);
  });

  it('counts a retained release separately from live releases', async () => {
    const { snapshot } = await createAdminOpsFixture();
    assert.deepEqual(
      [
        snapshot.containerCounts.byRole.active,
        snapshot.containers.filter((c) => c.role === 'retained').length,
      ],
      [2, 1],
    );
  });

  it('converts container CPU to a share of the whole host', async () => {
    const { snapshot } = await createAdminOpsFixture();
    const atlas = snapshot.containers.find(
      (c) => c.projectSlug === 'atlas-api' && c.role === 'active',
    );
    assert.equal(atlas.cpuPercentOfHost, 5.38);
  });

  it('keeps raw samples compact and keyed by metric', async () => {
    const { snapshot } = await createAdminOpsFixture();
    assert.deepEqual(Object.keys(toRawSample(snapshot)), [
      't',
      'cpu',
      'mem',
      'swap',
      'disk',
      'rx',
      'tx',
      'ccpu',
      'cmem',
    ]);
  });
});
