import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it, before, after, beforeEach } from 'node:test';

import ejs from 'ejs';

import { AuditEvent, PlatformSetting } from '@hellodeploy/database';
import {
  BUILDER_LIMITS,
  BUILDER_RUNTIME_FAMILIES,
  BUILDER_RUNTIME_LABELS,
  BUILDER_SETTINGS_KEY,
  BuilderState,
  PlatformRole,
  normalizeBuilderSettings,
} from '@hellodeploy/contracts';
import { configureAuditService } from '@hellodeploy/observability';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const {
  checkBuilderDeploymentGate,
  presentBuilderStatus,
  requestBuilderAction,
  updateBuilderSettings,
} = await import('../../apps/web/src/services/builder-control.service.js');
const { requireBuilderControl } =
  await import('../../apps/web/src/controllers/builder-control.controller.js');

const PROJECT_ID = '507f1f77bcf86cd799439011';
const OTHER_PROJECT_ID = '507f1f77bcf86cd799439012';
const builderPagePath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/admin/builder.ejs', import.meta.url),
);

function fakeQueue() {
  const jobs = [];
  return { jobs, add: async (name, data) => jobs.push({ name, data }) };
}

function nextCeiling(projectIds = [PROJECT_ID]) {
  return {
    next: { enabled: true, projectIds },
    python: { enabled: false, projectIds: [] },
    php: { enabled: false, projectIds: [] },
    java: { enabled: false, projectIds: [] },
  };
}

function freshStatus(state) {
  return { status: { state, updatedAt: new Date().toISOString() }, isFresh: true };
}

function gateDeps(overrides = {}) {
  return {
    isEnabled: true,
    loadOwnerRole: async () => PlatformRole.ADMIN,
    loadSettings: async () =>
      normalizeBuilderSettings({ runtimes: { next: { enabled: true, projectIds: [PROJECT_ID] } } }),
    loadStatus: async () => freshStatus(BuilderState.READY),
    ...overrides,
  };
}

const NEXT_PROJECT = { _id: PROJECT_ID, ownerId: objectId(), buildStrategy: 'next_standard_v1' };

describe('builder control requests', () => {
  before(async () => {
    await startTestDb();
    configureAuditService(AuditEvent);
  });
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('queues Start for a super administrator', async () => {
    const queue = fakeQueue();
    await requestBuilderAction({
      action: 'start',
      adminId: 'a'.repeat(24),
      adminRole: PlatformRole.SUPER_ADMIN,
      queue,
    });
    assert.deepEqual(
      queue.jobs.map(({ name, data }) => ({ name, action: data.action, actorId: data.actorId })),
      [{ name: 'start', action: 'start', actorId: 'a'.repeat(24) }],
    );
  });

  it('does not queue Emergency Stop for an ordinary administrator', async () => {
    const queue = fakeQueue();
    await requestBuilderAction({
      action: 'emergency-stop',
      adminId: 'b'.repeat(24),
      adminRole: PlatformRole.ADMIN,
      queue,
    });
    assert.deepEqual(queue.jobs, []);
  });

  it('audits a refused request as denied', async () => {
    await requestBuilderAction({
      action: 'start',
      adminId: objectId(),
      adminRole: PlatformRole.ADMIN,
      queue: fakeQueue(),
    });
    const events = await AuditEvent.find({}).lean();
    assert.deepEqual(
      events.map(({ action, outcome }) => ({ action, outcome })),
      [{ action: 'admin.builder_start_requested', outcome: 'DENIED' }],
    );
  });

  it('lets an ordinary administrator queue a registry check', async () => {
    const queue = fakeQueue();
    await requestBuilderAction({
      action: 'check-registry',
      adminId: 'b'.repeat(24),
      adminRole: PlatformRole.ADMIN,
      queue,
    });
    assert.equal(queue.jobs.length, 1);
  });

  it('refuses an unknown action', async () => {
    const result = await requestBuilderAction({
      action: 'restart-docker',
      adminId: 'a'.repeat(24),
      adminRole: PlatformRole.SUPER_ADMIN,
      queue: fakeQueue(),
    });
    assert.equal(result.success, false);
  });

  it('reports an unavailable queue instead of pretending to act', async () => {
    const result = await requestBuilderAction({
      action: 'start',
      adminId: 'a'.repeat(24),
      adminRole: PlatformRole.SUPER_ADMIN,
      queue: null,
    });
    assert.match(result.error, /queue unavailable/);
  });
});

describe('builder settings', () => {
  before(async () => {
    await startTestDb();
    configureAuditService(AuditEvent);
  });
  after(stopTestDb);
  beforeEach(clearTestDb);

  function save(overrides = {}) {
    return updateBuilderSettings({
      idleMinutes: '45',
      runtimes: { next: { enabled: true, projectIds: [PROJECT_ID] } },
      adminId: objectId(),
      adminRole: PlatformRole.SUPER_ADMIN,
      ceiling: nextCeiling(),
      ...overrides,
    });
  }

  it('saves permissions within the environment ceiling', async () => {
    await save();
    const setting = await PlatformSetting.findOne({ key: BUILDER_SETTINGS_KEY }).lean();
    assert.deepEqual(setting.value.runtimes.next, { enabled: true, projectIds: [PROJECT_ID] });
  });

  it('never enables a runtime whose environment flag is off', async () => {
    const result = await save({ runtimes: { python: { enabled: true, projectIds: [] } } });
    assert.match(result.error, /off in the server configuration/);
  });

  it('never allows a project outside the environment allowlist', async () => {
    const result = await save({
      runtimes: { next: { enabled: true, projectIds: [OTHER_PROJECT_ID] } },
    });
    assert.match(result.error, /allowlist/);
  });

  it('refuses an idle shutdown below the minimum', async () => {
    const result = await save({ idleMinutes: '1' });
    assert.equal(result.success, false);
  });

  it('refuses changes from an ordinary administrator', async () => {
    const result = await save({ adminRole: PlatformRole.ADMIN });
    assert.equal(result.success, false);
  });

  it('records the change in the audit log without project ids', async () => {
    await save();
    const event = await AuditEvent.findOne({ action: 'admin.builder_settings_updated' }).lean();
    assert.deepEqual(event.metadata.runtimes.next, { enabled: true, projectCount: 1 });
  });
});

describe('builder deployment gate', () => {
  it('ignores every deployment while builder control is off', async () => {
    assert.equal(
      await checkBuilderDeploymentGate(NEXT_PROJECT, gateDeps({ isEnabled: false })),
      null,
    );
  });

  it('ignores legacy Node deployments', async () => {
    assert.equal(
      await checkBuilderDeploymentGate(
        { ...NEXT_PROJECT, buildStrategy: 'legacy_generated' },
        gateDeps({ loadStatus: async () => freshStatus(BuilderState.STOPPED) }),
      ),
      null,
    );
  });

  it('refuses before queueing while the build service is stopped', async () => {
    assert.match(
      await checkBuilderDeploymentGate(
        NEXT_PROJECT,
        gateDeps({ loadStatus: async () => freshStatus(BuilderState.STOPPED) }),
      ),
      /turned off/,
    );
  });

  it('refuses when the worker stopped reporting', async () => {
    assert.match(
      await checkBuilderDeploymentGate(
        NEXT_PROJECT,
        gateDeps({ loadStatus: async () => ({ status: null, isFresh: false }) }),
      ),
      /turned off/,
    );
  });

  it('refuses a project owned by an ordinary user', async () => {
    assert.match(
      await checkBuilderDeploymentGate(
        NEXT_PROJECT,
        gateDeps({ loadOwnerRole: async () => PlatformRole.USER }),
      ),
      /owned by a platform administrator/,
    );
  });

  it('refuses owner Dockerfiles', async () => {
    assert.match(
      await checkBuilderDeploymentGate(
        { ...NEXT_PROJECT, buildStrategy: 'dockerfile_v1' },
        gateDeps(),
      ),
      /disabled/,
    );
  });

  it('allows an eligible project while the build service is ready', async () => {
    assert.equal(await checkBuilderDeploymentGate(NEXT_PROJECT, gateDeps()), null);
  });
});

describe('builder routes', () => {
  it('do not exist while builder control is off', () => {
    const res = {
      statusCode: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      render() {
        return this;
      },
    };
    requireBuilderControl({}, res, () => {});
    assert.equal(res.statusCode, 404);
  });
});

describe('builder page', () => {
  function render(overrides = {}) {
    const status = overrides.status ?? {
      state: BuilderState.READY,
      updatedAt: new Date().toISOString(),
      lastError: null,
      registry: null,
      resources: null,
      limits: BUILDER_LIMITS,
    };
    const isFresh = overrides.isFresh ?? true;
    return ejs.renderFile(builderPagePath, {
      csrfToken: 'csrf',
      status,
      isFresh,
      view: presentBuilderStatus({ status, isFresh, idleMinutes: 30 }),
      settings: normalizeBuilderSettings(null),
      ceiling: nextCeiling(),
      builds: [],
      activity: [],
      projectsById: { [PROJECT_ID]: { name: 'Pilot app', slug: 'pilot', isAdminOwned: true } },
      runtimeFamilies: BUILDER_RUNTIME_FAMILIES,
      runtimeLabels: BUILDER_RUNTIME_LABELS,
      idleBounds: { min: 5, max: 240 },
      isSuperAdmin: true,
      ...overrides,
    });
  }

  it('shows Emergency Stop to a super administrator', async () => {
    assert.match(await render(), /action="\/admin\/builder\/emergency-stop"/);
  });

  it('hides the lifecycle controls from an ordinary administrator', async () => {
    assert.doesNotMatch(await render({ isSuperAdmin: false }), /action="\/admin\/builder\/start"/);
  });

  it('says the builder is not reporting when its status is stale', async () => {
    assert.match(await render({ isFresh: false }), /Not reporting/);
  });

  it('marks the status for live updates', async () => {
    assert.match(await render(), /data-builder-status-url="\/admin\/builder\/status"/);
  });

  it('announces live status changes politely', async () => {
    assert.match(await render(), /aria-live="polite" data-builder-live/);
  });

  it('labels each allowlisted project checkbox', async () => {
    assert.match(
      await render(),
      new RegExp(`<label for="builder-next-${PROJECT_ID}" class="checkbox-label">\\s*Pilot app`),
    );
  });
});

describe('builder status presentation', () => {
  const resources = {
    memAvailableMb: 2819,
    swapFreeMb: 2241,
    swapTotalMb: 4096,
    memoryPressureSome60: 0,
    diskFreeGb: 797,
    storeFreeGb: 27,
    builderMemoryMb: 72,
    sampledAt: '2026-10-25T14:44:16.000Z',
  };

  it('reports a stale status as not reporting', () => {
    assert.equal(
      presentBuilderStatus({ status: { state: 'READY' }, isFresh: false, idleMinutes: 30 }).state
        .label,
      'Not reporting',
    );
  });

  it('shows the builder memory against its cap', () => {
    assert.equal(
      presentBuilderStatus({
        status: { state: 'READY', resources, limits: BUILDER_LIMITS },
        isFresh: true,
        idleMinutes: 30,
      }).fields.builderMemory,
      '72 MB of 1536 MB',
    );
  });

  it('marks an unreachable registry', () => {
    assert.equal(
      presentBuilderStatus({
        status: { state: 'READY', registry: { ok: false, checkedAt: null, error: 'denied' } },
        isFresh: true,
        idleMinutes: 30,
      }).registry.label,
      'Unreachable',
    );
  });

  it('hides the resource list until a reading exists', () => {
    assert.equal(
      presentBuilderStatus({ status: { state: 'STOPPED' }, isFresh: true, idleMinutes: 30 }).show
        .resources,
      false,
    );
  });
});
