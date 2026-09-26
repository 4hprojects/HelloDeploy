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

describe('detection confidence is persisted, not dropped', () => {
  it('writes confidence on every path that stores a detection result', async () => {
    const source = await readFile(
      new URL('../../apps/web/src/services/detection.service.js', import.meta.url),
      'utf8',
    );

    // Two places persist `detection`: persistDetectionResult() and the inline
    // update in runProjectDetection(). Both must carry confidence, or the
    // wizard's confidence gate silently sees LEGACY and asks the owner to
    // review settings it was actually sure about.
    const writes = source.match(/detection: \{\s*\n\s*status:/g) ?? [];
    const withConfidence = source.match(/confidence: result\.confidence/g) ?? [];

    assert.equal(withConfidence.length, writes.length);
  });
});
