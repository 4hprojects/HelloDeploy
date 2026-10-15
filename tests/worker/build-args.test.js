import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createDockerBuildArgs,
  createRemoteDockerBuildArgs,
  ensureBuildBuilder,
  verifyRemoteBuildBuilder,
} from '../../apps/worker/src/deployment/build.js';

const baseOptions = {
  contextDir: '/builds/abc',
  imageTag: 'hellodeploy-demo-1',
  buildMemoryMb: 1024,
};

describe('createDockerBuildArgs — default builder', () => {
  it('keeps the established docker build argument vector', () => {
    assert.deepEqual(createDockerBuildArgs(baseOptions), [
      'build',
      '--tag',
      'hellodeploy-demo-1',
      '--file',
      '/builds/abc/Dockerfile',
      '--label',
      'hellodeploy.image=true',
      '--label',
      'hellodeploy.tag=hellodeploy-demo-1',
      '--memory',
      '1024m',
      '--network',
      'default',
      '/builds/abc',
    ]);
  });

  it('pairs each public build argument with its flag', () => {
    const args = createDockerBuildArgs({
      ...baseOptions,
      buildArgs: { VITE_API_URL: 'https://x' },
    });
    assert.equal(args[args.indexOf('--build-arg') + 1], 'VITE_API_URL=https://x');
  });

  it('appends --no-cache only when requested', () => {
    assert.equal(createDockerBuildArgs({ ...baseOptions, noCache: true }).at(-2), '--no-cache');
  });
});

describe('createDockerBuildArgs — dedicated builder', () => {
  const args = createDockerBuildArgs({ ...baseOptions, builderName: 'hellodeploy-builder' });

  it('routes the build to the named builder and loads the result locally', () => {
    assert.deepEqual(args.slice(0, 5), [
      'buildx',
      'build',
      '--builder',
      'hellodeploy-builder',
      '--load',
    ]);
  });

  it('omits the per-build memory flag that BuildKit ignores', () => {
    assert.equal(args.includes('--memory'), false);
  });
});

describe('createRemoteDockerBuildArgs', () => {
  it('pushes through the named builder and records immutable metadata', () => {
    const args = createRemoteDockerBuildArgs({
      contextDir: '/builds/abc',
      imageRef: 'ghcr.io/acme/hellodeploy:demo-1',
      builderName: 'remote-builder',
      metadataFile: '/tmp/build-metadata.json',
      buildArgs: { NEXT_PUBLIC_ORIGIN: 'https://example.test' },
    });
    assert.deepEqual(args.slice(0, 5), [
      'buildx',
      'build',
      '--builder',
      'remote-builder',
      '--push',
    ]);
    assert.ok(args.includes('--provenance=true'));
    assert.ok(args.includes('--sbom=true'));
    assert.equal(args[args.indexOf('--metadata-file') + 1], '/tmp/build-metadata.json');
    assert.equal(args[args.indexOf('--tag') + 1], 'ghcr.io/acme/hellodeploy:demo-1');
    assert.equal(args.includes('--load'), false);
  });
});

describe('ensureBuildBuilder', () => {
  it('leaves an existing builder untouched', async () => {
    const commands = [];
    const result = await ensureBuildBuilder(
      { name: 'hellodeploy-builder', memoryMb: 1024 },
      { run: async (args) => (commands.push(args), { code: 0, stderr: '' }) },
    );
    assert.deepEqual(
      { result, commands },
      {
        result: { created: false },
        commands: [['buildx', 'inspect', 'hellodeploy-builder']],
      },
    );
  });

  it('creates a missing builder with memory and swap capped at the limit', async () => {
    const commands = [];
    await ensureBuildBuilder(
      { name: 'hellodeploy-builder', memoryMb: 1024 },
      {
        run: async (args) => {
          commands.push(args);
          return { code: args[1] === 'inspect' ? 1 : 0, stderr: '' };
        },
      },
    );
    assert.deepEqual(commands[1], [
      'buildx',
      'create',
      '--name',
      'hellodeploy-builder',
      '--driver',
      'docker-container',
      '--driver-opt',
      'memory=1024m',
      '--driver-opt',
      'memory-swap=1024m',
      '--bootstrap',
    ]);
  });

  it('reports why a builder could not be created', async () => {
    await assert.rejects(
      ensureBuildBuilder(
        { name: 'hellodeploy-builder', memoryMb: 1024 },
        { run: async () => ({ code: 1, stderr: 'invalid driver option memory\n' }) },
      ),
      /Could not create build builder hellodeploy-builder: invalid driver option memory/,
    );
  });
});

describe('verifyRemoteBuildBuilder', () => {
  it('bootstraps only the configured remote builder', async () => {
    const commands = [];
    assert.deepEqual(
      await verifyRemoteBuildBuilder('remote-builder', {
        run: async (args) => (commands.push(args), { code: 0, stderr: '' }),
      }),
      { ready: true },
    );
    assert.deepEqual(commands, [['buildx', 'inspect', 'remote-builder', '--bootstrap']]);
  });

  it('does not create a local fallback when the remote builder is unavailable', async () => {
    const commands = [];
    await assert.rejects(
      verifyRemoteBuildBuilder('remote-builder', {
        run: async (args) => (commands.push(args), { code: 1, stderr: 'TLS handshake failed' }),
      }),
      /TLS handshake failed/,
    );
    assert.equal(commands.length, 1);
  });
});
