import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['auth', 'styles', 'test', 'value'].join('-');

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { createApp } = await import('../../apps/web/src/app.js');

const AUTH_STYLESHEET = /<link rel="stylesheet" href="[^"]*\/auth(?:\.[0-9a-f]+)?\.css"/;

describe('Auth page stylesheet', () => {
  let app;
  let server;
  const pages = new Map();

  before(async () => {
    await startTestDb();
    app = createApp({ readinessCheck: async () => ({ ready: true }) });
    server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    for (const path of ['/auth/sign-in', '/auth/create-account', '/']) {
      pages.set(path, await (await fetch(`${baseUrl}${path}`)).text());
    }
  });

  after(async () => {
    server.close();
    await app.locals.drainSessionWrites?.();
    await stopTestDb();
  });

  it('loads the auth bundle on sign-in', () => {
    assert.match(pages.get('/auth/sign-in'), AUTH_STYLESHEET);
  });

  it('loads the auth bundle on create account', () => {
    assert.match(pages.get('/auth/create-account'), AUTH_STYLESHEET);
  });

  it('keeps the auth bundle off the homepage', () => {
    assert.doesNotMatch(pages.get('/'), AUTH_STYLESHEET);
  });
});
