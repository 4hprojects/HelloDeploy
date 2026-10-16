import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  BuildStrategy,
  resolveJavaVersion,
  resolvePhpVersion,
  resolvePythonVersion,
} from '@hellodeploy/contracts';
import { detectRuntime } from '../../apps/web/src/services/detection.service.js';
import { generateDockerfile } from '../../apps/worker/src/deployment/dockerfile-generator.js';

const fixtureRoot = path.resolve('tests/fixtures/multi-runtime');
const manifest = JSON.parse(await readFile(path.join(fixtureRoot, 'manifest.json'), 'utf8'));
const detectionPaths = [
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'index.html',
  'Dockerfile',
  'vite.config.js',
  'vite.config.ts',
  'next.config.js',
  'next.config.cjs',
  'next.config.mjs',
  'next.config.ts',
  'next.config.mts',
  'requirements.txt',
  'pyproject.toml',
  '.python-version',
  'manage.py',
  'app.py',
  'main.py',
  'wsgi.py',
  'asgi.py',
  'app/main.py',
  'app/__init__.py',
  'composer.json',
  'composer.lock',
  'index.php',
  'artisan',
  'public/index.php',
  'wp-settings.php',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'mvnw',
  'gradlew',
  'settings.gradle',
  'settings.gradle.kts',
];

async function readDetectionFiles(directory) {
  return Object.fromEntries(
    await Promise.all(
      detectionPaths.map(async (file) => {
        try {
          return [file, await readFile(path.join(directory, file), 'utf8')];
        } catch (error) {
          if (error.code === 'ENOENT') {
            return [file, null];
          }
          throw error;
        }
      }),
    ),
  );
}

describe('tracked multi-runtime fixtures', () => {
  for (const fixture of manifest.fixtures) {
    it(`${fixture.id} has reproducible metadata, expected detection, and a generated template`, async () => {
      const directory = path.resolve(fixture.applicationRoot);
      assert.ok(
        (await realpath(directory)).startsWith(`${await realpath(fixtureRoot)}${path.sep}`),
      );
      assert.ok((await stat(directory)).isDirectory());
      const files = await readDetectionFiles(directory);
      const detection = detectRuntime(files);
      assert.equal(detection.isValid, true);
      assert.equal(detection.runtimeType, fixture.runtimeType);

      if (fixture.runtimeType !== 'STATIC') {
        const expectedDetectionStrategy =
          fixture.id === 'next14-legacy' ? BuildStrategy.NEXT_STANDALONE_V1 : fixture.buildStrategy;
        assert.equal(detection.recommendedBuildStrategy, expectedDetectionStrategy);
      }

      if (files['package.json']) {
        const packageJson = JSON.parse(files['package.json']);
        const lockfile = JSON.parse(files['package-lock.json']);
        assert.equal(lockfile.lockfileVersion, 3);
        assert.deepEqual(lockfile.packages[''].dependencies ?? {}, packageJson.dependencies ?? {});
        for (const version of Object.values({
          ...(packageJson.dependencies ?? {}),
          ...(packageJson.devDependencies ?? {}),
        })) {
          assert.match(version, /^\d+\.\d+\.\d+$/, 'fixture dependencies must be exactly pinned');
        }
      }

      if (files['requirements.txt']) {
        assert.equal(detection.applicationModule, fixture.applicationModule);
        for (const line of files['requirements.txt'].split('\n')) {
          const requirement = line.replace(/#.*$/, '').trim();
          if (requirement) {
            assert.match(
              requirement,
              /^[a-z0-9-]+==\d+(?:\.\d+)+$/,
              'fixture requirements must be exactly pinned',
            );
          }
        }
      }

      const dockerfile = generateDockerfile({
        runtimeType: fixture.runtimeType,
        buildStrategy: fixture.buildStrategy,
        buildCommand: detection.buildCommand,
        startCommand: detection.startCommand,
        outputDirectory: detection.outputDirectory,
        applicationPort: detection.applicationPort,
        applicationModule: detection.applicationModule,
        pythonVersion: resolvePythonVersion(files['.python-version']).version,
        phpVersion: resolvePhpVersion(files['composer.json']).version,
        javaVersion: resolveJavaVersion({
          pom: files['pom.xml'],
          gradle: files['build.gradle.kts'] ?? files['build.gradle'],
        }).version,
      });
      assert.match(dockerfile, /^FROM /);
      if (fixture.buildStrategy.startsWith('next_')) {
        assert.match(dockerfile, /node:22-bookworm-slim/);
      }
      if (fixture.buildStrategy.startsWith('java_')) {
        assert.match(dockerfile, /eclipse-temurin:(17|21|25)-jre/);
      }
      if (fixture.buildStrategy.startsWith('php_')) {
        assert.match(dockerfile, /php:8\.[34]-apache-bookworm/);
      }
      if (fixture.buildStrategy.startsWith('python_')) {
        assert.match(dockerfile, /python:3\.1[23]-slim-bookworm/);
      }
    });
  }
});
