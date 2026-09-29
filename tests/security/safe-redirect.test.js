import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSafeReturnPath } from '../../apps/web/src/utils/safe-redirect.js';

/** Where a browser would actually go, per the URL specification. */
function resolves(candidate) {
  return new URL(candidate, 'https://hellodeploy.online').origin;
}

describe('return path safety', () => {
  it('accepts an ordinary internal path', () => {
    assert.equal(isSafeReturnPath('/dashboard'), true);
  });

  it('accepts an internal path with a query string', () => {
    assert.equal(isSafeReturnPath('/projects?page=2'), true);
  });

  it('rejects a scheme-relative URL', () => {
    assert.equal(isSafeReturnPath('//evil.com'), false);
  });

  it('rejects a backslash escape, which browsers resolve off-site', () => {
    assert.equal(resolves('/\\evil.com'), 'https://evil.com');
    assert.equal(isSafeReturnPath('/\\evil.com'), false);
  });

  it('rejects a mixed slash and backslash escape', () => {
    assert.equal(resolves('/\\/evil.com'), 'https://evil.com');
    assert.equal(isSafeReturnPath('/\\/evil.com'), false);
  });

  it('rejects an absolute URL', () => {
    assert.equal(isSafeReturnPath('https://evil.com'), false);
  });

  it('rejects a value that does not start with a slash', () => {
    assert.equal(isSafeReturnPath('dashboard'), false);
  });

  it('rejects a non-string', () => {
    assert.equal(isSafeReturnPath(undefined), false);
  });

  it('accepts nothing that leaves the origin', () => {
    const escapes = ['//evil.com', '/\\evil.com', '/\\/evil.com', 'https://evil.com', '//'];

    assert.deepEqual(
      escapes.filter((candidate) => isSafeReturnPath(candidate)),
      [],
    );
  });
});
