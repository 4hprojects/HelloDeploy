import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Project, ProjectMembership, Quota } from '@hellodeploy/database';
import { ProjectStatus, ProjectRole, QuotaScope } from '@hellodeploy/contracts';
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
});
