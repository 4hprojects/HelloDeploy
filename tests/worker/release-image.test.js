import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { ownsReleaseImage, pullReleaseImage } =
  await import('../../apps/worker/src/deployment/release-image.js');

const IMAGE = `docker.io/library/nginx@sha256:${'f'.repeat(64)}`;

function recordingPull() {
  const calls = [];
  return {
    calls,
    pullAndVerifyImage: async (imageRef, _deps, options) => {
      calls.push({ imageRef, options });
      return { imageId: 'sha256:image' };
    },
  };
}

describe('pullReleaseImage', () => {
  it('pulls platform-template images without the owner policy', async () => {
    const pull = recordingPull();
    await pullReleaseImage(IMAGE, { buildStrategy: 'python_flask_v1', projectId: 'p1' }, pull);
    assert.equal(pull.calls[0].options, undefined);
  });

  it('applies the owner policy to an image built from an owner Dockerfile', async () => {
    const pull = recordingPull();
    await pullReleaseImage(IMAGE, { buildStrategy: 'dockerfile_v1', projectId: 'p1' }, pull);
    assert.equal(pull.calls[0].options.policy.requireNonRootUser, true);
  });

  it('pulls a prebuilt image with the project registry credential', async () => {
    const pull = recordingPull();
    const credentialRequests = [];
    await pullReleaseImage(
      IMAGE,
      { buildStrategy: 'oci_image_v1', projectId: 'p1' },
      {
        ...pull,
        loadRegistryCredential: async (projectId, registry) => {
          credentialRequests.push([projectId, registry]);
          return { username: 'owner', token: 'value' };
        },
        withDockerConfig: async (_registry, _credential, fn) => fn('/tmp/hd-auth'),
      },
    );
    assert.deepEqual(
      [credentialRequests, pull.calls[0].options.dockerConfigDir],
      [[['p1', 'docker.io']], '/tmp/hd-auth'],
    );
  });
});

describe('ownsReleaseImage', () => {
  it('treats only prebuilt owner images as not ours to remove', () => {
    assert.deepEqual(['legacy_generated', 'dockerfile_v1', 'oci_image_v1'].map(ownsReleaseImage), [
      true,
      true,
      false,
    ]);
  });
});
