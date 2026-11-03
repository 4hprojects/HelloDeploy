import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

process.env.GITHUB_APP_ID ??= '12345';
process.env.GITHUB_APP_NAME ??= 'test-app';
process.env.HELLODEPLOY_MASTER_KEY ??= Buffer.alloc(32, 4).toString('base64');

const { User, Project } = await import('@hellodeploy/database');
const { DeploymentStatus, JobType, ProjectStatus, UserStatus } =
  await import('@hellodeploy/contracts');
const { startTestDb, stopTestDb, clearTestDb, objectId } = await import('../helpers/worker-db.js');
const { createProject, createDeployment } = await import('../helpers/worker-fixtures.js');
const { suspendUser, adminSuspendProjectWithStop, adminReactivateProject } =
  await import('../../apps/web/src/services/admin.service.js');
const {
  createDeployment: startDeployment,
  retryDeployment,
  rollbackDeployment,
} = await import('../../apps/web/src/services/deployment.service.js');

const OWNER_REFUSAL = "The project owner's account is suspended, so deployments are paused.";
const asAdmin = { adminId: objectId().toString(), adminRole: 'SUPER_ADMIN' };

function recordingQueue() {
  const jobs = [];
  return {
    jobs,
    deps: {
      getDeploymentQueue: () => ({}),
      enqueueJob: async (_queue, jobType, payload, opts) => {
        jobs.push({ jobType, projectId: payload.projectId, jobId: opts.jobId });
      },
    },
  };
}

function createOwner(overrides = {}) {
  return User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: `ada-${objectId()}@example.test`,
    passwordHash: 'hash',
    status: UserStatus.ACTIVE,
    ...overrides,
  });
}

async function createLiveProject(ownerId) {
  const project = await createProject({ ownerId });
  const live = await createDeployment(project._id, { status: DeploymentStatus.HEALTHY });
  await project.updateOne({ $set: { activeDeploymentId: live._id } });
  return project;
}

describe('user suspension enforcement', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('queues a stop for every owned project with a live app', async () => {
    const owner = await createOwner();
    const projects = [await createLiveProject(owner._id), await createLiveProject(owner._id)];
    const { jobs, deps } = recordingQueue();

    await suspendUser({ userId: owner._id, ...asAdmin }, deps);

    assert.deepEqual(
      jobs.map((job) => [job.jobType, job.projectId]).sort(),
      projects.map((project) => [JobType.STOP_PROJECT, project._id.toString()]).sort(),
    );
  });

  it('does not queue a stop for an owned project with nothing live', async () => {
    const owner = await createOwner();
    await createProject({ ownerId: owner._id });
    const { jobs, deps } = recordingQueue();

    await suspendUser({ userId: owner._id, ...asAdmin }, deps);

    assert.deepEqual(jobs, []);
  });

  it('reports the apps it could not stop when the queue is down', async () => {
    const owner = await createOwner();
    await createLiveProject(owner._id);

    const result = await suspendUser(
      { userId: owner._id, ...asAdmin },
      { getDeploymentQueue: () => null },
    );

    assert.deepEqual([result.success, result.unstoppedApps], [true, 1]);
  });

  it('keeps the account suspended when the queue is down', async () => {
    const owner = await createOwner();
    await createLiveProject(owner._id);

    await suspendUser({ userId: owner._id, ...asAdmin }, { getDeploymentQueue: () => null });

    assert.equal((await User.findById(owner._id).lean()).status, UserStatus.SUSPENDED);
  });

  it('refuses a new deployment for a suspended owner', async () => {
    const owner = await createOwner({ status: UserStatus.SUSPENDED });
    const project = await createProject({ ownerId: owner._id });

    const result = await startDeployment({ projectId: project._id, actorId: owner._id });

    assert.equal(result.error, OWNER_REFUSAL);
  });

  it('refuses a retry on a suspended project', async () => {
    const project = await createProject({ status: ProjectStatus.SUSPENDED });
    const failed = await createDeployment(project._id, { status: DeploymentStatus.FAILED });

    const result = await retryDeployment(failed._id, project._id, objectId());

    assert.equal(result.error, 'Project must be approved and active before deployment.');
  });

  it('refuses a rollback for a suspended owner', async () => {
    const owner = await createOwner({ status: UserStatus.SUSPENDED });
    const project = await createProject({ ownerId: owner._id });
    const release = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-release',
    });

    const result = await rollbackDeployment(project._id, release._id, owner._id);

    assert.equal(result.error, OWNER_REFUSAL);
  });
});

describe('project suspension stop', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('leaves the project active when the queue is down', async () => {
    const project = await createProject();

    await adminSuspendProjectWithStop(
      { projectId: project._id, ...asAdmin },
      { getDeploymentQueue: () => null },
    );

    assert.equal((await Project.findById(project._id).lean()).status, ProjectStatus.ACTIVE);
  });

  it('leaves the project active when queueing the stop fails', async () => {
    const project = await createProject();

    await adminSuspendProjectWithStop(
      { projectId: project._id, ...asAdmin },
      {
        getDeploymentQueue: () => ({}),
        enqueueJob: async () => {
          throw new Error('Redis connection refused');
        },
      },
    );

    assert.equal((await Project.findById(project._id).lean()).status, ProjectStatus.ACTIVE);
  });

  it('queues a fresh stop when a project is suspended a second time', async (t) => {
    const project = await createProject();
    const { jobs, deps } = recordingQueue();
    t.mock.timers.enable({ apis: ['Date'], now: 1_000 });
    await adminSuspendProjectWithStop({ projectId: project._id, ...asAdmin }, deps);
    await adminReactivateProject({ projectId: project._id, ...asAdmin });
    t.mock.timers.tick(1_000);

    await adminSuspendProjectWithStop({ projectId: project._id, ...asAdmin }, deps);

    assert.notEqual(jobs[0].jobId, jobs[1].jobId);
  });
});
