import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import {
  Domain,
  Notification,
  Project,
  ProjectInvitation,
  ProjectMembership,
  ProductEvent,
  ProjectTeardown,
  Quota,
  Repository,
} from '@hellodeploy/database';
import {
  DomainStatus,
  ProjectStatus,
  ProjectRole,
  ProjectTeardownStatus,
  QuotaScope,
} from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { createProject, deleteProject, updateProject } =
  await import('../../apps/web/src/services/project.service.js');

describe('project.service — createProject', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('creates a DRAFT project with a slug derived from the name', async () => {
    const ownerId = objectId();
    const result = await createProject({ name: 'My Cool App', ownerId });
    assert.equal(result.success, true);
    assert.equal(result.project.status, ProjectStatus.DRAFT);
    assert.equal(result.project.slug, 'my-cool-app');
  });

  it('grants the creator an OWNER membership', async () => {
    const ownerId = objectId();
    const { project } = await createProject({ name: 'Owned App', ownerId });
    const membership = await ProjectMembership.findOne({
      projectId: project._id,
      userId: ownerId,
    }).lean();
    assert.equal(membership.role, ProjectRole.OWNER);
  });

  it('rejects a duplicate immutable project slug', async () => {
    const { project: first } = await createProject({ name: 'Same Name', ownerId: objectId() });
    const second = await createProject({ name: 'Same Name', ownerId: objectId() });
    assert.equal(first.slug, 'same-name');
    assert.equal(second.success, false);
    assert.match(second.error, /already in use/i);
  });

  it('rejects creation beyond the owned-project quota (plan default: 1)', async () => {
    const ownerId = objectId();
    await createProject({ name: 'First', ownerId });
    const result = await createProject({ name: 'Second', ownerId });
    assert.equal(result.success, false);
    assert.match(result.error, /project limit/i);
  });

  it('honors a raised per-user quota override', async () => {
    const ownerId = objectId();
    await Quota.create({ scopeType: QuotaScope.USER, scopeId: ownerId, maxOwnedProjects: 2 });
    await createProject({ name: 'First', ownerId });
    const result = await createProject({ name: 'Second', ownerId });
    assert.equal(result.success, true);
  });
});

describe('project.service — updateProject', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('renames the project without changing its slug', async () => {
    const ownerId = objectId();
    const { project } = await createProject({ name: 'Before', ownerId });
    const result = await updateProject({
      projectId: project._id,
      name: 'After',
      actorId: ownerId,
    });
    assert.equal(result.success, true);
    const fresh = await Project.findById(project._id).lean();
    assert.equal(fresh.name, 'After');
    assert.equal(fresh.slug, 'before');
  });
});

describe('project.service — deleteProject', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('removes the project quota override with the project', async () => {
    const ownerId = objectId();
    const { project } = await createProject({ name: 'Doomed App', ownerId });
    await Quota.create({ scopeType: QuotaScope.PROJECT, scopeId: project._id, memoryMb: 512 });
    await deleteProject(
      { projectId: project._id, actorId: ownerId },
      { getDeploymentQueue: () => ({}), enqueueJob: async () => {} },
    );
    assert.equal(await Quota.countDocuments({ scopeId: project._id }), 0);
  });

  it('records a pending teardown that the job points at', async () => {
    const { project, ownerId } = await createDoomedProject();
    const { jobs, deps } = recordingDeps();

    await deleteProject({ projectId: project._id, actorId: ownerId }, deps);

    const teardown = await ProjectTeardown.findById(jobs[0].teardownId).lean();
    assert.equal(teardown.status, ProjectTeardownStatus.PENDING);
  });

  it('leaves no teardown record when the job cannot be queued', async () => {
    const { project, ownerId } = await createDoomedProject();

    await deleteProject(
      { projectId: project._id, actorId: ownerId },
      {
        getDeploymentQueue: () => ({}),
        enqueueJob: async () => {
          throw new Error('Redis connection refused');
        },
      },
    );

    assert.equal(await ProjectTeardown.countDocuments({ projectId: project._id }), 0);
  });

  it('hands every unremoved custom domain to the teardown job', async () => {
    const { project, ownerId } = await createDoomedProject();
    await addDomain(project, 'live.example.test', { status: DomainStatus.ACTIVE });
    await addDomain(project, 'gone.example.test', { status: DomainStatus.REMOVED });
    const { jobs, deps } = recordingDeps();

    await deleteProject({ projectId: project._id, actorId: ownerId }, deps);

    assert.deepEqual(jobs[0].customDomainHostnames, ['live.example.test']);
  });

  it('releases the Cloudflare hostname before dropping the domain', async () => {
    const { project, ownerId } = await createDoomedProject();
    await addDomain(project, 'live.example.test', { cfCustomHostnameId: 'cf-hostname-1' });
    const { released, deps } = recordingDeps();

    await deleteProject({ projectId: project._id, actorId: ownerId }, deps);

    assert.deepEqual(released, ['cf-hostname-1']);
  });

  it('still deletes the project when Cloudflare refuses the release', async () => {
    const { project, ownerId } = await createDoomedProject();
    await addDomain(project, 'live.example.test', { cfCustomHostnameId: 'cf-hostname-1' });
    const { deps } = recordingDeps({ isReleaseOk: false });

    await deleteProject({ projectId: project._id, actorId: ownerId }, deps);

    assert.equal(await Project.countDocuments({ _id: project._id }), 0);
  });

  it('removes the repository, invitation and notification records', async () => {
    const { project, ownerId } = await createDoomedProject();
    await Promise.all(
      [Repository, ProjectInvitation, Notification].map((model) =>
        model.collection.insertOne({ projectId: project._id }),
      ),
    );
    const { deps } = recordingDeps();

    await deleteProject({ projectId: project._id, actorId: ownerId }, deps);

    const remaining = await Promise.all(
      [Repository, ProjectInvitation, Notification].map((model) =>
        model.countDocuments({ projectId: project._id }),
      ),
    );
    assert.deepEqual(remaining, [0, 0, 0]);
  });

  it('keeps product events but unlinks them from the deleted project', async () => {
    const { project, ownerId } = await createDoomedProject();
    const { insertedId } = await ProductEvent.collection.insertOne({
      name: 'project_created',
      projectId: project._id,
    });
    const { deps } = recordingDeps();

    await deleteProject({ projectId: project._id, actorId: ownerId }, deps);

    assert.equal((await ProductEvent.findById(insertedId).lean()).projectId, null);
  });
});

async function createDoomedProject() {
  const ownerId = objectId();
  const { project } = await createProject({ name: 'Doomed App', ownerId });
  return { project, ownerId };
}

function addDomain(project, hostname, overrides = {}) {
  return Domain.create({
    projectId: project._id,
    hostnameNormalized: hostname,
    addedBy: project.ownerId,
    status: DomainStatus.ACTIVE,
    ...overrides,
  });
}

function recordingDeps({ isReleaseOk = true } = {}) {
  const jobs = [];
  const released = [];
  return {
    jobs,
    released,
    deps: {
      getDeploymentQueue: () => ({}),
      enqueueJob: async (_queue, _jobType, payload) => void jobs.push(payload),
      customHostnames: {
        remove: async (id) => {
          released.push(id);
          return { ok: isReleaseOk };
        },
      },
    },
  };
}
