import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

process.env.SESSION_SECRET = ['admin', 'ops', 'events', 'test', 'session'].join('-');
process.env.PLATFORM_DOMAIN = 'example.test';

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { User } = await import('@hellodeploy/database');
const { PlatformRole, UserStatus } = await import('@hellodeploy/contracts');
const { hashPassword } = await import('@hellodeploy/auth');
const { createApp } = await import('../../apps/web/src/app.js');

const PASSWORD = 'correct-horse-battery-staple';

describe('admin operations event stream', () => {
  let server;
  let baseUrl;
  let app;
  const handlers = new Set();
  const sessions = {};

  function emit(payload) {
    for (const handler of handlers) {
      handler(payload);
    }
  }

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
    return (res.headers.get('set-cookie') ?? cookie).split(';')[0];
  }

  /**
   * Open the stream, call `onOpen` once the hello event arrives, and collect
   * text until `pattern` appears or the time runs out. The request is then
   * aborted so the server sees the browser leave.
   */
  async function stream(cookie, pattern, onOpen = () => {}, timeoutMs = 3000) {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/admin/overview/events`, {
      headers: { cookie, accept: 'text/event-stream' },
      signal: controller.signal,
    });
    if (res.status !== 200) {
      controller.abort();
      return { res, text: '' };
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let opened = false;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      while (!pattern.test(text)) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        text += decoder.decode(value);
        if (!opened && /event: hello/.test(text)) {
          opened = true;
          onOpen();
        }
      }
    } catch {
      // Aborted on timeout: return what arrived.
    }
    clearTimeout(timer);
    controller.abort();
    return { res, text };
  }

  before(async () => {
    await startTestDb();
    const passwordHash = await hashPassword(PASSWORD);
    const base = {
      lastName: 'Admin',
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    };
    await User.create([
      { ...base, firstName: 'A', email: 'admin@example.test', platformRole: PlatformRole.ADMIN },
      { ...base, firstName: 'D', email: 'demoted@example.test', platformRole: PlatformRole.ADMIN },
      { ...base, firstName: 'U', email: 'user@example.test', platformRole: PlatformRole.USER },
    ]);
    app = createApp({
      readinessCheck: async () => ({ ready: true }),
      adminOps: {
        deps: {
          subscribeChannel: (channel, handler) => {
            handlers.add(handler);
            return () => handlers.delete(handler);
          },
        },
      },
    });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    sessions.admin = await signIn('admin@example.test');
    sessions.demoted = await signIn('demoted@example.test');
    sessions.user = await signIn('user@example.test');
  });

  after(async () => {
    server.closeAllConnections?.();
    server.close();
    await app.locals.drainSessionWrites?.();
    await stopTestDb();
  });

  it('refuses the stream to a non-administrator', async () => {
    const res = await fetch(`${baseUrl}/admin/overview/events`, {
      headers: { cookie: sessions.user },
    });
    assert.equal(res.status, 403);
  });

  it('opens with a hello event and disables proxy buffering', async () => {
    const { res, text } = await stream(sessions.admin, /event: hello/);
    assert.deepEqual(
      [res.headers.get('x-accel-buffering'), /event: hello/.test(text)],
      ['no', true],
    );
  });

  it('forwards a deployment transition with its id and status only', async () => {
    const { text } = await stream(sessions.admin, /event: deployment/, () =>
      emit({
        type: 'deployment',
        deploymentId: 'd1',
        status: 'FAILED',
        at: 'now',
        message: 'npm ERR! token=abc123',
      }),
    );
    assert.deepEqual([/"status":"FAILED"/.test(text), text.includes('abc123')], [true, false]);
  });

  it('drops event types it does not know', async () => {
    const { text } = await stream(sessions.admin, /event: app/, () => {
      emit({ type: 'log', message: 'private build output' });
      emit({
        type: 'app',
        projectId: 'p1',
        slug: 'one',
        from: 'healthy',
        to: 'unhealthy',
        at: 'now',
      });
    });
    assert.equal(text.includes('private build output'), false);
  });

  it('refuses an administrator demoted since signing in', async () => {
    await User.updateOne({ email: 'demoted@example.test' }, { platformRole: PlatformRole.USER });
    const { res } = await stream(sessions.demoted, /never/);
    assert.equal(res.status, 403);
  });

  it('releases the stream slot when the browser leaves', async () => {
    for (let i = 0; i < 3; i += 1) {
      await stream(sessions.admin, /event: hello/);
    }
    const { res } = await stream(sessions.admin, /event: hello/);
    assert.equal(res.status, 200);
  });
});
