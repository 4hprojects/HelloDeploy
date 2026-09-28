import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalPathMiddleware } from '../../apps/web/src/middleware/canonical-path.js';

function run(path, method = 'GET', originalUrl = path) {
  const result = { redirected: null, passedThrough: false };
  const req = { method, path, originalUrl };
  const res = {
    redirect(status, location) {
      result.redirected = { status, location };
    },
  };
  canonicalPathMiddleware(req, res, () => {
    result.passedThrough = true;
  });
  return result;
}

describe('canonical public paths', () => {
  it('redirects an uppercase path to its canonical spelling', () => {
    assert.deepEqual(run('/FEATURES').redirected, { status: 301, location: '/features' });
  });

  it('redirects a trailing slash away', () => {
    assert.deepEqual(run('/docs/').redirected, { status: 301, location: '/docs' });
  });

  it('redirects a mixed-case documentation slug', () => {
    assert.deepEqual(run('/docs/Getting-Started').redirected, {
      status: 301,
      location: '/docs/getting-started',
    });
  });

  it('keeps the query string when redirecting', () => {
    assert.deepEqual(run('/FEATURES', 'GET', '/FEATURES?utm_source=x').redirected, {
      status: 301,
      location: '/features?utm_source=x',
    });
  });

  it('leaves a canonical path alone', () => {
    assert.equal(run('/features').passedThrough, true);
  });

  it('leaves the root alone', () => {
    assert.equal(run('/').passedThrough, true);
  });

  it('leaves a path that is not public alone', () => {
    assert.equal(run('/Admin').passedThrough, true);
  });

  it('never rewrites a case-sensitive token in a deploy hook URL', () => {
    const path = '/api/deploy-hooks/507f1f77bcf86cd799439011/AbCdEf0123456789';

    assert.equal(run(path).passedThrough, true);
  });

  it('ignores non-GET requests', () => {
    assert.equal(run('/FEATURES', 'POST').passedThrough, true);
  });
});
