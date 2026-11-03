import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { ProjectTeardown } from '@hellodeploy/database';
import { JobType, ProjectTeardownStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { retryProjectTeardown, getFailedTeardowns } =
  await import('../../apps/web/src/services/admin.service.js');

const asAdmin = { adminId: objectId().toString(), adminRole: 'ADMIN' };

function createFailedTeardown(overrides = {}) {
  return ProjectTeardown.create({
    projectId: objectId(),
    projectSlug: 'gone-app',
    status: ProjectTeardownStatus.FAILED,
    failures: ['route:gone-app'],
    remaining: { subdomain: 'gone-app', containerIds: [], imageTags: [] },
    ...overrides,
  });
}

function recordingQueue() {
  const jobs = [];
  return {
    jobs,
    deps: {
      getDeploymentQueue: () => ({}),
      enqueueJob: async (_queue, jobType, payload) => void jobs.push({ jobType, payload }),
    },
  };
}

async function teardownStatus(teardown) {
  return (await ProjectTeardown.findById(teardown._id).lean()).status;
}

describe('retrying a failed project teardown', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('queues a delete job for only what is left', async () => {
    const teardown = await createFailedTeardown();
    const { jobs, deps } = recordingQueue();

    await retryProjectTeardown({ teardownId: teardown._id.toString(), ...asAdmin }, deps);

    assert.deepEqual(
      [jobs[0].jobType, jobs[0].payload.subdomain, jobs[0].payload.containerIds],
      [JobType.DELETE_PROJECT, 'gone-app', []],
    );
  });

  it('moves the record back to pending', async () => {
    const teardown = await createFailedTeardown();
    const { deps } = recordingQueue();

    await retryProjectTeardown({ teardownId: teardown._id.toString(), ...asAdmin }, deps);

    assert.equal(await teardownStatus(teardown), ProjectTeardownStatus.PENDING);
  });

  it('refuses a teardown that is not waiting for a retry', async () => {
    const teardown = await createFailedTeardown({ status: ProjectTeardownStatus.PENDING });
    const { deps } = recordingQueue();

    const result = await retryProjectTeardown(
      { teardownId: teardown._id.toString(), ...asAdmin },
      deps,
    );

    assert.equal(result.error, 'This cleanup is no longer waiting for a retry.');
  });

  it('puts the record back to failed when the job cannot be queued', async () => {
    const teardown = await createFailedTeardown();

    await retryProjectTeardown(
      { teardownId: teardown._id.toString(), ...asAdmin },
      {
        getDeploymentQueue: () => ({}),
        enqueueJob: async () => {
          throw new Error('Redis connection refused');
        },
      },
    );

    assert.equal(await teardownStatus(teardown), ProjectTeardownStatus.FAILED);
  });

  it('lists only failed teardowns', async () => {
    const failed = await createFailedTeardown();
    await createFailedTeardown({ status: ProjectTeardownStatus.DONE });

    const listed = await getFailedTeardowns();

    assert.deepEqual(
      listed.map((teardown) => teardown._id.toString()),
      [failed._id.toString()],
    );
  });
});
