import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  resolveBuildStrategy,
  resolveRuntimeSpec,
} from '../../apps/worker/src/deployment/build-strategy.js';
import {
  BuildExecutorMode,
  createBuildExecutor,
} from '../../apps/worker/src/deployment/build-executor.js';

function snapshot(buildStrategy) {
  return {
    buildStrategy,
    runtimeType: 'NEXTJS',
    buildConfiguration: {
      applicationRoot: '.',
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      outputDirectory: '.next',
      applicationPort: 3000,
      healthCheckPath: '/',
    },
  };
}

describe('resolveBuildStrategy', () => {
  it('marks Next server modes as streaming runtimes', () => {
    for (const strategy of ['next_standard_v1', 'next_standalone_v1']) {
      const spec = resolveBuildStrategy({
        snapshot: snapshot(strategy),
        templateVersion: 'legacy',
      });
      assert.deepEqual(spec.runtime, { appPort: 3000, static: false, streaming: true });
    }
  });

  it('maps export mode to the unprivileged static port', () => {
    const spec = resolveBuildStrategy({
      snapshot: snapshot('next_export_v1'),
      templateVersion: 'legacy',
    });
    assert.deepEqual(spec.runtime, { appPort: 8080, static: true, streaming: false });
  });

  it('rejects a Next strategy paired with a non-Next runtime', () => {
    assert.throws(
      () =>
        resolveBuildStrategy({
          snapshot: { ...snapshot('next_standard_v1'), runtimeType: 'NODEJS' },
          templateVersion: 'legacy',
        }),
      /requires the NEXTJS runtime/,
    );
  });
});

describe('BuildExecutor', () => {
  it('never falls back to a local build when remote execution fails', async () => {
    let localBuilds = 0;
    const executor = createBuildExecutor({
      mode: BuildExecutorMode.REMOTE_BUILDKIT,
      builderName: 'remote-builder',
      registryPrefix: 'ghcr.io/example/apps',
      deps: {
        buildAndPushDockerImage: async () => {
          throw new Error('remote unavailable');
        },
        buildDockerImage: async () => {
          localBuilds += 1;
        },
      },
    });
    await assert.rejects(
      executor.build({ registryTag: 'release-1', localImageTag: 'local-1' }),
      /remote unavailable/,
    );
    assert.equal(localBuilds, 0);
  });
});

// Rollback needs only the runtime spec; the interpreter versions that Dockerfile
// generation requires are read from the build context, which rollback never has.
describe('resolveRuntimeSpec', () => {
  const versioned = (buildStrategy, runtimeType, buildConfiguration = {}) => ({
    buildStrategy,
    runtimeType,
    buildConfiguration: { applicationRoot: '.', applicationPort: null, ...buildConfiguration },
  });

  it('resolves a Python release without its interpreter version', () => {
    assert.deepEqual(
      resolveRuntimeSpec(
        versioned('python_django_v1', 'PYTHON', { applicationModule: 'mysite.wsgi:application' }),
      ),
      { appPort: 8000, static: false, streaming: false },
    );
  });

  it('resolves a PHP release on its fixed port', () => {
    assert.equal(resolveRuntimeSpec(versioned('php_laravel_v1', 'PHP')).appPort, 8080);
  });

  it('resolves a Java release on its fixed port', () => {
    assert.equal(resolveRuntimeSpec(versioned('java_maven_v1', 'JAVA')).appPort, 8080);
  });

  it('matches the runtime spec of a full build resolution', () => {
    const snap = snapshot('next_standalone_v1');
    assert.deepEqual(
      resolveRuntimeSpec(snap),
      resolveBuildStrategy({ snapshot: snap, templateVersion: 'legacy' }).runtime,
    );
  });
});
