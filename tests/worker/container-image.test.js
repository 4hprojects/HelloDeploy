import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
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
