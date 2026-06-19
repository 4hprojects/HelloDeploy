import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Set GitHub env vars so the module loads without throwing
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const { detectRuntime } = await import('../../apps/web/src/services/detection.service.js');

// ── Helpers ───────────────────────────────────────────────────────────────────

function files(overrides = {}) {
  // All files null by default (absent)
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

// ── STATIC ────────────────────────────────────────────────────────────────────

describe('detectRuntime — STATIC', () => {
  it('detects STATIC when only index.html exists', () => {
    const result = detectRuntime(files({ 'index.html': '<html/>' }));
    assert.equal(result.runtimeType, 'STATIC');
    assert.equal(result.isValid, true);
    assert.equal(result.issues.length, 0);
  });

  it('returns UNKNOWN when no package.json and no index.html', () => {
    const result = detectRuntime(files());
    assert.equal(result.runtimeType, 'UNKNOWN');
    assert.equal(result.isValid, false);
    assert.ok(result.issues.some((i) => i.level === 'ERROR'));
  });
});

// ── NEXTJS ────────────────────────────────────────────────────────────────────

describe('detectRuntime — NEXTJS', () => {
  it('detects NEXTJS from next dep + build script', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { next: '^14.0.0', react: '*', 'react-dom': '*' },
          scripts: { build: 'next build', start: 'next start' },
        }),
        'package-lock.json': '{}',
      }),
    );
    assert.equal(result.runtimeType, 'NEXTJS');
    assert.equal(result.isValid, true);
    assert.equal(result.outputDirectory, '.next');
  });

  it('warns when build script is missing for NEXTJS', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { next: '^14.0.0' },
          scripts: {},
        }),
        'package-lock.json': '{}',
      }),
    );
    assert.equal(result.runtimeType, 'NEXTJS');
    assert.ok(result.issues.some((i) => i.level === 'ERROR' && i.message.includes('"build"')));
    assert.equal(result.isValid, false);
  });
});

// ── REACT (CRA) ───────────────────────────────────────────────────────────────

describe('detectRuntime — REACT (CRA)', () => {
  it('detects REACT via react-scripts', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { 'react-scripts': '5.0.0', react: '*' },
          scripts: { start: 'react-scripts start', build: 'react-scripts build' },
        }),
        'package-lock.json': '{}',
      }),
    );
    assert.equal(result.runtimeType, 'REACT');
    assert.equal(result.isValid, true);
    assert.equal(result.outputDirectory, 'build');
  });
});

// ── REACT (Vite) ──────────────────────────────────────────────────────────────

describe('detectRuntime — REACT (Vite)', () => {
  it('detects REACT via vite.config.js + react dep', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { react: '*', 'react-dom': '*' },
          devDependencies: { vite: '*' },
          scripts: { build: 'vite build' },
        }),
        'vite.config.js': 'export default {}',
        'package-lock.json': '{}',
      }),
    );
    assert.equal(result.runtimeType, 'REACT');
    assert.equal(result.outputDirectory, 'dist');
  });
});

// ── VUE ───────────────────────────────────────────────────────────────────────

describe('detectRuntime — VUE', () => {
  it('detects VUE via vite.config.ts + vue dep', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { vue: '^3.0.0' },
          devDependencies: { vite: '*' },
          scripts: { build: 'vite build' },
        }),
        'vite.config.ts': 'export default {}',
        'package-lock.json': '{}',
      }),
    );
    assert.equal(result.runtimeType, 'VUE');
    assert.equal(result.outputDirectory, 'dist');
  });
});

// ── EXPRESS ───────────────────────────────────────────────────────────────────

describe('detectRuntime — EXPRESS', () => {
  it('detects EXPRESS from express dep + start script', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { express: '^4.18.0' },
          scripts: { start: 'node server.js' },
        }),
        'package-lock.json': '{}',
      }),
    );
    assert.equal(result.runtimeType, 'EXPRESS');
    assert.equal(result.isValid, true);
  });

  it('issues ERROR when express project has no start script', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ dependencies: { express: '*' }, scripts: {} }),
        'package-lock.json': '{}',
      }),
    );
    assert.equal(result.runtimeType, 'EXPRESS');
    assert.ok(result.issues.some((i) => i.level === 'ERROR' && i.message.includes('"start"')));
    assert.equal(result.isValid, false);
  });
});

// ── NODEJS ────────────────────────────────────────────────────────────────────

describe('detectRuntime — NODEJS', () => {
  it('detects NODEJS from start script alone', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ scripts: { start: 'node index.js' } }),
        'package-lock.json': '{}',
      }),
    );
    assert.equal(result.runtimeType, 'NODEJS');
    assert.equal(result.isValid, true);
  });
});

// ── Warnings ──────────────────────────────────────────────────────────────────

describe('detectRuntime — warnings', () => {
  it('warns when no lock file', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ dependencies: { express: '*' }, scripts: { start: 'node app.js' } }),
      }),
    );
    assert.ok(result.issues.some((i) => i.level === 'WARNING' && /lock file/i.test(i.message)));
  });

  it('warns about Dockerfile presence', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ scripts: { start: 'node app.js' } }),
        Dockerfile: 'FROM node:22',
        'package-lock.json': '{}',
      }),
    );
    assert.ok(result.issues.some((i) => i.level === 'WARNING' && /Dockerfile/i.test(i.message)));
  });

  it('issues ERROR for invalid package.json JSON', () => {
    const result = detectRuntime(files({ 'package.json': 'NOT JSON' }));
    assert.equal(result.runtimeType, 'UNKNOWN');
    assert.equal(result.isValid, false);
    assert.ok(result.issues.some((i) => i.message.includes('valid JSON')));
  });
});
