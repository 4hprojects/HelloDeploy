import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { normalizeDashboardPreferences, normalizeMonitoringPolicy } from '@hellodeploy/contracts';

import {
  createProbeTracker,
  deriveAppHealth,
  probeOnce,
} from '../../apps/worker/src/monitoring/probes.js';
import { healthTransitions } from '../../apps/worker/src/monitoring/collector.js';
import { buildOverview } from '../../apps/web/src/services/admin-ops/overview.service.js';
import { createAdminOpsFixture } from '../fixtures/admin-ops-fixture.js';

const policy = normalizeMonitoringPolicy(null);
const NOW = Date.parse('2026-11-05T00:10:00Z');
const live = { status: 'ACTIVE', activeDeploymentId: 'd1', maintenance: false };
const running = {
  running: true,
  restarting: false,
  status: 'running',
  startedAt: '2026-11-05T00:00:00Z',
};
const probe = (overrides) => ({
  consecutiveFailures: 0,
  consecutiveSuccesses: 0,
  lastSuccessAt: null,
  last: { ok: true, statusCode: 200, latencyMs: 5, at: '2026-11-05T00:10:00Z' },
  ...overrides,
});
const health = (input) =>
  deriveAppHealth({
    project: live,
    container: running,
    policy,
    probesEnabled: true,
    nowMs: NOW,
    ...input,
  }).status;

describe('application health', () => {
  it('is not healthy when the container runs but the health check fails', () => {
    assert.equal(
      health({ probe: probe({ consecutiveFailures: 3, last: { ok: false, statusCode: 500 } }) }),
      'unhealthy',
    );
  });

  it('is degraded, not unhealthy, after a single failed probe', () => {
    assert.equal(
      health({
        probe: probe({
          consecutiveFailures: 1,
          lastSuccessAt: 'x',
          last: { ok: false, statusCode: 502 },
        }),
      }),
      'degraded',
    );
  });

  it('is healthy only after the configured number of passing probes', () => {
    assert.equal(health({ probe: probe({ consecutiveSuccesses: 2 }) }), 'healthy');
  });

  it('is not yet healthy after one passing probe', () => {
    assert.equal(health({ probe: probe({ consecutiveSuccesses: 1 }) }), 'starting');
  });

  it('reports an intentionally suspended project as stopped, not as an outage', () => {
    assert.equal(health({ project: { ...live, status: 'SUSPENDED' }, container: null }), 'stopped');
  });

  it('reports maintenance mode as maintenance', () => {
    assert.equal(
      health({ project: { ...live, maintenance: true }, container: null }),
      'maintenance',
    );
  });

  it('reports a missing live container as unhealthy', () => {
    assert.equal(health({ container: null }), 'unhealthy');
  });

  it('reports a crash-looping container as restarting', () => {
    assert.equal(health({ container: { ...running, restarting: true } }), 'restarting');
  });

  it('is unknown when probes are turned off, even with the container running', () => {
    assert.equal(health({ probesEnabled: false, probe: null }), 'unknown');
  });

  it('is unknown before the first probe', () => {
    assert.equal(health({ probe: null }), 'unknown');
  });
});

describe('loopback probes', () => {
  let server;
  let base;
  before(async () => {
    server = http.createServer((req, res) => {
      if (req.url === '/slow') {
        setTimeout(() => res.end('late'), 500);
        return;
      }
      res.statusCode = { '/ok': 200, '/redirect': 302, '/down': 503 }[req.url] ?? 404;
      res.end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  it('passes on a 2xx answer', async () => {
    assert.equal((await probeOnce(`${base}/ok`)).ok, true);
  });

  it('fails on a 5xx answer', async () => {
    assert.deepEqual(
      [(await probeOnce(`${base}/down`)).ok, (await probeOnce(`${base}/down`)).statusCode],
      [false, 503],
    );
  });

  it('accepts a redirect without following it, like the deploy health check', async () => {
    assert.equal((await probeOnce(`${base}/redirect`)).statusCode, 302);
  });

  it('fails when the app does not answer within the timeout', async () => {
    assert.equal((await probeOnce(`${base}/slow`, { timeoutMs: 50 })).ok, false);
  });

  it('counts consecutive results per project', async () => {
    const results = [false, false, true];
    const tracker = createProbeTracker({
      probe: async () => ({ ok: results.shift(), statusCode: 200 }),
    });
    const target = [{ projectId: 'p1', port: 1, path: '/' }];
    await tracker.run(target);
    await tracker.run(target);
    await tracker.run(target);
    assert.deepEqual(
      [tracker.get('p1').consecutiveSuccesses, tracker.get('p1').consecutiveFailures],
      [1, 0],
    );
  });

  it('forgets a project once it has no live release', async () => {
    const tracker = createProbeTracker({ probe: async () => ({ ok: true }) });
    await tracker.run([{ projectId: 'p1', port: 1, path: '/' }]);
    await tracker.run([]);
    assert.equal(tracker.get('p1'), null);
  });
});

describe('health change events', () => {
  const apps = [{ projectId: 'p1', slug: 'one', health: 'unhealthy' }];

  it('emits nothing on the first snapshot after a start', () => {
    assert.deepEqual(healthTransitions(null, apps, 'now'), []);
  });

  it('emits a change from the previous state', () => {
    assert.deepEqual(healthTransitions(new Map([['p1', 'healthy']]), apps, 'now'), [
      { type: 'app', projectId: 'p1', slug: 'one', from: 'healthy', to: 'unhealthy', at: 'now' },
    ]);
  });
});

describe('operations overview', () => {
  async function overviewWith(deps = {}) {
    const fixture = await createAdminOpsFixture();
    return buildOverview({
      policy,
      preferences: normalizeDashboardPreferences(null),
      deps: {
        ...fixture.deps,
        getAdminOverview: async () => ({ recentActivity: [] }),
        collectServerStats: async () => ({
          queue: { waiting: 2, active: 0, delayed: 0, failed: 5, completed: 40, paused: true },
          worker: { ready: true },
          mongo: { connected: true },
        }),
        getDeploymentActivity: async () => ({ active: [], recent: [], unresolvedFailures: [] }),
        builderControlEnabled: false,
        ...deps,
      },
    });
  }

  it('lists the failing application first', async () => {
    const overview = await overviewWith();
    assert.equal(overview.apps.rows[0].slug, 'atlas-api');
  });

  it('counts stopped and maintenance apps outside the healthy ratio', async () => {
    const overview = await overviewWith();
    assert.equal(overview.kpis.find((k) => k.key === 'apps').display, '1 / 2');
  });

  it('shows every application as unknown once the snapshot is stale', async () => {
    const { snapshot } = await createAdminOpsFixture();
    const overview = await overviewWith({
      getMonitoringSnapshot: async () => ({
        snapshot,
        freshness: 'stale',
        ageSeconds: 300,
        reason: 'old',
      }),
    });
    assert.deepEqual([...new Set(overview.apps.rows.map((r) => r.health))], ['unknown']);
  });

  it('reports a paused queue as paused with a warning', async () => {
    const overview = await overviewWith();
    assert.deepEqual(
      [overview.deployments.queue.paused, overview.kpis.find((k) => k.key === 'deployments').tone],
      [true, 'warning'],
    );
  });

  it('reports a disabled build service as disabled, not as a failure', async () => {
    const overview = await overviewWith();
    assert.deepEqual([overview.builder.state, overview.builder.label], ['disabled', 'Disabled']);
  });

  it('raises a still-failing latest deployment as attention, not retained history', async () => {
    const overview = await overviewWith({
      getDeploymentActivity: async () => ({
        active: [],
        recent: [],
        unresolvedFailures: [{ project: 'atlas-api', href: '/projects/atlas-api' }],
      }),
    });
    assert.ok(overview.attention.some((item) => item.title.includes('latest deployment failed')));
  });

  it('does not raise retained failed queue jobs as attention', async () => {
    const overview = await overviewWith();
    assert.equal(
      overview.attention.some((item) => /failed job/i.test(item.title)),
      false,
    );
  });

  it('marks an uninstalled platform unit as not supported rather than down', async () => {
    const overview = await overviewWith();
    assert.equal(overview.services.find((s) => s.key === 'tunnel').state, 'unsupported');
  });

  it('flags a stage that has run too long as possibly stuck', async () => {
    const overview = await overviewWith({
      getDeploymentActivity: async () => ({
        active: [
          {
            project: 'atlas-api',
            href: '/x',
            sequence: 3,
            stage: 'BUILDING',
            elapsedSeconds: 3600,
            stuck: true,
          },
        ],
        recent: [],
        unresolvedFailures: [],
      }),
    });
    assert.equal(overview.kpis.find((k) => k.key === 'deployments').tone, 'critical');
  });
});
