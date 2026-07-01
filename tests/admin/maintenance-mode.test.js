import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PlatformRole } from '@hellodeploy/contracts';

const { createMaintenanceModeMiddleware } =
  await import('../../apps/web/src/middleware/maintenance-mode.js');

function createResponse() {
  return {
    locals: {},
    statusCode: null,
    rendered: null,
    jsonBody: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, payload) {
      this.rendered = { view, payload };
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
  };
}

describe('maintenanceModeMiddleware', () => {
  it('allows safe read-only requests during maintenance', async () => {
    const middleware = createMaintenanceModeMiddleware({
      getMaintenanceModeFn: async () => ({ enabled: true }),
    });
    const res = createResponse();
    let nextCalled = false;

    await middleware(
      { method: 'GET', path: '/projects', accepts: () => 'html', session: {} },
      res,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
    assert.equal(res.locals.maintenanceMode.enabled, true);
  });

  it('blocks non-admin mutating requests during maintenance', async () => {
    const middleware = createMaintenanceModeMiddleware({
      getMaintenanceModeFn: async () => ({ enabled: true, message: 'Maintenance window.' }),
    });
    const res = createResponse();

    await middleware(
      {
        method: 'POST',
        path: '/projects',
        accepts: () => 'html',
        session: { user: { platformRole: PlatformRole.USER } },
      },
      res,
      () => {},
    );

    assert.equal(res.statusCode, 503);
    assert.equal(res.rendered.view, 'pages/error');
    assert.equal(res.rendered.payload.message, 'Maintenance window.');
  });

  it('allows Super Admin mutating requests during maintenance', async () => {
    const middleware = createMaintenanceModeMiddleware({
      getMaintenanceModeFn: async () => ({ enabled: true }),
    });
    const res = createResponse();
    let nextCalled = false;

    await middleware(
      {
        method: 'POST',
        path: '/admin/server/queue/pause',
        accepts: () => 'html',
        session: { user: { platformRole: PlatformRole.SUPER_ADMIN } },
      },
      res,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
  });

  it('allows maintenance control paths so maintenance can be disabled', async () => {
    const middleware = createMaintenanceModeMiddleware({
      getMaintenanceModeFn: async () => ({ enabled: true }),
    });
    const res = createResponse();
    let nextCalled = false;

    await middleware(
      {
        method: 'POST',
        path: '/admin/server/maintenance/disable',
        accepts: () => 'html',
        session: { user: { platformRole: PlatformRole.ADMIN } },
      },
      res,
      () => {
        nextCalled = true;
      },
    );

    assert.equal(nextCalled, true);
  });
});
