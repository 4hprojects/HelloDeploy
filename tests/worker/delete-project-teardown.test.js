import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

process.env.NGINX_ENABLED = 'true';

const { ProjectTeardown } = await import('@hellodeploy/database');
const { ProjectTeardownStatus } = await import('@hellodeploy/contracts');
const { startTestDb, stopTestDb, clearTestDb, objectId } = await import('../helpers/worker-db.js');
const { handleDeleteProject } = await import('../../apps/worker/src/jobs/delete-project.job.js');
const { isMissingDockerObject } = await import('../../apps/worker/src/deployment/container.js');

const INVENTORY = {
  containerIds: ['container-a'],
  imageTags: ['image-a'],
  registryImageRefs: [],
  subdomain: 'my-project',
  customDomainHostnames: [],
};

function recordingDeps({ isRouteBroken = false } = {}) {
  const calls = { containers: [], routes: [] };
  return {
    calls,
    deps: {
      stopAndRemoveContainer: async (id) => void calls.containers.push(id),
      removeDockerImage: async () => true,
      deleteRegistryManifest: async () => {},
      removeNetwork: async () => true,
      removeRoute: async (route) => {
        calls.routes.push(route.slug);
        if (isRouteBroken) {
          throw new Error('nginx -t failed');
        }
      },
    },
  };
}

async function createTeardown(overrides = {}) {
  return ProjectTeardown.create({
    projectId: objectId(),
    projectSlug: 'my-project',
    remaining: INVENTORY,
    ...overrides,
  });
}

function jobFor(teardown, { attemptsMade = 0, attempts = 3 } = {}) {
  return {
    attemptsMade,
    opts: { attempts },
    data: {
      version: 2,
      projectId: teardown.projectId.toString(),
      projectSlug: 'my-project',
      teardownId: teardown._id.toString(),
      ...INVENTORY,
    },
  };
}

async function reload(teardown) {
  return ProjectTeardown.findById(teardown._id).lean();
}

describe('delete-project teardown record', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('keeps only the failed route for the next attempt', async () => {
    const teardown = await createTeardown();
    const { deps } = recordingDeps({ isRouteBroken: true });

    await assert.rejects(handleDeleteProject(jobFor(teardown), deps));

    assert.deepEqual((await reload(teardown)).remaining, {
      containerIds: [],
      imageTags: [],
      registryImageRefs: [],
      subdomain: 'my-project',
      customDomainHostnames: [],
    });
  });

  it('leaves the record pending while attempts remain', async () => {
    const teardown = await createTeardown();
    const { deps } = recordingDeps({ isRouteBroken: true });

    await assert.rejects(handleDeleteProject(jobFor(teardown), deps));

    assert.equal((await reload(teardown)).status, ProjectTeardownStatus.PENDING);
  });

  it('marks the record failed on the final attempt', async () => {
    const teardown = await createTeardown();
    const { deps } = recordingDeps({ isRouteBroken: true });

    await assert.rejects(handleDeleteProject(jobFor(teardown, { attemptsMade: 2 }), deps));

    assert.equal((await reload(teardown)).status, ProjectTeardownStatus.FAILED);
  });

  it('marks the record done when everything is removed', async () => {
    const teardown = await createTeardown();
    const { deps } = recordingDeps();

    await handleDeleteProject(jobFor(teardown), deps);

    assert.equal((await reload(teardown)).status, ProjectTeardownStatus.DONE);
  });

  it('redoes only what the record still lists', async () => {
    const teardown = await createTeardown({
      remaining: { ...INVENTORY, containerIds: [], imageTags: [] },
    });
    const { calls, deps } = recordingDeps();

    await handleDeleteProject(jobFor(teardown), deps);

    assert.deepEqual(calls.containers, []);
  });

  it('skips a teardown that already finished', async () => {
    const teardown = await createTeardown({ status: ProjectTeardownStatus.DONE });
    const { calls, deps } = recordingDeps();

    await handleDeleteProject(jobFor(teardown), deps);

    assert.deepEqual(calls.routes, []);
  });
});

describe('isMissingDockerObject', () => {
  it('treats docker errors for already-removed objects as removed', () => {
    assert.deepEqual(
      [
        'docker rm failed (exit 1): Error response from daemon: No such container: abc',
        'Error response from daemon: No such image: hellodeploy/app:1',
        'docker network failed (exit 1): Error response from daemon: network hellodeploy-x not found',
      ].map(isMissingDockerObject),
      [true, true, true],
    );
  });

  it('does not treat other docker errors as removed', () => {
    assert.equal(
      isMissingDockerObject('Error response from daemon: conflict: unable to remove repository'),
      false,
    );
  });
});
