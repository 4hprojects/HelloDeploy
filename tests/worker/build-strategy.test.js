import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveBuildStrategy } from '../../apps/worker/src/deployment/build-strategy.js';
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
