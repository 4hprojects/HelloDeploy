import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
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
   * field silently reverts it to its schema default. The first version of this
   * test scanned only detection.service.js and therefore missed the reset in
   * repository-connect.service.js — the bug it was written to prevent. It now
   * reads every service that writes `detection`.
   */
  const WRITERS = [
    '../../apps/web/src/services/detection.service.js',
    '../../apps/web/src/services/repository-connect.service.js',
  ];

  const REQUIRED_FIELDS = [
    'confidence',
    'fieldConfidence',
    'packageManager',
    'requiredEnvKeys',
    'optionalEnvKeys',
  ];

  async function detectionWrites() {
    const writes = [];
    for (const relative of WRITERS) {
      const source = await readFile(new URL(relative, import.meta.url), 'utf8');
      // Each object literal assigned to `detection:`, and each shared constant use.
      for (const match of source.matchAll(/detection: (\{[\s\S]*?\n {8}\}|[A-Z_]+)/g)) {
        writes.push({ file: relative, body: match[1] });
      }
    }
    return writes;
  }

  it('finds every place detection is written', async () => {
    // Guards the test itself: if a write moves or is added elsewhere, the count
    // changes and this fails rather than quietly checking nothing.
    assert.equal((await detectionWrites()).length, 3);
  });

  for (const field of REQUIRED_FIELDS) {
    it(`sets ${field} at every write`, async () => {
      const missing = (await detectionWrites())
        // A write that delegates to the shared constant carries every field.
        .filter((write) => !/^[A-Z_]+$/.test(write.body))
        .filter((write) => !write.body.includes(`${field}:`))
        .map((write) => write.file);

      assert.deepEqual(missing, []);
    });
  }

  it('resets confidence to nothing rather than to LEGACY', async () => {
    // LEGACY means "recorded before confidence was tracked", which is not the
    // same as "not yet detected".
    const source = await readFile(
      new URL('../../apps/web/src/services/detection.service.js', import.meta.url),
      'utf8',
    );

    assert.match(source, /DETECTION_RESET = Object\.freeze\(\{[\s\S]*?confidence: null/);
  });
});
