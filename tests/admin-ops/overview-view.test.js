import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MONITORING_SNAPSHOT_KEY,
  normalizeDashboardPreferences,
  normalizeMonitoringPolicy,
} from '@hellodeploy/contracts';

import { buildLineChart } from '../../apps/web/src/services/admin-ops/charts.js';
import { buildOverview } from '../../apps/web/src/services/admin-ops/overview.service.js';
import {
  clearSnapshotCache,
  getMonitoringSnapshot,
} from '../../apps/web/src/services/admin-ops/snapshot.service.js';
import { createAdminOpsFixture } from '../fixtures/admin-ops-fixture.js';

const policy = normalizeMonitoringPolicy(null);
const preferences = normalizeDashboardPreferences(null);

function overviewWith(deps) {
  return buildOverview({
    policy,
    preferences,
    deps: {
      getAdminOverview: async () => ({ recentActivity: [] }),
      collectServerStats: async () => null,
      getRawSamples: async () => [],
      ...deps,
    },
  });
}

describe('snapshot freshness', () => {
  function redisWith(snapshot) {
    return {
      status: 'ready',
      get: async (key) => (key === MONITORING_SNAPSHOT_KEY ? JSON.stringify(snapshot) : null),
    };
  }

  it('marks a snapshot older than two intervals as stale', async () => {
    clearSnapshotCache();
    const state = await getMonitoringSnapshot({
      redis: redisWith({
        schema: 1,
        collectedAt: '2026-11-05T00:00:00Z',
        intervals: { resourceSeconds: 15 },
      }),
      now: Date.parse('2026-11-05T00:00:45Z'),
    });
    assert.equal(state.freshness, 'stale');
  });

  it('reports no snapshot as unavailable with a reason', async () => {
    clearSnapshotCache();
    const state = await getMonitoringSnapshot({
      redis: { status: 'ready', get: async () => null },
    });
    assert.deepEqual([state.freshness, Boolean(state.reason)], ['unavailable', true]);
  });

  it('refuses a snapshot from an unknown schema version', async () => {
    clearSnapshotCache();
    const state = await getMonitoringSnapshot({
      redis: redisWith({ schema: 99, collectedAt: new Date().toISOString() }),
    });
    assert.equal(state.snapshot, null);
  });
});

describe('overview from the collector snapshot', () => {
  it('shows CPU from the collector', async () => {
    const { deps } = await createAdminOpsFixture();
    const overview = await overviewWith(deps);
    assert.equal(overview.kpis.find((k) => k.key === 'cpu').display, '35%');
  });

  it('greys out readings once the snapshot is stale', async () => {
    const { snapshot } = await createAdminOpsFixture();
    const overview = await overviewWith({
      getMonitoringSnapshot: async () => ({
        snapshot,
        freshness: 'stale',
        ageSeconds: 120,
        reason: 'old',
      }),
    });
    assert.deepEqual(
      [overview.status, overview.kpis.find((k) => k.key === 'memory').tone],
      ['stale', 'unknown'],
    );
  });

  it('shows CPU and network as Unavailable without a snapshot', async () => {
    const overview = await overviewWith({
      getMonitoringSnapshot: async () => ({
        snapshot: null,
        freshness: 'unavailable',
        reason: 'none',
      }),
    });
    assert.deepEqual(
      overview.kpis.filter((k) => ['cpu', 'network'].includes(k.key)).map((k) => k.display),
      ['Unavailable', 'Unavailable'],
    );
  });

  it('never reports applications as healthy from running containers alone', async () => {
    const { deps } = await createAdminOpsFixture();
    const overview = await overviewWith(deps);
    assert.equal(overview.kpis.find((k) => k.key === 'apps').display, 'Unknown');
  });

  it('lists configured limits apart from actual memory use', async () => {
    const { deps } = await createAdminOpsFixture();
    const overview = await overviewWith(deps);
    const atlas = overview.consumers.rows.find((row) => row.name === 'atlas-api');
    assert.deepEqual([atlas.memoryBytes, atlas.limitBytes], [221 * 1024 ** 2, 256 * 1024 ** 2]);
  });
});

describe('line charts', () => {
  const start = Date.parse('2026-11-05T00:00:00Z');
  const sample = (seconds, cpu) => ({ t: new Date(start + seconds * 1000).toISOString(), cpu });
  const series = [{ key: 'cpu', label: 'CPU', unit: '%', max: 100 }];

  it('breaks the line at a collection gap instead of bridging it', () => {
    const chart = buildLineChart(
      [sample(0, 10), sample(15, 20), sample(300, 30), sample(315, 40)],
      {
        start,
        end: start + 330_000,
        stepSeconds: 15,
        series,
      },
    );
    assert.equal(chart.lines[0].segments.length, 2);
  });

  it('breaks the line at a missing value instead of drawing zero', () => {
    const chart = buildLineChart([sample(0, 10), sample(15, null), sample(30, 30)], {
      start,
      end: start + 45_000,
      stepSeconds: 15,
      series,
    });
    assert.equal(chart.lines[0].segments.length, 2);
  });

  it('puts every series of one chart on the same scale', () => {
    const chart = buildLineChart([{ t: new Date(start).toISOString(), rx: 400, tx: 100 }], {
      start,
      end: start + 15_000,
      stepSeconds: 15,
      series: [
        { key: 'rx', label: 'In', unit: 'bytes/s' },
        { key: 'tx', label: 'Out', unit: 'bytes/s' },
      ],
    });
    assert.equal(chart.lines[0].max, chart.lines[1].max);
  });
});
