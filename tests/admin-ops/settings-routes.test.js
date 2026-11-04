import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

process.env.SESSION_SECRET = ['admin', 'ops', 'route', 'test', 'session'].join('-');
process.env.PLATFORM_DOMAIN = 'example.test';

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { AuditEvent, MonitoringIncident, PlatformSetting, User } =
  await import('@hellodeploy/database');
const { MONITORING_POLICY_DEFAULTS, PlatformRole, UserStatus } =
  await import('@hellodeploy/contracts');
const { configureAuditService } = await import('@hellodeploy/observability');
const { hashPassword } = await import('@hellodeploy/auth');
const { createApp } = await import('../../apps/web/src/app.js');
const { clearMonitoringPolicyCache } =
  await import('../../apps/web/src/services/admin-ops/monitoring-policy.service.js');

const PASSWORD = 'correct-horse-battery-staple';

function policyForm(revision, overrides = {}) {
  const d = MONITORING_POLICY_DEFAULTS;
  const form = new URLSearchParams({
    revision: String(revision),
    memoryPressureCritical: String(d.memoryPressureCritical),
    'probes.failuresBeforeUnhealthy': '3',
    'probes.successesBeforeHealthy': '2',
  });
  for (const [key, value] of Object.entries(d.intervals)) {
    form.set(`intervals.${key}`, String(value));
  }
  for (const [rule, values] of Object.entries(d.thresholds)) {
    for (const [part, value] of Object.entries(values)) {
      form.set(`thresholds.${rule}.${part}`, String(value));
    }
  }
  for (const [key, value] of Object.entries(d.retention)) {
    form.set(`retention.${key}`, String(value));
  }
  for (const [key, value] of Object.entries(d.capacity)) {
    form.set(`capacity.${key}`, String(value));
  }
  for (const [key, value] of Object.entries({ ...d.collectors, ...overrides.collectors })) {
    form.set(`collectors.${key}`, String(value));
  }
  for (const [key, value] of Object.entries(overrides.fields ?? {})) {
    form.set(key, value);
  }
  return form;
}

describe('admin overview settings routes', () => {
  let server;
  let baseUrl;
  const sessions = {};

  async function signIn(email) {
    const page = await fetch(`${baseUrl}/auth/sign-in`);
    const cookie = page.headers.get('set-cookie').split(';')[0];
    const csrf = /<meta name="csrf-token" content="([^"]+)"/.exec(await page.text())[1];
    const res = await fetch(`${baseUrl}/auth/sign-in`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, email, password: PASSWORD }),
    });
    const sessionCookie = (res.headers.get('set-cookie') ?? cookie).split(';')[0];
    const home = await fetch(`${baseUrl}/admin/overview/settings`, {
      headers: { cookie: sessionCookie },
      redirect: 'manual',
    });
    const html = await home.text();
    return {
      cookie: sessionCookie,
      csrf: /<meta name="csrf-token" content="([^"]+)"/.exec(html)?.[1] ?? csrf,
    };
  }

  function post(who, path, body, extraHeaders = {}) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        cookie: who.cookie,
        'content-type': 'application/x-www-form-urlencoded',
        ...extraHeaders,
      },
      body,
    });
  }

  function withCsrf(who, form) {
    form.set('_csrf', who.csrf);
    return form;
  }

  before(async () => {
    await startTestDb();
    const { AuditEvent: Model } = await import('@hellodeploy/database');
    configureAuditService(Model);
    const passwordHash = await hashPassword(PASSWORD);
    const base = {
      lastName: 'Admin',
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    };
    await User.create([
      {
        ...base,
        firstName: 'Super',
        email: 'super@example.test',
        platformRole: PlatformRole.SUPER_ADMIN,
      },
      {
        ...base,
        firstName: 'Plain',
        email: 'admin@example.test',
        platformRole: PlatformRole.ADMIN,
      },
      {
        ...base,
        firstName: 'Other',
        email: 'other@example.test',
        platformRole: PlatformRole.ADMIN,
      },
      { ...base, firstName: 'User', email: 'user@example.test', platformRole: PlatformRole.USER },
    ]);
    const app = createApp({ readinessCheck: async () => ({ ready: true }) });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    server.appRef = app;
    for (const [name, email] of Object.entries({
      superAdmin: 'super@example.test',
      admin: 'admin@example.test',
      other: 'other@example.test',
      user: 'user@example.test',
    })) {
      sessions[name] = await signIn(email);
    }
  });

  after(async () => {
    server.close();
    await server.appRef.locals.drainSessionWrites?.();
    await stopTestDb();
  });

  beforeEach(async () => {
    await PlatformSetting.deleteMany({ key: 'monitoringPolicy' });
    clearMonitoringPolicyCache();
  });

  it('refuses the overview to a signed-in user who is not an administrator', async () => {
    const res = await fetch(`${baseUrl}/admin`, { headers: { cookie: sessions.user.cookie } });
    assert.equal(res.status, 403);
  });

  it('refuses the live panel feed to a non-administrator', async () => {
    const res = await fetch(`${baseUrl}/admin/overview/live`, {
      headers: { cookie: sessions.user.cookie },
    });
    assert.equal(res.status, 403);
  });

  it('serves the live panel feed to an administrator as uncached JSON', async () => {
    const res = await fetch(`${baseUrl}/admin/overview/live?panels=kpis`, {
      headers: { cookie: sessions.admin.cookie },
    });
    assert.deepEqual([res.status, res.headers.get('cache-control')], [200, 'no-store']);
  });

  it('only renders the panels the live request names', async () => {
    const res = await fetch(`${baseUrl}/admin/overview/live?panels=services,unknown`, {
      headers: { cookie: sessions.admin.cookie },
    });
    assert.deepEqual(Object.keys((await res.json()).panels), ['services']);
  });

  it('saves personal preferences for the signed-in administrator only', async () => {
    const form = withCsrf(
      sessions.admin,
      new URLSearchParams({
        density: 'spacious',
        historyRange: '6h',
        refreshSeconds: '60',
        tableRows: '50',
      }),
    );
    await post(sessions.admin, '/admin/overview/settings/personal', form);
    const other = await User.findOne({ email: 'other@example.test' }).lean();
    assert.equal(other.dashboardPreferences, undefined);
  });

  it('stores the submitted personal preferences', async () => {
    const form = withCsrf(
      sessions.admin,
      new URLSearchParams({
        density: 'spacious',
        historyRange: '6h',
        refreshSeconds: '60',
        tableRows: '50',
      }),
    );
    await post(sessions.admin, '/admin/overview/settings/personal', form);
    const admin = await User.findOne({ email: 'admin@example.test' }).lean();
    assert.equal(admin.dashboardPreferences.density, 'spacious');
  });

  it('rejects invalid personal preferences without saving', async () => {
    const form = withCsrf(
      sessions.other,
      new URLSearchParams({
        density: 'huge',
        historyRange: '1h',
        refreshSeconds: '15',
        tableRows: '25',
      }),
    );
    const res = await post(sessions.other, '/admin/overview/settings/personal', form);
    assert.equal(res.status, 422);
  });

  it('refuses a personal save without the CSRF token', async () => {
    const res = await post(
      sessions.admin,
      '/admin/overview/settings/personal',
      new URLSearchParams({
        density: 'compact',
        historyRange: '1h',
        refreshSeconds: '15',
        tableRows: '25',
      }),
    );
    assert.equal(res.status, 403);
  });

  it('refuses the platform policy to an administrator who is not a super administrator', async () => {
    const res = await post(
      sessions.admin,
      '/admin/overview/settings/platform',
      withCsrf(sessions.admin, policyForm(0)),
    );
    assert.equal(res.status, 403);
  });

  it('saves the platform policy for a super administrator', async () => {
    await post(
      sessions.superAdmin,
      '/admin/overview/settings/platform',
      withCsrf(
        sessions.superAdmin,
        policyForm(0, { fields: { 'intervals.resourceSeconds': '30' } }),
      ),
    );
    const setting = await PlatformSetting.findOne({ key: 'monitoringPolicy' }).lean();
    assert.deepEqual([setting.value.intervals.resourceSeconds, setting.value.revision], [30, 1]);
  });

  it('audits a platform policy change with what changed', async () => {
    await post(
      sessions.superAdmin,
      '/admin/overview/settings/platform',
      withCsrf(sessions.superAdmin, policyForm(0, { fields: { 'thresholds.cpu.warning': '85' } })),
    );
    const event = await AuditEvent.findOne({
      action: 'admin.monitoring_policy_updated',
      outcome: 'SUCCESS',
    })
      .sort({ createdAt: -1 })
      .lean();
    assert.deepEqual(event.metadata.changes['thresholds.cpu.warning'], { from: 80, to: 85 });
  });

  it('refuses a save made against an outdated revision', async () => {
    await post(
      sessions.superAdmin,
      '/admin/overview/settings/platform',
      withCsrf(sessions.superAdmin, policyForm(0, { fields: { 'intervals.diskSeconds': '60' } })),
    );
    await post(
      sessions.superAdmin,
      '/admin/overview/settings/platform',
      withCsrf(sessions.superAdmin, policyForm(0, { fields: { 'intervals.diskSeconds': '120' } })),
    );
    const setting = await PlatformSetting.findOne({ key: 'monitoringPolicy' }).lean();
    assert.equal(setting.value.intervals.diskSeconds, 60);
  });

  it('rejects an unsafe policy and keeps the stored one', async () => {
    const res = await post(
      sessions.superAdmin,
      '/admin/overview/settings/platform',
      withCsrf(
        sessions.superAdmin,
        policyForm(0, { fields: { 'intervals.resourceSeconds': '1' } }),
      ),
    );
    assert.deepEqual(
      [res.status, await PlatformSetting.countDocuments({ key: 'monitoringPolicy' })],
      [422, 0],
    );
  });

  it('restores platform defaults as a new audited revision', async () => {
    await post(
      sessions.superAdmin,
      '/admin/overview/settings/platform',
      withCsrf(sessions.superAdmin, policyForm(0, { fields: { 'intervals.probeSeconds': '120' } })),
    );
    await post(
      sessions.superAdmin,
      '/admin/overview/settings/platform/reset',
      withCsrf(sessions.superAdmin, new URLSearchParams({ revision: '1' })),
    );
    const setting = await PlatformSetting.findOne({ key: 'monitoringPolicy' }).lean();
    assert.deepEqual([setting.value.intervals.probeSeconds, setting.value.revision], [30, 2]);
  });

  it('remembers a collapsed sidebar from the JSON toggle', async () => {
    await fetch(`${baseUrl}/admin/preferences/sidebar`, {
      method: 'POST',
      headers: {
        cookie: sessions.other.cookie,
        'content-type': 'application/json',
        'x-csrf-token': sessions.other.csrf,
      },
      body: JSON.stringify({ collapsed: true }),
    });
    const html = await (
      await fetch(`${baseUrl}/admin/users`, { headers: { cookie: sessions.other.cookie } })
    ).text();
    assert.match(html, /layout--sidebar-collapsed/);
  });

  async function openIncident(state = 'active') {
    return MonitoringIncident.create({
      fingerprint: `test:${Math.random()}`,
      rule: 'host.cpu',
      scope: 'host',
      severity: 'warning',
      state,
      title: 'Host CPU is high',
      firstSeen: new Date(),
      lastSeen: new Date(),
    });
  }

  it('lets an administrator acknowledge an incident without resolving it', async () => {
    const incident = await openIncident();
    await post(
      sessions.admin,
      `/admin/overview/incidents/${incident._id}/acknowledge`,
      withCsrf(sessions.admin, new URLSearchParams()),
      { accept: 'application/json' },
    );
    const stored = await MonitoringIncident.findById(incident._id).lean();
    assert.deepEqual([stored.state, stored.resolvedAt], ['acknowledged', null]);
  });

  it('audits an acknowledgement', async () => {
    const incident = await openIncident();
    await post(
      sessions.admin,
      `/admin/overview/incidents/${incident._id}/acknowledge`,
      withCsrf(sessions.admin, new URLSearchParams()),
      { accept: 'application/json' },
    );
    assert.equal(
      await AuditEvent.countDocuments({
        action: 'admin.incident_acknowledged',
        targetId: String(incident._id),
      }),
      1,
    );
  });

  it('refuses to acknowledge a resolved incident', async () => {
    const incident = await openIncident('resolved');
    const res = await post(
      sessions.admin,
      `/admin/overview/incidents/${incident._id}/acknowledge`,
      withCsrf(sessions.admin, new URLSearchParams()),
      { accept: 'application/json' },
    );
    assert.equal(res.status, 409);
  });

  it('refuses an acknowledgement from a non-administrator', async () => {
    const incident = await openIncident();
    await post(
      sessions.user,
      `/admin/overview/incidents/${incident._id}/acknowledge`,
      withCsrf(sessions.user, new URLSearchParams()),
    );
    assert.equal((await MonitoringIncident.findById(incident._id).lean()).state, 'active');
  });
});
