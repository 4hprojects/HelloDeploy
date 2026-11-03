import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Project } from '@hellodeploy/database';
import { DeploymentStatus, JobType, ProjectStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { archiveProject } = await import('../../apps/web/src/services/project.service.js');

function recordingQueue() {
  const jobs = [];
  return {
    jobs,
    deps: {
      getDeploymentQueue: () => ({}),
      enqueueJob: async (_queue, jobType, payload) => {
        jobs.push([jobType, payload.projectId]);
      },
    },
  };
}

async function createLiveProject() {
  const project = await createProject();
  const live = await createDeployment(project._id, { status: DeploymentStatus.HEALTHY });
  await project.updateOne({ $set: { activeDeploymentId: live._id } });
  return project;
}

async function projectStatus(project) {
  return (await Project.findById(project._id).lean()).status;
}

describe('archiving a project', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('queues a stop for the live app', async () => {
    const project = await createLiveProject();
    const { jobs, deps } = recordingQueue();

    await archiveProject({ projectId: project._id, actorId: objectId() }, deps);

    assert.deepEqual(jobs, [[JobType.STOP_PROJECT, project._id.toString()]]);
  });

  it('archives a project with nothing live without a queue', async () => {
    const project = await createProject();

    await archiveProject(
      { projectId: project._id, actorId: objectId() },
      { getDeploymentQueue: () => null },
    );

    assert.equal(await projectStatus(project), ProjectStatus.ARCHIVED);
  });

  it('leaves a live project active when the queue is down', async () => {
    const project = await createLiveProject();

    await archiveProject(
      { projectId: project._id, actorId: objectId() },
      { getDeploymentQueue: () => null },
    );

    assert.equal(await projectStatus(project), ProjectStatus.ACTIVE);
  });

  it('leaves a live project active when queueing the stop fails', async () => {
    const project = await createLiveProject();

    await archiveProject(
      { projectId: project._id, actorId: objectId() },
      {
        getDeploymentQueue: () => ({}),
        enqueueJob: async () => {
          throw new Error('Redis connection refused');
        },
      },
    );

    assert.equal(await projectStatus(project), ProjectStatus.ACTIVE);
  });
});
