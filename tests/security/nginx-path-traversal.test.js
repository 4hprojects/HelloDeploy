import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// assertSafeSlug is internal to route-manager; test via isValidSubdomainLabel
const { isValidSubdomainLabel } =
  await import('../../apps/worker/src/nginx/reserved-subdomains.js');

// We test that slugs used as nginx config filenames are safe.
// Anything that isValidSubdomainLabel rejects cannot be used as a filename.

describe('Nginx config filename safety (path traversal)', () => {
  const dangerous = [
    '../etc/nginx/nginx.conf',
    '../../etc/passwd',
    '/etc/nginx/conf.d/evil',
    'etc%2Fnginx',
    '.hidden',
    'a/b',
    'a\\b',
    '...',
    '',
  ];

  for (const slug of dangerous) {
    it(`rejects "${slug}"`, () => {
      assert.equal(
        isValidSubdomainLabel(slug),
        false,
        `Expected "${slug}" to be rejected as unsafe`,
      );
    });
  }

  const safe = ['my-app', 'hello-world', 'app123', 'x'];

  for (const slug of safe) {
    it(`accepts safe slug "${slug}"`, () => {
      assert.equal(isValidSubdomainLabel(slug), true);
    });
  }
});
