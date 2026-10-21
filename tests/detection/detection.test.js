import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Set GitHub env vars so the module loads without throwing
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const {
  detectRuntime,
  detectRequiredEnvironmentVariables,
  findDockerfileSystemPackages,
  fetchProjectFilesForRepository,
  strategyAfterDetection,
} = await import('../../apps/web/src/services/detection.service.js');

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

// ── PYTHON ────────────────────────────────────────────────────────────────────

describe('detectRuntime — PYTHON', () => {
  const flaskApp = 'from flask import Flask\napplication = Flask(__name__)\n';

  it('detects a Flask app and suggests its WSGI object', () => {
    const result = detectRuntime(
      files({ 'requirements.txt': 'flask==3.1.0\ngunicorn==23.0.0\n', 'app.py': flaskApp }),
    );
    assert.deepEqual(
      {
        runtimeType: result.runtimeType,
        strategy: result.recommendedBuildStrategy,
        module: result.applicationModule,
        port: result.applicationPort,
        isValid: result.isValid,
      },
      {
        runtimeType: 'PYTHON',
        strategy: 'python_flask_v1',
        module: 'app:application',
        port: 8000,
        isValid: true,
      },
    );
  });

  it('detects FastAPI inside an app package', () => {
    const result = detectRuntime(
      files({
        'requirements.txt': 'fastapi==0.115.0\nuvicorn==0.32.0\n',
        'app/main.py': 'from fastapi import FastAPI\napi = FastAPI()\n',
      }),
    );
    assert.equal(result.applicationModule, 'app.main:api');
  });

  it('derives the Django WSGI module from manage.py settings', () => {
    const result = detectRuntime(
      files({
        'requirements.txt': 'Django==5.1.2\ngunicorn==23.0.0\n',
        'manage.py': "os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'mysite.settings')\n",
      }),
    );
    assert.equal(result.applicationModule, 'mysite.wsgi:application');
  });

  it('requires gunicorn for a Flask app', () => {
    const result = detectRuntime(
      files({ 'requirements.txt': 'flask==3.1.0\n', 'app.py': flaskApp }),
    );
    assert.ok(
      result.issues.some(
        (issue) => issue.level === 'ERROR' && issue.message.includes('Add gunicorn'),
      ),
    );
  });

  it('requires uvicorn for a FastAPI app', () => {
    const result = detectRuntime(files({ 'requirements.txt': 'fastapi==0.115.0\n' }));
    assert.ok(
      result.issues.some(
        (issue) => issue.level === 'ERROR' && issue.message.includes('Add uvicorn'),
      ),
    );
  });

  it('asks a pyproject-only project to export requirements.txt', () => {
    const result = detectRuntime(
      files({ 'pyproject.toml': '[project]\ndependencies = ["flask>=3", "gunicorn"]\n' }),
    );
    assert.ok(
      result.issues.some(
        (issue) => issue.level === 'ERROR' && issue.message.includes('requirements.txt'),
      ),
    );
  });

  it('rejects an unsupported .python-version', () => {
    const result = detectRuntime(
      files({
        'requirements.txt': 'flask==3.1.0\ngunicorn==23.0.0\n',
        '.python-version': '3.8\n',
        'app.py': flaskApp,
      }),
    );
    assert.equal(result.isValid, false);
  });

  it('warns that unpinned requirements can change between builds', () => {
    const result = detectRuntime(
      files({ 'requirements.txt': 'flask\ngunicorn==23.0.0\n', 'app.py': flaskApp }),
    );
    assert.ok(
      result.issues.some((issue) => issue.level === 'WARNING' && issue.message.includes('flask')),
    );
  });

  it('asks for the module when no entry point is found', () => {
    const result = detectRuntime(files({ 'requirements.txt': 'flask==3.1.0\ngunicorn==23.0.0\n' }));
    assert.ok(
      result.issues.some(
        (issue) => issue.level === 'WARNING' && issue.message.includes('application module'),
      ),
    );
  });

  it('prefers Django and warns when several frameworks are listed', () => {
    const result = detectRuntime(
      files({ 'requirements.txt': 'django==5.1.2\nflask==3.1.0\ngunicorn==23.0.0\n' }),
    );
    assert.deepEqual(
      [
        result.recommendedBuildStrategy,
        result.issues.some((issue) => issue.message.includes('Several Python web frameworks')),
      ],
      ['python_django_v1', true],
    );
  });

  it('reports a Python project without a supported framework', () => {
    const result = detectRuntime(files({ 'requirements.txt': 'requests==2.32.3\n' }));
    assert.ok(
      result.issues.some((issue) => issue.level === 'ERROR' && issue.message.includes('Flask')),
    );
  });

  it('serves a Flask repository with a root index.html as Python, not static files', () => {
    const result = detectRuntime(
      files({
        'requirements.txt': 'flask==3.1.0\ngunicorn==23.0.0\n',
        'index.html': '<html/>',
        'app.py': flaskApp,
      }),
    );
    assert.equal(result.runtimeType, 'PYTHON');
  });

  it('keeps an Express app with Python tooling detected as Express', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ dependencies: { express: '*' }, scripts: { start: 'node app.js' } }),
        'package-lock.json': '{}',
        'requirements.txt': 'flask==3.1.0\n',
      }),
    );
    assert.equal(result.runtimeType, 'EXPRESS');
  });

  it('detects Django when its frontend builds with React and Vite', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ dependencies: { react: '*' }, scripts: { build: 'vite build' } }),
        'package-lock.json': '{}',
        'vite.config.js': 'export default {}',
        'requirements.txt': 'django==5.1.2\ngunicorn==23.0.0\n',
      }),
    );
    assert.equal(result.runtimeType, 'PYTHON');
  });

  it('keeps a React app with non-web Python tooling and its own lockfile error', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ dependencies: { react: '*' }, scripts: { build: 'vite build' } }),
        'vite.config.js': 'export default {}',
        'requirements.txt': 'black==24.10.0\n',
      }),
    );
    assert.deepEqual(
      [result.runtimeType, result.issues.some((issue) => issue.message.includes('package-lock'))],
      ['REACT', true],
    );
  });

  it('detects Python when package.json only carries asset tooling', () => {
    const result = detectRuntime(
      files({
        'package.json': pkg({ devDependencies: { tailwindcss: '*' }, scripts: {} }),
        'requirements.txt': 'django==5.1.2\ngunicorn==23.0.0\n',
      }),
    );
    assert.equal(result.runtimeType, 'PYTHON');
  });
});

// ── PHP ───────────────────────────────────────────────────────────────────────

describe('detectRuntime — PHP', () => {
  const laravelComposer = JSON.stringify({
    require: { php: '^8.2', 'laravel/framework': '^11.0' },
  });

  it('detects a plain PHP site served from the repository root', () => {
    const result = detectRuntime(files({ 'index.php': '<?php echo "hi";' }));
    assert.deepEqual(
      [result.runtimeType, result.recommendedBuildStrategy, result.outputDirectory, result.isValid],
      ['PHP', 'php_plain_v1', '.', true],
    );
  });

  it('warns that a root document root publishes every repository file', () => {
    const result = detectRuntime(files({ 'index.php': '<?php echo "hi";' }));
    assert.ok(result.issues.some((issue) => issue.message.includes('publicly served')));
  });

  it('serves a composer project with public/index.php from public', () => {
    const result = detectRuntime(
      files({
        'composer.json': JSON.stringify({ require: { 'slim/slim': '^4.0' } }),
        'composer.lock': '{}',
        'public/index.php': '<?php',
      }),
    );
    assert.equal(result.outputDirectory, 'public');
  });

  it('detects Laravel and serves its public folder', () => {
    const result = detectRuntime(
      files({
        'composer.json': laravelComposer,
        'composer.lock': '{}',
        artisan: '#!/usr/bin/env php',
      }),
    );
    assert.deepEqual(
      [result.recommendedBuildStrategy, result.outputDirectory, result.applicationPort],
      ['php_laravel_v1', 'public', 8080],
    );
  });

  it('builds Laravel frontend assets when package.json has a build script', () => {
    const result = detectRuntime(
      files({
        'composer.json': laravelComposer,
        'composer.lock': '{}',
        artisan: '#!/usr/bin/env php',
        'package.json': pkg({
          devDependencies: { vite: '6.0.0' },
          scripts: { build: 'vite build' },
        }),
        'package-lock.json': '{}',
      }),
    );
    assert.equal(result.buildCommand, 'npm run build');
  });

  it('detects Laravel over the Vue frontend in the same repository', () => {
    const result = detectRuntime(
      files({
        'composer.json': laravelComposer,
        'composer.lock': '{}',
        artisan: '#!/usr/bin/env php',
        'package.json': pkg({ dependencies: { vue: '3.5.0' }, scripts: { build: 'vite build' } }),
        'package-lock.json': '{}',
        'vite.config.js': 'export default {}',
      }),
    );
    assert.equal(result.runtimeType, 'PHP');
  });

  it('requires composer.lock for a composer project', () => {
    const result = detectRuntime(
      files({ 'composer.json': laravelComposer, artisan: '#!/usr/bin/env php' }),
    );
    assert.ok(
      result.issues.some(
        (issue) => issue.level === 'ERROR' && issue.message.includes('composer.lock'),
      ),
    );
  });

  it('rejects a PHP constraint no supported version satisfies', () => {
    const result = detectRuntime(
      files({
        'composer.json': JSON.stringify({ require: { php: '^7.4' } }),
        'composer.lock': '{}',
        'index.php': '<?php',
      }),
    );
    assert.equal(result.isValid, false);
  });

  it('reports WordPress as not supported yet', () => {
    const result = detectRuntime(files({ 'index.php': '<?php', 'wp-settings.php': '<?php' }));
    assert.ok(
      result.issues.some((issue) => issue.level === 'ERROR' && issue.message.includes('WordPress')),
    );
  });

  it('asks for an index.php when a composer project has no entry point', () => {
    const result = detectRuntime(
      files({ 'composer.json': JSON.stringify({ require: {} }), 'composer.lock': '{}' }),
    );
    assert.ok(
      result.issues.some((issue) => issue.level === 'ERROR' && issue.message.includes('index.php')),
    );
  });

  it('serves a site with index.php and index.html as PHP, not static files', () => {
    const result = detectRuntime(files({ 'index.php': '<?php', 'index.html': '<html/>' }));
    assert.equal(result.runtimeType, 'PHP');
  });
});

// ── JAVA ──────────────────────────────────────────────────────────────────────

describe('detectRuntime — JAVA', () => {
  const springPom = `<project>
  <parent><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-parent</artifactId></parent>
  <properties><java.version>21</java.version></properties>
  <dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies>
</project>`;
  const springGradle = "plugins { id 'org.springframework.boot' version '3.5.6' }\n";

  it('detects a Maven Spring Boot app with its wrapper', () => {
    const result = detectRuntime(files({ 'pom.xml': springPom, mvnw: '#!/bin/sh' }));
    assert.deepEqual(
      [result.runtimeType, result.recommendedBuildStrategy, result.applicationPort, result.isValid],
      ['JAVA', 'java_maven_v1', 8080, true],
    );
  });

  it('detects a Gradle Kotlin DSL Spring Boot app with its wrapper', () => {
    const result = detectRuntime(
      files({
        'build.gradle.kts': 'plugins { id("org.springframework.boot") version "3.5.6" }',
        gradlew: '#!/bin/sh',
      }),
    );
    assert.equal(result.recommendedBuildStrategy, 'java_gradle_v1');
  });

  it('requires the Maven wrapper', () => {
    const result = detectRuntime(files({ 'pom.xml': springPom }));
    assert.ok(
      result.issues.some((issue) => issue.level === 'ERROR' && issue.message.includes('mvnw')),
    );
  });

  it('requires the Gradle wrapper', () => {
    const result = detectRuntime(files({ 'build.gradle': springGradle }));
    assert.ok(
      result.issues.some((issue) => issue.level === 'ERROR' && issue.message.includes('gradlew')),
    );
  });

  it('suggests the Actuator health endpoint when Actuator is a dependency', () => {
    const result = detectRuntime(
      files({
        'pom.xml': springPom.replace(
          '</dependencies>',
          '<dependency><artifactId>spring-boot-starter-actuator</artifactId></dependency></dependencies>',
        ),
        mvnw: '#!/bin/sh',
      }),
    );
    assert.equal(result.healthCheckPath, '/actuator/health');
  });

  it('warns that the root path must respond without Actuator', () => {
    const result = detectRuntime(files({ 'pom.xml': springPom, mvnw: '#!/bin/sh' }));
    assert.ok(
      result.issues.some(
        (issue) => issue.level === 'WARNING' && issue.message.includes('health check'),
      ),
    );
  });

  it('rejects a multi-module Maven build', () => {
    const result = detectRuntime(
      files({
        'pom.xml': springPom.replace(
          '</project>',
          '<modules><module>api</module></modules></project>',
        ),
        mvnw: '#!/bin/sh',
      }),
    );
    assert.ok(
      result.issues.some((issue) => issue.level === 'ERROR' && issue.message.includes('module')),
    );
  });

  it('rejects an unsupported Java version', () => {
    const result = detectRuntime(
      files({ 'pom.xml': springPom.replace('>21<', '>11<'), mvnw: '#!/bin/sh' }),
    );
    assert.equal(result.isValid, false);
  });

  it('reports a Java build that is not Spring Boot', () => {
    const result = detectRuntime(files({ 'pom.xml': '<project/>', mvnw: '#!/bin/sh' }));
    assert.ok(
      result.issues.some(
        (issue) => issue.level === 'ERROR' && issue.message.includes('Spring Boot'),
      ),
    );
  });

  it('recommends at least 512 MB of memory', () => {
    const result = detectRuntime(files({ 'pom.xml': springPom, mvnw: '#!/bin/sh' }));
    assert.ok(result.issues.some((issue) => issue.message.includes('512 MB')));
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

describe('fetchProjectFilesForRepository — Python entry files', () => {
  const publicRepository = { sourceType: 'PUBLIC_GIT', fullName: 'owner/repo' };

  async function requestedPaths(presentFiles) {
    const paths = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const path = decodeURIComponent(new URL(url).pathname.split('/contents/')[1]);
      paths.push(path);
      if (!(path in presentFiles)) {
        return new Response('', { status: 404 });
      }
      const content = Buffer.from(presentFiles[path]).toString('base64');
      return new Response(JSON.stringify({ encoding: 'base64', content }), { status: 200 });
    };
    try {
      await fetchProjectFilesForRepository(publicRepository, 'main');
    } finally {
      globalThis.fetch = originalFetch;
    }
    return paths;
  }

  it('fetches entry-point candidates when requirements.txt exists', async () => {
    const paths = await requestedPaths({ 'requirements.txt': 'flask==3.1.0\n' });
    assert.ok(paths.includes('manage.py'));
  });

  // A rate limit must not look like a missing package.json and be saved as the
  // repository's runtime.
  it('fails instead of treating a GitHub error as a missing file', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) =>
      String(url).includes('package.json')
        ? new Response('rate limited', { status: 403 })
        : new Response('', { status: 404 });
    try {
      await assert.rejects(
        fetchProjectFilesForRepository(publicRepository, 'main'),
        /GitHub API error fetching package\.json: 403/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // Only a lockfile's presence matters, and large apps commit lockfiles bigger
  // than the detection response cap.
  it('counts an oversized lockfile as present', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) =>
      String(url).includes('package-lock.json')
        ? new Response('', { status: 200, headers: { 'content-length': '900000' } })
        : new Response('', { status: 404 });
    try {
      const files = await fetchProjectFilesForRepository(publicRepository, 'main');
      assert.equal(files['package-lock.json'], '');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not fetch entry-point candidates for a Node repository', async () => {
    const paths = await requestedPaths({ 'package.json': '{}' });
    assert.equal(paths.includes('manage.py'), false);
  });
});

describe('strategyAfterDetection', () => {
  it('falls back to the legacy build when the runtime no longer matches', () => {
    assert.equal(strategyAfterDetection('next_standard_v1', 'EXPRESS'), 'legacy_generated');
  });

  it('keeps a strategy that still matches the runtime', () => {
    assert.equal(strategyAfterDetection('python_django_v1', 'PYTHON'), 'python_django_v1');
  });

  it('keeps the legacy build as it is', () => {
    assert.equal(strategyAfterDetection(null, 'EXPRESS'), null);
  });
});

// The default (legacy) Next.js image copies public/; without one the build fails
// late with an opaque Docker error, so detection says so up front.
describe('detectRuntime — Next.js public folder', () => {
  const nextFiles = (hasPublicDir) =>
    files({
      'package.json': pkg({
        dependencies: { next: '^14.0.0', react: '*', 'react-dom': '*' },
        scripts: { build: 'next build', start: 'next start' },
      }),
      'package-lock.json': '{}',
      'public/': hasPublicDir,
    });

  it('warns when the repository has no public folder', () => {
    const result = detectRuntime(nextFiles(false));
    assert.ok(result.issues.some((issue) => /public\/ folder/.test(issue.message)));
  });

  it('does not warn when the public folder exists', () => {
    const result = detectRuntime(nextFiles(true));
    assert.equal(
      result.issues.some((issue) => /public\/ folder/.test(issue.message)),
      false,
    );
  });
});

describe('fetchProjectFilesForRepository — Next.js public folder', () => {
  it('records whether a Next.js repository has a public folder', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const path = decodeURIComponent(new URL(url).pathname.split('/contents/')[1]);
      if (path === 'package.json') {
        const content = Buffer.from(JSON.stringify({ dependencies: { next: '15' } })).toString(
          'base64',
        );
        return new Response(JSON.stringify({ encoding: 'base64', content }), { status: 200 });
      }
      if (path === 'public') {
        return new Response(JSON.stringify([{ name: 'favicon.ico' }]), { status: 200 });
      }
      return new Response('', { status: 404 });
    };
    try {
      const fetched = await fetchProjectFilesForRepository(
        { sourceType: 'PUBLIC_GIT', fullName: 'owner/repo' },
        'main',
      );
      assert.equal(fetched['public/'], true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
