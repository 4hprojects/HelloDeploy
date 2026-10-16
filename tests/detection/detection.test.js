import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Set GitHub env vars so the module loads without throwing
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const { detectRuntime, detectRequiredEnvironmentVariables, findDockerfileSystemPackages } =
  await import('../../apps/web/src/services/detection.service.js');

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
    'next.config.cjs': null,
    'next.config.mjs': null,
    'next.config.ts': null,
    'next.config.mts': null,
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

  it('recommends static export from a CJS config without executing it', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { next: '^16.0.0', react: '*', 'react-dom': '*' },
          scripts: { build: 'next build' },
        }),
        'package-lock.json': '{}',
        'next.config.cjs': `module.exports = { output: 'export' };`,
      }),
    );
    assert.equal(result.recommendedBuildStrategy, 'next_export_v1');
    assert.equal(result.outputDirectory, 'out');
    assert.equal(result.applicationPort, null);
  });

  it('recommends standalone from an MTS config', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { next: '^15.0.0' },
          scripts: { build: 'next build' },
        }),
        'package-lock.json': '{}',
        'next.config.mts': `export default { output: "standalone" };`,
      }),
    );
    assert.equal(result.recommendedBuildStrategy, 'next_standalone_v1');
    assert.equal(result.startCommand, 'node server.js');
  });

  it('marks a dynamic output setting as ambiguous and recommends standard mode', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { next: '^16.0.0' },
          scripts: { build: 'next build', start: 'next start' },
        }),
        'package-lock.json': '{}',
        'next.config.ts': 'export default { output: process.env.NEXT_OUTPUT }',
      }),
    );
    assert.equal(result.recommendedBuildStrategy, 'next_standard_v1');
    assert.ok(result.issues.some((issue) => issue.message.includes('statically confirm')));
  });

  it('does not treat a commented output example as confirmed configuration', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { next: '^16.0.0' },
          scripts: { build: 'next build', start: 'next start' },
        }),
        'package-lock.json': '{}',
        'next.config.js': '// output: "export"\nmodule.exports = {}',
      }),
    );
    assert.equal(result.recommendedBuildStrategy, 'next_standard_v1');
    assert.equal(
      result.issues.some((issue) => issue.level === 'WARNING'),
      false,
    );
  });

  it('warns that standard server mode needs a start script', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { next: '^15.0.0' },
          scripts: { build: 'next build' },
        }),
        'package-lock.json': '{}',
      }),
    );
    assert.ok(
      result.issues.some(
        (issue) => issue.level === 'WARNING' && issue.message.includes('"start": "next start"'),
      ),
    );
  });

  it('warns that standard server mode prunes a next devDependency', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          devDependencies: { next: '^15.0.0' },
          scripts: { build: 'next build', start: 'next start' },
        }),
        'package-lock.json': '{}',
      }),
    );
    assert.ok(
      result.issues.some(
        (issue) =>
          issue.level === 'WARNING' && issue.message.includes('move "next" to dependencies'),
      ),
    );
  });

  it('does not ask a standalone build for a start script or runtime next dependency', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          devDependencies: { next: '^15.0.0' },
          scripts: { build: 'next build' },
        }),
        'package-lock.json': '{}',
        'next.config.mjs': `export default { output: 'standalone' };`,
      }),
    );
    assert.deepEqual(result.issues, []);
  });

  it('warns that a custom Next.js distDir is not supported', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({
          dependencies: { next: '^15.0.0' },
          scripts: { build: 'next build', start: 'next start' },
        }),
        'package-lock.json': '{}',
        'next.config.js': `module.exports = { distDir: 'build' };`,
      }),
    );
    assert.ok(
      result.issues.some((issue) => issue.level === 'WARNING' && issue.message.includes('distDir')),
    );
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

  it('starts from the port documented in the sample env file', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ scripts: { start: 'node index.js' } }),
        'package-lock.json': '{}',
        '.env.example': 'NODE_ENV=production\nPORT=4000 # local port\n',
      }),
    );
    assert.equal(result.applicationPort, 4000);
  });

  it('falls back to port 3000 when the sample env file has no port', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ scripts: { start: 'node index.js' } }),
        'package-lock.json': '{}',
        '.env.example': 'NODE_ENV=production\n',
      }),
    );
    assert.equal(result.applicationPort, 3000);
  });
});

describe('detectRequiredEnvironmentVariables', () => {
  it('never asks the owner for PORT, which HelloDeploy sets itself', () => {
    assert.deepEqual(
      detectRequiredEnvironmentVariables({ '.env.example': 'PORT=3000\nMONGODB_URI=\n' }),
      ['MONGODB_URI'],
    );
  });
});

// ── Warnings ──────────────────────────────────────────────────────────────────

describe('detectRuntime — package manager contract', () => {
  it('blocks deployment when package-lock.json is missing', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ dependencies: { express: '*' }, scripts: { start: 'node app.js' } }),
      }),
    );
    assert.equal(result.isValid, false);
    assert.ok(
      result.issues.some((i) => i.level === 'ERROR' && /package-lock\.json/i.test(i.message)),
    );
  });

  it('blocks Yarn and pnpm projects until their installers are supported', () => {
    for (const lockfile of ['yarn.lock', 'pnpm-lock.yaml']) {
      const result = detectRuntime(
        files({
          'package.json': pkg({
            dependencies: { express: '*' },
            scripts: { start: 'node app.js' },
          }),
          [lockfile]: 'lockfile content',
        }),
      );
      assert.equal(result.isValid, false, lockfile);
      assert.ok(
        result.issues.some((i) => /npm projects only/i.test(i.message)),
        lockfile,
      );
    }
  });

  it('notes a plain Dockerfile without warning', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ scripts: { start: 'node app.js' } }),
        Dockerfile: 'FROM node:22\nRUN npm ci\nCMD ["npm", "start"]',
        'package-lock.json': '{}',
      }),
    );
    assert.deepEqual(
      result.issues.map((i) => i.level),
      ['INFO'],
    );
  });

  it('warns and names the packages a Dockerfile installs', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ scripts: { start: 'node app.js' } }),
        Dockerfile: 'FROM node:22\nRUN apt-get update && apt-get install -y ffmpeg',
        'package-lock.json': '{}',
      }),
    );
    assert.ok(result.issues.some((i) => i.level === 'WARNING' && /\(ffmpeg\)/.test(i.message)));
  });

  it('issues ERROR for invalid package.json JSON', () => {
    const result = detectRuntime(files({ 'package.json': 'NOT JSON' }));
    assert.equal(result.runtimeType, 'UNKNOWN');
    assert.equal(result.isValid, false);
    assert.ok(result.issues.some((i) => i.message.includes('valid JSON')));
  });
});

describe('findDockerfileSystemPackages', () => {
  it('reads packages across continued lines and drops version pins', () => {
    const dockerfile = [
      'FROM node:22',
      'RUN apt-get update && apt-get install -y --no-install-recommends \\',
      '    ffmpeg imagemagick=7.* \\',
      '  && echo done',
    ].join('\n');
    assert.deepEqual(findDockerfileSystemPackages(dockerfile), ['ffmpeg', 'imagemagick']);
  });

  it('reports a pip requirements file instead of its flag', () => {
    assert.deepEqual(findDockerfileSystemPackages('RUN pip3 install -r requirements.txt'), [
      'packages from requirements.txt',
    ]);
  });

  it('reads Alpine apk installs', () => {
    assert.deepEqual(findDockerfileSystemPackages('RUN apk add --no-cache python3 make g++'), [
      'python3',
      'make',
      'g++',
    ]);
  });

  it('ignores npm installs', () => {
    assert.deepEqual(findDockerfileSystemPackages('RUN npm ci && npm run build'), []);
  });
});
