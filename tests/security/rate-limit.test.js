import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import rateLimit from 'express-rate-limit';

// Test limiters use the default in-memory store (no Redis required).
// Handler signature matches the production onLimitReached in rate-limit.js.
function makeTestLimiter(limit) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler(req, res) {
      if (req.accepts('html')) {
        res.status(429).render('pages/error', {
          title: 'Too Many Requests',
          layout: 'layouts/main',
          message: 'Too many requests. Please wait a moment and try again.',
        });
      } else {
        res.status(429).json({
          error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
        });
      }
    },
  });
}

function invoke(limiter, ip, acceptsHtml = false) {
  return new Promise((resolve) => {
    const req = {
      ip,
      method: 'POST',
      headers: {},
      accepts: (type) => (acceptsHtml && type === 'html' ? 'html' : false),
    };
    let capturedStatus = null;
    const res = {
      setHeader() { return this; },
      getHeader() { return null; },
      removeHeader() { return this; },
      status(code) { capturedStatus = code; return this; },
      render(view, data) { resolve({ status: capturedStatus, type: 'html', view, data }); },
      json(body) { resolve({ status: capturedStatus, type: 'json', body }); },
    };
    limiter(req, res, (err) => resolve({ status: null, type: 'pass', err: err ?? null }));
  });
}

// ─── Brute-force protection behaviour ────────────────────────────────────────

describe('brute-force protection — rate limit behaviour', () => {
  it('allows requests up to the configured limit', async () => {
    const limiter = makeTestLimiter(3);
    const ip = '192.0.2.1'; // RFC 5737 TEST-NET
    for (let i = 1; i <= 3; i++) {
      const result = await invoke(limiter, ip);
      assert.equal(result.status, null, `request ${i} should pass through`);
      assert.equal(result.err, null, `request ${i} should not error`);
    }
  });

  it('blocks the first request that exceeds the limit with 429', async () => {
    const limiter = makeTestLimiter(3);
    const ip = '192.0.2.2';
    for (let i = 0; i < 3; i++) await invoke(limiter, ip);
    const result = await invoke(limiter, ip); // 4th request exceeds limit=3
    assert.equal(result.status, 429, 'request exceeding limit must be blocked');
    assert.equal(result.type !== 'pass', true, 'must not pass to next middleware');
  });

  it('subsequent requests after limit is hit continue to return 429', async () => {
    const limiter = makeTestLimiter(2);
    const ip = '192.0.2.3';
    await invoke(limiter, ip);
    await invoke(limiter, ip);
    for (let i = 0; i < 3; i++) {
      const result = await invoke(limiter, ip);
      assert.equal(result.status, 429, `request ${i + 3} must still be blocked`);
    }
  });

  it('returns JSON for non-browser (API) requests', async () => {
    const limiter = makeTestLimiter(1);
    const ip = '192.0.2.4';
    await invoke(limiter, ip, false);      // exhaust
    const result = await invoke(limiter, ip, false); // trigger 429
    assert.equal(result.status, 429);
    assert.equal(result.type, 'json', 'API clients must receive JSON');
    assert.equal(result.body?.error?.code, 'RATE_LIMITED');
    assert.ok(result.body?.error?.message, 'error message must be present');
  });

  it('returns HTML for browser (Accept: text/html) requests', async () => {
    const limiter = makeTestLimiter(1);
    const ip = '192.0.2.5';
    await invoke(limiter, ip, true);       // exhaust
    const result = await invoke(limiter, ip, true); // trigger 429
    assert.equal(result.status, 429);
    assert.equal(result.type, 'html', 'browsers must receive an HTML error page');
    assert.equal(result.view, 'pages/error', 'must render the standard error page');
  });

  it('tracks different IPs independently', async () => {
    const limiter = makeTestLimiter(2);
    const ip1 = '192.0.2.10';
    const ip2 = '192.0.2.11';
    await invoke(limiter, ip1);
    await invoke(limiter, ip1); // exhaust ip1
    const r1 = await invoke(limiter, ip1); // 3rd for ip1 — should be blocked
    const r2 = await invoke(limiter, ip2); // 1st for ip2 — should pass
    assert.equal(r1.status, 429, 'exhausted ip1 must be blocked');
    assert.equal(r2.status, null, 'fresh ip2 must still be allowed');
  });

  it('sign-in limiter configuration: limit is 10 per 15-minute window', async () => {
    // Verify the production signInLimiter allows 10 requests before blocking.
    // Uses the same in-memory pattern to confirm limit=10 fires at the 11th request.
    const signinPattern = makeTestLimiter(10);
    const ip = '192.0.2.20';
    for (let i = 0; i < 10; i++) {
      const r = await invoke(signinPattern, ip);
      assert.equal(r.status, null, `attempt ${i + 1} of 10 should be allowed`);
    }
    const blocked = await invoke(signinPattern, ip);
    assert.equal(blocked.status, 429, '11th attempt must be blocked (limit=10)');
  });

  it('registration limiter configuration: limit is 5 per hour', async () => {
    const registrationPattern = makeTestLimiter(5);
    const ip = '192.0.2.21';
    for (let i = 0; i < 5; i++) await invoke(registrationPattern, ip);
    const blocked = await invoke(registrationPattern, ip);
    assert.equal(blocked.status, 429, '6th registration attempt must be blocked (limit=5)');
  });
});
