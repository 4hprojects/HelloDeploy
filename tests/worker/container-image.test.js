import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ImagePolicyError,
  assertCompatibleImagePlatform,
  pullAndVerifyImage,
} from '../../apps/worker/src/deployment/container.js';

const digestRef = `ghcr.io/example/app@sha256:${'a'.repeat(64)}`;

describe('runtime image platform validation', () => {
  it('accepts a Linux image matching the canonical runtime architecture', () => {
    assert.equal(
      assertCompatibleImagePlatform({ Os: 'linux', Architecture: 'amd64' }, 'x86_64'),
      'amd64',
    );
    assert.equal(
      assertCompatibleImagePlatform({ Os: 'linux', Architecture: 'arm64' }, 'aarch64'),
      'arm64',
    );
  });

  it('rejects unsupported operating systems and architecture mismatches', () => {
    assert.throws(
      () => assertCompatibleImagePlatform({ Os: 'windows', Architecture: 'amd64' }, 'amd64'),
      /operating system/,
    );
    assert.throws(
      () => assertCompatibleImagePlatform({ Os: 'linux', Architecture: 'arm64' }, 'amd64'),
      /runtime Docker requires amd64/,
    );
  });

  it('pulls by digest and verifies the runtime Docker daemon architecture', async () => {
    const calls = [];
    const result = await pullAndVerifyImage(digestRef, {
      runDocker: async (args) => {
        calls.push(args);
        if (args[0] === 'pull') {
          return '';
        }
        if (args[0] === 'image') {
          return JSON.stringify({ Id: 'sha256:image', Os: 'linux', Architecture: 'amd64' });
        }
        return JSON.stringify('x86_64');
      },
    });
    assert.deepEqual(result, { imageId: 'sha256:image', architecture: 'amd64' });
    assert.deepEqual(calls.at(-1), ['info', '--format', '{{json .Architecture}}']);
  });

  it('rejects a mismatched pulled image before returning it for container start', async () => {
    await assert.rejects(
      pullAndVerifyImage(digestRef, {
        runDocker: async (args) => {
          if (args[0] === 'pull') {
            return '';
          }
          if (args[0] === 'image') {
            return JSON.stringify({ Id: 'sha256:image', Os: 'linux', Architecture: 'arm64' });
          }
          return JSON.stringify('amd64');
        },
      }),
      /Unsupported image architecture/,
    );
  });
});

describe('owner image policy at pull time', () => {
  const policy = { requireNonRootUser: true, rejectVolumes: true, maxImageBytes: 1000 };

  function dockerReturning(config, { size = 10, calls = [] } = {}) {
    return async (args, options) => {
      calls.push({ args, options });
      if (args[0] === 'pull') {
        return '';
      }
      if (args[0] === 'image') {
        return JSON.stringify({
          Id: 'sha256:image',
          Os: 'linux',
          Architecture: 'amd64',
          Size: size,
          Config: config,
        });
      }
      return JSON.stringify('amd64');
    };
  }

  it('accepts a non-root image without volumes inside the size limit', async () => {
    const result = await pullAndVerifyImage(
      digestRef,
      { runDocker: dockerReturning({ User: '10001' }) },
      { policy },
    );
    assert.equal(result.imageId, 'sha256:image');
  });

  it('rejects an image that runs as root', async () => {
    await assert.rejects(
      pullAndVerifyImage(digestRef, { runDocker: dockerReturning({ User: '' }) }, { policy }),
      (error) => error instanceof ImagePolicyError && /non-root/.test(error.message),
    );
  });

  it('rejects an image that declares volumes', async () => {
    await assert.rejects(
      pullAndVerifyImage(
        digestRef,
        { runDocker: dockerReturning({ User: '10001', Volumes: { '/var/lib/data': {} } }) },
        { policy },
      ),
      /\/var\/lib\/data/,
    );
  });

  it('rejects an image over the size limit', async () => {
    await assert.rejects(
      pullAndVerifyImage(
        digestRef,
        { runDocker: dockerReturning({ User: '10001' }, { size: 5000 }) },
        { policy },
      ),
      /larger than/,
    );
  });

  it('leaves platform-built images to the existing checks', async () => {
    const result = await pullAndVerifyImage(digestRef, {
      runDocker: dockerReturning({ User: '' }),
    });
    assert.equal(result.imageId, 'sha256:image');
  });

  it('pulls with a per-pull Docker config directory when one is given', async () => {
    const calls = [];
    await pullAndVerifyImage(
      digestRef,
      { runDocker: dockerReturning({ User: '10001' }, { calls }) },
      { policy, dockerConfigDir: '/tmp/hd-auth-1' },
    );
    assert.equal(calls[0].options.env.DOCKER_CONFIG, '/tmp/hd-auth-1');
  });

  it('removes an owner image that fails the policy instead of keeping it on disk', async () => {
    const calls = [];
    await assert.rejects(
      pullAndVerifyImage(
        digestRef,
        { runDocker: dockerReturning({ User: '' }, { calls }) },
        { policy },
      ),
    );
    assert.deepEqual(calls.at(-1).args, ['rmi', digestRef]);
  });
});
