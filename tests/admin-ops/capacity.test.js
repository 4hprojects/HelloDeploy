import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeMonitoringPolicy } from '@hellodeploy/contracts';

import { buildCapacity, capacityBar } from '../../apps/web/src/services/admin-ops/capacity.js';
import { observe } from '../../apps/worker/src/monitoring/alert-engine.js';

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const policy = normalizeMonitoringPolicy(null);

function snapshotWith({
  total = 8 * GiB,
  used = 4 * GiB,
  available = 4 * GiB,
  containers = [],
  worker = {},
} = {}) {
  return {
    snapshot: {
      collectedAt: '2026-11-05T00:00:00Z',
      metrics: [
        { key: 'host.memory.total', value: total },
        { key: 'host.memory.used', value: used },
        { key: 'host.memory.available', value: available },
        { key: 'host.cpu.cores', value: 4 },
        { key: 'host.cpu.utilization', value: 30 },
      ],
      disks: [
        {
          key: 'root',
          label: 'Root',
          totalBytes: 100 * GiB,
          usedBytes: 90 * GiB,
          availableBytes: 10 * GiB,
        },
      ],
      containers,
      worker: { buildMemoryMb: 1024, ...worker },
    },
    freshness: 'fresh',
  };
}

const live = (memoryBytes, memoryLimitBytes, cpuLimitCores = 0.25) => ({
  role: 'active',
  running: true,
  memoryBytes,
  memoryLimitBytes,
  cpuLimitCores,
});

describe('capacity under policy', () => {
  it('keeps configured limits apart from actual use', () => {
    const { memory } = buildCapacity(
      snapshotWith({ containers: [live(100 * MiB, 512 * MiB)] }),
      policy,
    );
    assert.deepEqual([memory.appUse, memory.allocated], [100 * MiB, 512 * MiB]);
  });

  it('counts a release without a memory limit as unlimited, not as zero allocation', () => {
    const capacity = buildCapacity(snapshotWith({ containers: [live(100 * MiB, null)] }), policy);
    assert.equal(capacity.unlimitedMemory, 1);
  });

  it('ignores retained releases that are not running', () => {
    const capacity = buildCapacity(
      snapshotWith({ containers: [{ role: 'retained', running: false, memoryLimitBytes: GiB }] }),
      policy,
    );
    assert.equal(capacity.memory.allocated, 0);
  });

  it('flags overcommit when limits exceed what the policy leaves for apps', () => {
    const containers = Array.from({ length: 8 }, () => live(50 * MiB, GiB));
    const { memory } = buildCapacity(snapshotWith({ containers }), policy);
    assert.equal(memory.overcommitted, true);
  });

  it('reports the reserve as breached when available memory falls inside it', () => {
    const { memory } = buildCapacity(
      snapshotWith({ used: 7.5 * GiB, available: 0.5 * GiB }),
      policy,
    );
    assert.equal(memory.reserveBreached, true);
  });

  it('says whether a local build fits now, from available memory minus the reserve', () => {
    const { memory } = buildCapacity(
      snapshotWith({ used: 6.5 * GiB, available: 1.5 * GiB }),
      policy,
    );
    assert.equal(memory.roomForBuildNow, false);
  });

  it('flags disk headroom inside the reserve', () => {
    assert.equal(buildCapacity(snapshotWith(), policy).disk.reserveBreached, true);
  });

  it('is unavailable without a snapshot rather than showing zeros', () => {
    assert.equal(buildCapacity({ snapshot: null, reason: 'none' }, policy).available, false);
  });

  it('never draws bars past the physical total', () => {
    const rects = capacityBar(100, [
      { key: 'a', value: 80 },
      { key: 'b', value: 60 },
    ]);
    assert.equal(Number(rects[1].x) + Number(rects[1].width), 100);
  });
});

describe('capacity alert rule', () => {
  const memorySnapshot = (availableGiB) => ({
    metrics: [
      { key: 'host.memory.total', value: 8 * GiB },
      { key: 'host.memory.available', value: availableGiB * GiB },
    ],
  });

  it('warns when available memory is inside the reserve', () => {
    const rule = observe(memorySnapshot(0.8), policy).find((o) => o.rule === 'capacity.memory');
    assert.equal(rule.level, 'warning');
  });

  it('clears only well above the reserve', () => {
    const rule = observe(memorySnapshot(1.3), policy).find((o) => o.rule === 'capacity.memory');
    assert.deepEqual([rule.level, rule.clear], [null, false]);
  });
});

describe('attention list', () => {
  it('does not repeat an application already shown as an open incident', async () => {
    const { buildOverview } =
      await import('../../apps/web/src/services/admin-ops/overview.service.js');
    const { createAdminOpsFixture } = await import('../fixtures/admin-ops-fixture.js');
    const fixture = await createAdminOpsFixture();
    const overview = await buildOverview({
      policy,
      preferences: { historyRange: '1h', tableRows: 25, hiddenWidgets: [] },
      deps: {
        ...fixture.deps,
        getAdminOverview: async () => ({ recentActivity: [] }),
        collectServerStats: async () => null,
        getDeploymentActivity: async () => ({ active: [], recent: [], unresolvedFailures: [] }),
        builderControlEnabled: false,
        listOpenIncidents: async () => [{ fingerprint: `app:health:${'b'.repeat(24)}` }],
        listRecentlyResolved: async () => [],
        getHistory: async () => null,
        getPendingClosures: async () => [],
      },
    });
    assert.equal(
      overview.attention.some((item) => item.title.startsWith('atlas-api')),
      false,
    );
  });

  it('raises an account closure past its 30-day commitment as critical', async () => {
    const { buildOverview } =
      await import('../../apps/web/src/services/admin-ops/overview.service.js');
    const overview = await buildOverview({
      policy,
      preferences: { historyRange: '1h', tableRows: 25, hiddenWidgets: [] },
      deps: {
        getAdminOverview: async () => ({ recentActivity: [] }),
        collectServerStats: async () => null,
        getMonitoringSnapshot: async () => ({ snapshot: null, freshness: 'unavailable' }),
        getRawSamples: async () => [],
        getDeploymentActivity: async () => ({ active: [], recent: [], unresolvedFailures: [] }),
        builderControlEnabled: false,
        listOpenIncidents: async () => [],
        listRecentlyResolved: async () => [],
        getHistory: async () => null,
        getPendingClosures: async () => [
          { closureRequestedAt: new Date(Date.now() - 31 * 86_400_000) },
        ],
      },
    });
    assert.equal(
      overview.attention.find((item) => /closure/.test(item.title)).severity,
      'critical',
    );
  });
});
