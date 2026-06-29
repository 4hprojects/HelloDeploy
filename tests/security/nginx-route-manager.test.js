import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';

const { activateRoute, removeRoute, readRouteConfig } = await import(
  '../../apps/worker/src/nginx/route-manager.js'
);

// ─── Unsafe slugs that must be rejected ──────────────────────────────────────

const UNSAFE_SLUGS = [
  '../etc/nginx/nginx.conf',
  '../../etc/passwd',
  '/etc/nginx/conf.d/evil',
  'etc%2Fnginx',
  'a/b',
  'a\\b',
  '.hidden',
  '...',
  '',
  'UPPERCASE',
  'has space',
  'newline\ninjection',
  'semicolon;injection',
];

// ─── activateRoute slug validation ───────────────────────────────────────────

describe('activateRoute — rejects unsafe slugs before any filesystem access', () => {
  for (const slug of UNSAFE_SLUGS) {
    it(`rejects slug: ${JSON.stringify(slug)}`, async () => {
      await assert.rejects(
        () => activateRoute({ configDir: tmpdir(), slug, configContent: 'server {}' }),
        (err) => {
          assert.ok(err instanceof Error, 'must throw an Error');
          assert.ok(
            /Unsafe slug|path separator/i.test(err.message),
            `unexpected error message: ${err.message}`,
          );
          return true;
        },
      );
    });
  }
});

// ─── removeRoute slug validation ─────────────────────────────────────────────

describe('removeRoute — rejects unsafe slugs before any filesystem access', () => {
  for (const slug of ['../etc/nginx', '/absolute', 'a/b', '.hidden', '']) {
    it(`rejects slug: ${JSON.stringify(slug)}`, async () => {
      await assert.rejects(
        () => removeRoute({ configDir: tmpdir(), slug }),
        /Unsafe slug|path separator/i,
      );
    });
  }
});

// ─── readRouteConfig slug validation ─────────────────────────────────────────

describe('readRouteConfig — rejects unsafe slugs before any filesystem access', () => {
  for (const slug of ['../etc/nginx', 'a/b', '/absolute', '']) {
    it(`rejects slug: ${JSON.stringify(slug)}`, async () => {
      await assert.rejects(
        () => readRouteConfig({ configDir: tmpdir(), slug }),
        /Unsafe slug|path separator/i,
      );
    });
  }
});

// ─── Safe slugs pass validation ───────────────────────────────────────────────

describe('safe slugs pass slug validation without throwing', () => {
  const SAFE_SLUGS = ['my-app', 'hello-world', 'project123', 'a', 'x9'];

  for (const slug of SAFE_SLUGS) {
    it(`readRouteConfig accepts slug: "${slug}" (returns null for non-existent file)`, async () => {
      const result = await readRouteConfig({ configDir: tmpdir(), slug });
      assert.equal(result, null, 'non-existent config must return null, not throw');
    });

    it(`removeRoute accepts slug: "${slug}" (no-op when config does not exist)`, async () => {
      await assert.doesNotReject(
        () => removeRoute({ configDir: tmpdir(), slug }),
        `removeRoute must not throw for safe slug "${slug}" with no existing config`,
      );
    });
  }
});
