import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  createDockerBuildArgs,
  createRemoteDockerBuildArgs,
  createOrasPushArgs,
  ensureBuildBuilder,
  readLayoutChildDigests,
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
  const args = createRemoteDockerBuildArgs({
    contextDir: '/builds/abc',
    imageRef: 'ghcr.io/acme/hellodeploy:demo-1',
    builderName: 'remote-builder',
    metadataFile: '/tmp/build-metadata.json',
    layoutDir: '/tmp/build-layout',
    buildArgs: { NEXT_PUBLIC_ORIGIN: 'https://example.test' },
  });

  it('builds through the named builder with provenance and an SBOM', () => {
    assert.deepEqual(
      [args.slice(0, 4), args.includes('--provenance=true'), args.includes('--sbom=true')],
      [['buildx', 'build', '--builder', 'remote-builder'], true, true],
    );
  });

  // The builder never pushes: a killed build then leaves nothing in the
  // registry, and the push needs no credential on the builder.
  it('exports an OCI layout to the worker instead of pushing', () => {
    assert.deepEqual(
      [args.includes('--push'), args[args.indexOf('--output') + 1]],
      [false, 'type=oci,dest=/tmp/build-layout,tar=false'],
    );
  });

  it('records immutable metadata for the built image', () => {
    assert.equal(args[args.indexOf('--metadata-file') + 1], '/tmp/build-metadata.json');
  });
});

describe('createOrasPushArgs', () => {
  it('copies exactly the built digest from the layout to the registry tag', () => {
    assert.deepEqual(
      createOrasPushArgs({
        layoutDir: '/tmp/build-layout',
        imageDigest: `sha256:${'a'.repeat(64)}`,
        imageRef: 'ghcr.io/acme/hellodeploy:demo-1',
      }),
      [
        'cp',
        '--from-oci-layout',
        `/tmp/build-layout@sha256:${'a'.repeat(64)}`,
        'ghcr.io/acme/hellodeploy:demo-1',
      ],
    );
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

describe('readLayoutChildDigests', () => {
  // GHCR keeps the platform image and each attestation as its own package version.
  it('lists the manifests the exported image index names', async () => {
    const layoutDir = await mkdtemp(join(tmpdir(), 'hellodeploy-layout-'));
    const indexDigest = `sha256:${'a'.repeat(64)}`;
    const children = [`sha256:${'b'.repeat(64)}`, `sha256:${'c'.repeat(64)}`];
    await mkdir(join(layoutDir, 'blobs', 'sha256'), { recursive: true });
    await writeFile(
      join(layoutDir, 'blobs', 'sha256', 'a'.repeat(64)),
      JSON.stringify({ manifests: children.map((digest) => ({ digest })) }),
    );
    assert.deepEqual(await readLayoutChildDigests(layoutDir, indexDigest), children);
  });
});
