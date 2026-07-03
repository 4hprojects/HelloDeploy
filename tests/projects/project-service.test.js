import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Project, ProjectMembership, Quota } from '@hellodeploy/database';
import { ProjectStatus, ProjectRole, QuotaScope } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { createProject, getUserProjects, updateProject } =
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

  it('deduplicates slugs when two projects share a name', async () => {
    const { project: first } = await createProject({ name: 'Same Name', ownerId: objectId() });
    const { project: second } = await createProject({ name: 'Same Name', ownerId: objectId() });
    assert.equal(first.slug, 'same-name');
    assert.notEqual(second.slug, first.slug);
    assert.match(second.slug, /^same-name-/);
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

describe('project.service — getUserProjects', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('returns only projects the user is a member of', async () => {
    const userId = objectId();
    await createProject({ name: 'Mine', ownerId: userId });
    await createProject({ name: 'Not Mine', ownerId: objectId() });
    const projects = await getUserProjects(userId);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].project.name, 'Mine');
  });

  it('includes the membership role with each project', async () => {
    const userId = objectId();
    await createProject({ name: 'Mine', ownerId: userId });
    const projects = await getUserProjects(userId);
    assert.equal(projects[0].role, ProjectRole.OWNER);
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
