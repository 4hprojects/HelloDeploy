import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const { csrfMiddleware } = await import('../../apps/web/src/middleware/csrf.js');
const { createSessionCookieOptions } = await import('../../apps/web/src/middleware/session.js');
const appSource = await readFile(new URL('../../apps/web/src/app.js', import.meta.url), 'utf8');

describe('production session cookie', () => {
  it('retains all hardened cookie attributes', () => {
    assert.deepEqual(createSessionCookieOptions(true), {
      httpOnly: true,
      sameSite: 'strict',
      secure: true,
      maxAge: 24 * 60 * 60 * 1000,
    });
  });

  it('trusts the ingress proxy before installing production sessions', () => {
    const trustProxy = appSource.indexOf("app.set('trust proxy', 1)");
    const sessionMiddleware = appSource.indexOf('app.use(createSessionMiddleware())');
    assert.ok(trustProxy > 0 && trustProxy < sessionMiddleware);
  });
});

describe('CSRF middleware', () => {
  function invoke({ method = 'POST', sessionToken, submittedToken, cookie } = {}) {
    const req = {
      method,
      originalUrl: '/submit',
      secure: true,
      correlationId: 'test-correlation-id',
      session: sessionToken ? { csrfToken: sessionToken } : {},
      body: submittedToken === undefined ? {} : { _csrf: submittedToken },
      headers: {
        ...(cookie ? { cookie } : {}),
        'x-forwarded-proto': 'https',
      },
    };
    const rendered = {};
    const res = {
      status(code) {
        rendered.status = code;
        return this;
      },
      render(view, data) {
        rendered.view = view;
        rendered.data = data;
        return this;
      },
    };
    let calledNext = false;
    csrfMiddleware(req, res, () => {
      calledNext = true;
    });
    return { req, rendered, calledNext };
  }

  it('issues a token for a safe request and exposes it to the view layer', () => {
    const result = invoke({ method: 'GET' });
    assert.equal(result.calledNext, true);
    assert.match(result.req.csrfToken(), /^[a-f0-9]{64}$/);
  });

  it('accepts a submitted token matching the session token', () => {
    const result = invoke({
      sessionToken: 'session-token',
      submittedToken: 'session-token',
      cookie: 'hellodeploy.sid=value',
    });
    assert.equal(result.calledNext, true);
    assert.equal(result.rendered.status, undefined);
  });

  it('rejects a missing submitted token', () => {
    const result = invoke({ sessionToken: 'session-token', cookie: 'hellodeploy.sid=value' });
    assert.equal(result.rendered.status, 403);
    assert.equal(result.calledNext, false);
  });

  it('rejects a mismatched token', () => {
    const result = invoke({
      sessionToken: 'session-token',
      submittedToken: 'different-token',
      cookie: 'hellodeploy.sid=value',
    });
    assert.equal(result.rendered.status, 403);
    assert.equal(result.calledNext, false);
  });

  it('rejects a token submitted without its original session', () => {
    const result = invoke({ submittedToken: 'orphaned-token' });
    assert.equal(result.rendered.status, 403);
    assert.equal(result.calledNext, false);
  });
});
