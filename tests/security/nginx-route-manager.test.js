import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { activateRoute, activateRoutes, removeRoute, readRouteConfig } =
  await import('../../apps/worker/src/nginx/route-manager.js');

async function withConfigDir(fn) {
  const configDir = await mkdtemp(join(tmpdir(), 'hellodeploy-routes-'));
  try {
    await fn(configDir);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
}

function recordingRunner({ failOn } = {}) {
  const calls = [];
  const runner = async (binary, args) => {
    calls.push([binary, ...args]);
    if (failOn?.(args)) {
      throw new Error(`simulated nginx ${args.join(' ')} failure`);
    }
  };
  return { calls, runner };
}

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

describe('route file transactions', () => {
  it('activates a route batch with one validation and reload', async () => {
    await withConfigDir(async (configDir) => {
      const commands = recordingRunner();
      await activateRoutes({
        configDir,
        routes: [
          { slug: 'my-app', configContent: 'server { listen 80; }' },
          { slug: 'custom-abc123', configContent: 'server { listen 80; server_name x.test; }' },
        ],
        commandRunner: commands.runner,
      });

      assert.equal(await readFile(join(configDir, 'my-app.conf'), 'utf8'), 'server { listen 80; }');
      assert.equal(
        await readFile(join(configDir, 'custom-abc123.conf'), 'utf8'),
        'server { listen 80; server_name x.test; }',
      );
      assert.deepEqual(commands.calls, [
        ['nginx', '-t'],
        ['nginx', '-s', 'reload'],
      ]);
    });
  });

  it('restores every route in a failed batch', async () => {
    await withConfigDir(async (configDir) => {
      await writeFile(join(configDir, 'my-app.conf'), 'old platform route');
      await writeFile(join(configDir, 'custom-abc123.conf'), 'old custom route');
      let validationCount = 0;
      const runner = async (_binary, args) => {
        if (args[0] === '-t' && validationCount++ === 0) {
          throw new Error('candidate validation failed');
        }
      };

      await assert.rejects(
        () =>
          activateRoutes({
            configDir,
            routes: [
              { slug: 'my-app', configContent: 'new platform route' },
              { slug: 'custom-abc123', configContent: 'new custom route' },
            ],
            commandRunner: runner,
          }),
        /candidate validation failed/,
      );

      assert.equal(await readFile(join(configDir, 'my-app.conf'), 'utf8'), 'old platform route');
      assert.equal(
        await readFile(join(configDir, 'custom-abc123.conf'), 'utf8'),
        'old custom route',
      );
      assert.deepEqual((await readdir(configDir)).sort(), ['custom-abc123.conf', 'my-app.conf']);
    });
  });

  it('atomically activates a new route and removes transaction files', async () => {
    await withConfigDir(async (configDir) => {
      const commands = recordingRunner();
      await activateRoute({
        configDir,
        slug: 'my-app',
        configContent: 'server { listen 80; }',
        commandRunner: commands.runner,
      });

      assert.equal(await readFile(join(configDir, 'my-app.conf'), 'utf8'), 'server { listen 80; }');
      assert.deepEqual(commands.calls, [
        ['nginx', '-t'],
        ['nginx', '-s', 'reload'],
      ]);
      assert.deepEqual(await readdir(configDir), ['my-app.conf']);
    });
  });

  it('restores an existing route when candidate validation fails', async () => {
    await withConfigDir(async (configDir) => {
      const confPath = join(configDir, 'my-app.conf');
      await writeFile(confPath, 'old route');
      const commands = recordingRunner({ failOn: (args) => args[0] === '-t' });

      await assert.rejects(
        () =>
          activateRoute({
            configDir,
            slug: 'my-app',
            configContent: 'invalid candidate',
            commandRunner: commands.runner,
          }),
        /simulated nginx -t failure/,
      );

      assert.equal(await readFile(confPath, 'utf8'), 'old route');
      assert.deepEqual(await readdir(configDir), ['my-app.conf']);
    });
  });

  it('restores an existing route when reload fails', async () => {
    await withConfigDir(async (configDir) => {
      const confPath = join(configDir, 'my-app.conf');
      await writeFile(confPath, 'old route');
      const commands = recordingRunner({ failOn: (args) => args[0] === '-s' });

      await assert.rejects(
        () =>
          activateRoute({
            configDir,
            slug: 'my-app',
            configContent: 'valid candidate',
            commandRunner: commands.runner,
          }),
        /simulated nginx -s reload failure/,
      );

      assert.equal(await readFile(confPath, 'utf8'), 'old route');
      assert.deepEqual(await readdir(configDir), ['my-app.conf']);
    });
  });

  it('removes a route only after validation and reload succeed', async () => {
    await withConfigDir(async (configDir) => {
      await writeFile(join(configDir, 'my-app.conf'), 'old route');
      const commands = recordingRunner();

      await removeRoute({ configDir, slug: 'my-app', commandRunner: commands.runner });

      assert.deepEqual(commands.calls, [
        ['nginx', '-t'],
        ['nginx', '-s', 'reload'],
      ]);
      assert.deepEqual(await readdir(configDir), []);
    });
  });

  it('restores a removed route when reload fails', async () => {
    await withConfigDir(async (configDir) => {
      const confPath = join(configDir, 'my-app.conf');
      await writeFile(confPath, 'old route');
      const commands = recordingRunner({ failOn: (args) => args[0] === '-s' });

      await assert.rejects(
        () => removeRoute({ configDir, slug: 'my-app', commandRunner: commands.runner }),
        /simulated nginx -s reload failure/,
      );

      assert.equal(await readFile(confPath, 'utf8'), 'old route');
      assert.deepEqual(await readdir(configDir), ['my-app.conf']);
    });
  });
});
