import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

async function src(relPath) {
  return readFile(join(ROOT, relPath), 'utf8');
}

// ─── Session fixation protection ─────────────────────────────────────────────

describe('session fixation — req.session.regenerate() on successful sign-in', () => {
  let controllerSource;

  before(async () => {
    controllerSource = await src('apps/web/src/controllers/auth.controller.js');
  });

  it('calls req.session.regenerate() after successful authentication', () => {
    assert.ok(
      controllerSource.includes('req.session.regenerate'),
      'session ID must be regenerated after login to prevent a pre-planted session from being ' +
        'used post-authentication (session fixation)',
    );
  });

  it('sets req.session.user only inside the regenerate callback (new session ID)', () => {
    // session.user must be set AFTER regenerate, not before
    const regenIdx = controllerSource.indexOf('req.session.regenerate');
    const setUserIdx = controllerSource.indexOf('req.session.user = ');
    assert.ok(regenIdx >= 0, 'req.session.regenerate must be present');
    assert.ok(setUserIdx >= 0, 'req.session.user assignment must be present');
    assert.ok(
      regenIdx < setUserIdx,
      'req.session.user must be set AFTER regenerate() so the user identity ' +
        'is bound to the new session ID, not the pre-auth one',
    );
  });

  it('calls req.session.destroy() on sign-out (session cannot be reused after logout)', () => {
    assert.ok(
      controllerSource.includes('req.session.destroy'),
      'sign-out must destroy the session completely — not just clear session.user — ' +
        'so a captured session token is permanently invalidated',
    );
  });

  it('clears the session cookie on sign-out (res.clearCookie)', () => {
    assert.ok(
      controllerSource.includes('clearCookie'),
      'sign-out must clear the cookie so the browser stops sending it',
    );
  });
});

// ─── CSRF — safe-method exemptions and header token ──────────────────────────

const { csrfMiddleware } = await import('../../apps/web/src/middleware/csrf.js');

describe('CSRF middleware — safe method exemptions and header-based token', () => {

  function invoke({ method, sessionToken, submittedToken, headerToken, cookie } = {}) {
    const req = {
      method,
      originalUrl: '/test',
      secure: true,
      correlationId: 'test',
      session: sessionToken ? { csrfToken: sessionToken } : {},
      body: submittedToken !== undefined ? { _csrf: submittedToken } : {},
      headers: {
        ...(cookie ? { cookie } : {}),
        'x-forwarded-proto': 'https',
        ...(headerToken ? { 'x-csrf-token': headerToken } : {}),
      },
    };
    const rendered = {};
    const res = {
      status(code) { rendered.status = code; return this; },
      render(view, data) { rendered.view = view; rendered.data = data; return this; },
    };
    let calledNext = false;
    csrfMiddleware(req, res, () => { calledNext = true; });
    return { req, rendered, calledNext };
  }

  it('HEAD requests skip CSRF validation', () => {
    const result = invoke({ method: 'HEAD' });
    assert.equal(result.calledNext, true, 'HEAD must pass through without CSRF check');
    assert.ok(!result.rendered.status, 'HEAD must not produce a 403');
  });

  it('OPTIONS requests skip CSRF validation (preflight)', () => {
    const result = invoke({ method: 'OPTIONS' });
    assert.equal(result.calledNext, true, 'OPTIONS must pass through — blocking preflight breaks CORS');
    assert.ok(!result.rendered.status, 'OPTIONS must not produce a 403');
  });

  it('PUT requests require a valid CSRF token', () => {
    const result = invoke({
      method: 'PUT',
      sessionToken: 'tok',
      submittedToken: 'tok',
      cookie: 'hellodeploy.sid=x',
    });
    assert.equal(result.calledNext, true);
  });

  it('DELETE requests require a valid CSRF token', () => {
    const result = invoke({
      method: 'DELETE',
      sessionToken: 'tok',
      submittedToken: 'tok',
      cookie: 'hellodeploy.sid=x',
    });
    assert.equal(result.calledNext, true);
  });

  it('accepts a valid token submitted via X-CSRF-Token header (API clients)', () => {
    const result = invoke({
      method: 'POST',
      sessionToken: 'api-token-123',
      headerToken: 'api-token-123',
      cookie: 'hellodeploy.sid=x',
    });
    assert.equal(result.calledNext, true, 'X-CSRF-Token header must be an accepted token source');
  });

  it('rejects a request with token in header but wrong value', () => {
    const result = invoke({
      method: 'POST',
      sessionToken: 'correct',
      headerToken: 'wrong',
      cookie: 'hellodeploy.sid=x',
    });
    assert.equal(result.rendered.status, 403);
    assert.equal(result.calledNext, false);
  });

  it('uses timing-safe comparison (timingSafeEqual) — source check', async () => {
    const csrfSource = await src('apps/web/src/middleware/csrf.js');
    assert.ok(
      csrfSource.includes('timingSafeEqual'),
      'CSRF token comparison must use timingSafeEqual to prevent timing-oracle attacks',
    );
  });
});
