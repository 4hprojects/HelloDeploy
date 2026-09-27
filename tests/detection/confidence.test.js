import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DetectionConfidence, PackageManager } from '@hellodeploy/contracts';

// Set GitHub env vars so the module loads without throwing
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const { detectRuntime, detectPackageManager } =
  await import('../../apps/web/src/services/detection.service.js');

function files(overrides = {}) {
  const base = {
    'package.json': null,
    'package-lock.json': null,
    'yarn.lock': null,
    'pnpm-lock.yaml': null,
    'index.html': null,
    Dockerfile: null,
    'vite.config.js': null,
    'vite.config.ts': null,
    'next.config.js': null,
    'next.config.mjs': null,
    'next.config.ts': null,
  };
  return { ...base, ...overrides };
}

function pkg(overrides = {}) {
  const base = { dependencies: {}, devDependencies: {}, scripts: {} };
  return JSON.stringify({ ...base, ...overrides });
}

const npmLock = { 'package-lock.json': '{}' };

describe('detection confidence — runtime', () => {
  it('is high for a declared framework with declared scripts', () => {
    const result = detectRuntime(
      files({
        ...npmLock,
        'package.json': pkg({
          dependencies: { next: '14.0.0' },
          scripts: { build: 'next build', start: 'next start' },
        }),
      }),
    );

    assert.equal(result.confidence, DetectionConfidence.HIGH);
  });

  it('is high for a static site identified by index.html', () => {
    const result = detectRuntime(files({ 'index.html': '<html/>' }));
    assert.equal(result.confidence, DetectionConfidence.HIGH);
  });

  it('is medium when a framework command comes from convention', () => {
    const result = detectRuntime(
      files({
        ...npmLock,
        'package.json': pkg({
          dependencies: { next: '14.0.0' },
          scripts: { build: 'next build' },
        }),
      }),
    );

    assert.equal(result.confidence, DetectionConfidence.MEDIUM);
  });

  it('is low when the runtime is inferred from a start script alone', () => {
    const result = detectRuntime(
      files({ ...npmLock, 'package.json': pkg({ scripts: { start: 'node index.js' } }) }),
    );

    assert.equal(result.confidence, DetectionConfidence.LOW);
  });

  it('is low when nothing could be identified', () => {
    const result = detectRuntime(files({ ...npmLock, 'package.json': pkg() }));
    assert.equal(result.confidence, DetectionConfidence.LOW);
  });

  it('is low when package.json cannot be parsed', () => {
    const result = detectRuntime(files({ 'package.json': '{ not json' }));
    assert.equal(result.confidence, DetectionConfidence.LOW);
  });
});

describe('detection confidence — per field', () => {
  it('trusts a build command the project declares', () => {
    const result = detectRuntime(
      files({
        ...npmLock,
        'package.json': pkg({
          dependencies: { next: '14.0.0' },
          scripts: { build: 'next build', start: 'next start' },
        }),
      }),
    );

    assert.equal(result.fieldConfidence.buildCommand, DetectionConfidence.HIGH);
  });

  it('is less sure of a build command it filled in', () => {
    const result = detectRuntime(
      files({
        ...npmLock,
        'package.json': pkg({ dependencies: { next: '14.0.0' }, scripts: { start: 'next start' } }),
      }),
    );

    assert.equal(result.fieldConfidence.buildCommand, DetectionConfidence.MEDIUM);
  });

  it('never claims certainty about an assumed port', () => {
    const result = detectRuntime(
      files({
        ...npmLock,
        'package.json': pkg({
          dependencies: { express: '4.0.0' },
          scripts: { start: 'node server.js' },
        }),
      }),
    );

    assert.equal(result.fieldConfidence.applicationPort, DetectionConfidence.LOW);
  });

  it('keeps a strong framework match from masking a guessed port', () => {
    const result = detectRuntime(
      files({
        ...npmLock,
        'package.json': pkg({
          dependencies: { express: '4.0.0' },
          scripts: { start: 'node server.js' },
        }),
      }),
    );

    assert.equal(result.fieldConfidence.runtimeType, DetectionConfidence.HIGH);
  });
});

describe('package manager detection', () => {
  it('reads npm from package-lock.json', () => {
    assert.equal(detectPackageManager(files(npmLock)), PackageManager.NPM);
  });

  it('reads pnpm from pnpm-lock.yaml', () => {
    assert.equal(
      detectPackageManager(files({ 'pnpm-lock.yaml': 'lockfileVersion: 9' })),
      PackageManager.PNPM,
    );
  });

  it('reads yarn from yarn.lock', () => {
    assert.equal(detectPackageManager(files({ 'yarn.lock': '# yarn' })), PackageManager.YARN);
  });

  it('reports unknown when no lock file is committed', () => {
    assert.equal(detectPackageManager(files()), PackageManager.UNKNOWN);
  });

  it('warns that a pnpm project cannot be installed by the build', () => {
    const result = detectRuntime(
      files({
        'pnpm-lock.yaml': 'lockfileVersion: 9',
        'package.json': pkg({
          dependencies: { next: '14.0.0' },
          scripts: { build: 'next build', start: 'next start' },
        }),
      }),
    );

    assert.match(
      result.issues.find((issue) => /pnpm/.test(issue.message))?.message ?? '',
      /Commit a package-lock\.json/,
    );
  });

  it('does not warn about a package manager for an npm project', () => {
    const result = detectRuntime(
      files({
        ...npmLock,
        'package.json': pkg({
          dependencies: { next: '14.0.0' },
          scripts: { build: 'next build', start: 'next start' },
        }),
      }),
    );

    assert.equal(result.issues.filter((issue) => /npm|pnpm|Yarn/.test(issue.message)).length, 0);
  });
});

describe('every write of the detection sub-document carries all its fields', () => {
  /**
   * Mongoose replaces the whole sub-document on `$set`, so a caller that omits a
   * field silently reverts it to its schema default.
   *
   * This test has been too narrow twice. The first version read one file and
   * missed the reset in repository-connect.service.js. The second read two named
   * services and missed two writes in github.controller.js — it even asserted a
   * write count, which made the blind spot look like coverage.
   *
   * It now walks the whole web source tree, so a write added in a file nobody
   * thought to list is still checked.
   */
  const WEB_SRC = fileURLToPath(new URL('../../apps/web/src', import.meta.url));

  const REQUIRED_FIELDS = [
    'confidence',
    'fieldConfidence',
    'packageManager',
    'requiredEnvKeys',
    'optionalEnvKeys',
  ];

  async function sourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const full = join(directory, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await sourceFiles(full)));
      } else if (entry.name.endsWith('.js')) {
        files.push(full);
      }
    }
    return files;
  }

  /** Every `detection:` assignment in the web app, whatever file it lives in. */
  async function detectionWrites() {
    const writes = [];
    for (const file of await sourceFiles(WEB_SRC)) {
      const source = await readFile(file, 'utf8');
      for (const match of source.matchAll(/^\s*detection: (\{[\s\S]*?^\s*\}|[A-Za-z_]+)/gm)) {
        writes.push({ file: relative(WEB_SRC, file), body: match[1] });
      }
    }
    return writes;
  }

  it('finds the writes it is meant to check', async () => {
    // A floor, not an exact count: an exact count is what let two writes hide.
    assert.ok((await detectionWrites()).length >= 5);
  });

  for (const field of REQUIRED_FIELDS) {
    it(`sets ${field} at every write`, async () => {
      const missing = (await detectionWrites())
        // A write delegating to the shared constant carries every field.
        .filter((write) => write.body.startsWith('{'))
        .filter((write) => !write.body.includes(`${field}:`))
        .map((write) => write.file);

      assert.deepEqual(missing, []);
    });
  }

  it('resets confidence to nothing rather than to LEGACY', async () => {
    // LEGACY means "recorded before confidence was tracked", which is not the
    // same as "not yet detected".
    const source = await readFile(join(WEB_SRC, 'services/detection.service.js'), 'utf8');
    assert.match(source, /DETECTION_RESET = Object\.freeze\(\{[\s\S]*?confidence: null/);
  });
});
