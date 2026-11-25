import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['error', 'page', 'test', 'session', 'value'].join('-');
process.env.PLATFORM_DOMAIN = 'example.test';

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { createApp } = await import('../../apps/web/src/app.js');

// Bot probes POST to paths that do not exist; CSRF rejects them before the
// per-request view locals are set, and the error page must still render.
describe('error pages rendered before request locals', () => {
  let server;
  let baseUrl;
  before(async () => {
    await startTestDb();
    server = createApp({ readinessCheck: async () => ({ ready: true }) }).listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => {
    server.close();
    await stopTestDb();
  });

  it('answers a sign-in sent without a body with a form error, not a 500', async () => {
    const form = await fetch(`${baseUrl}/auth/sign-in`);
    const cookie = form.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const csrf = (await form.text()).match(/name="_csrf" value="([^"]+)"/)[1];
    const res = await fetch(`${baseUrl}/auth/sign-in`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'x-csrf-token': csrf, accept: 'text/html' },
    });
    assert.ok(res.status < 500, `status ${res.status}`);
  });

  it('answers an unauthenticated POST probe with a 403 page, not a 500', async () => {
    const res = await fetch(`${baseUrl}/xmlrpc.php`, {
      method: 'POST',
      headers: { 'content-type': 'text/xml', accept: 'text/html' },
      body: '<methodCall/>',
    });
    assert.equal(res.status, 403);
  });
});
