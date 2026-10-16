import assert from 'node:assert/strict';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { BuildStrategy } from '@hellodeploy/contracts';
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

      const dockerfile = generateDockerfile({
        runtimeType: fixture.runtimeType,
        buildStrategy: fixture.buildStrategy,
        buildCommand: detection.buildCommand,
        startCommand: detection.startCommand,
        outputDirectory: detection.outputDirectory,
        applicationPort: detection.applicationPort,
      });
      assert.match(dockerfile, /^FROM /);
      if (fixture.buildStrategy.startsWith('next_')) {
        assert.match(dockerfile, /node:22-bookworm-slim/);
      }
    });
  }
});
