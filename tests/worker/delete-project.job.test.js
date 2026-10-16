import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.NGINX_ENABLED = 'true';
// Project deletion removes registry manifests only in the platform's own repository.
process.env.USER_IMAGE_REGISTRY = 'ghcr.io/example/apps';

const { handleDeleteProject } = await import('../../apps/worker/src/jobs/delete-project.job.js');

function setup(data = {}) {
  const calls = { containers: [], images: [], registryImages: [], networks: [], routes: [] };
  const deps = {
    stopAndRemoveContainer: async (value) => void calls.containers.push(value),
    removeDockerImage: async (value) => void calls.images.push(value),
    deleteRegistryManifest: async (value) => void calls.registryImages.push(value),
    removeNetwork: async (value) => void calls.networks.push(value),
    removeRoute: async (value) => calls.routes.push(value),
  };
  const job = {
    data: {
      version: 2,
      projectId: 'project-id',
      projectSlug: 'my-project',
      subdomain: 'my-project',
      containerIds: ['container-a', 'container-b', 'container-a'],
      imageTags: ['image-a', 'image-b', 'image-a'],
      registryImageRefs: [
        `ghcr.io/example/apps:one@sha256:${'a'.repeat(64)}`,
        `ghcr.io/example/apps:one@sha256:${'a'.repeat(64)}`,
      ],
      ...data,
    },
  };
  return { calls, deps, job };
}

describe('delete-project job', () => {
  it('removes every unique container, image, project network, and route', async () => {
    const { calls, deps, job } = setup();
    await handleDeleteProject(job, deps);

    assert.deepEqual(calls.containers, ['container-a', 'container-b']);
    assert.deepEqual(calls.images, ['image-a', 'image-b']);
    assert.equal(calls.registryImages.length, 1);
    assert.deepEqual(calls.networks, ['hellodeploy-my-project']);
    assert.equal(calls.routes.length, 1);
    assert.equal(calls.routes[0].slug, 'my-project');
  });

  it('supports queued version-1 payloads during rollout', async () => {
    const { calls, deps, job } = setup({
      version: 1,
      projectSlug: undefined,
      containerIds: undefined,
      imageTags: undefined,
      registryImageRefs: undefined,
      activeContainerId: 'legacy-container',
    });
    await handleDeleteProject(job, deps);
    assert.deepEqual(calls.containers, ['legacy-container']);
    assert.deepEqual(calls.images, []);
    assert.deepEqual(calls.registryImages, []);
    assert.deepEqual(calls.networks, []);
  });

  it('continues teardown before failing the job so BullMQ retries cleanup', async () => {
    const { calls, deps, job } = setup();
    deps.stopAndRemoveContainer = async (value) => {
      calls.containers.push(value);
      if (value === 'container-a') {
        throw new Error('docker unavailable');
      }
    };
    await assert.rejects(() => handleDeleteProject(job, deps), /container:container-a/);
    assert.deepEqual(calls.containers, ['container-a', 'container-b']);
    assert.deepEqual(calls.images, ['image-a', 'image-b']);
    assert.deepEqual(calls.networks, ['hellodeploy-my-project']);
  });

  it('leaves an owner-supplied registry image in place', async () => {
    const { calls, deps, job } = setup({
      registryImageRefs: [`ghcr.io/owner/their-app@sha256:${'b'.repeat(64)}`],
    });
    await handleDeleteProject(job, deps);
    assert.deepEqual(calls.registryImages, []);
  });
});
