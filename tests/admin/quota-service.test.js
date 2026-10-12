import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { AuditEvent, Quota, ProjectMembership, User } from '@hellodeploy/database';
import { DeploymentStatus, QuotaScope, ProjectStatus } from '@hellodeploy/contracts';
import { configureAuditService } from '@hellodeploy/observability';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const {
  getQuotaConsumption,
  setQuotaOverride,
  getQuotaOverride,
  getQuotaPageData,
  getQuotaScopeName,
} = await import('../../apps/web/src/services/admin.service.js');

describe('admin.service — getQuotaConsumption', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('counts a user’s non-archived projects', async () => {
    const ownerId = objectId();
    await createProject({ ownerId });
    await createProject({ ownerId });
    await createProject({ ownerId, status: ProjectStatus.ARCHIVED });
    const usage = await getQuotaConsumption(QuotaScope.USER, ownerId);
    assert.equal(usage.ownedProjects, 2);
  });

  it('counts only HEALTHY deployments with live containers as running apps', async () => {
    const ownerId = objectId();
    const project = await createProject({ ownerId });
    await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'c-live',
    });
    await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.HEALTHY,
      activeContainerId: null,
    });
    await createDeployment(project._id, {
      sequenceNumber: 3,
      status: DeploymentStatus.FAILED,
      activeContainerId: 'c-dead',
    });
    const usage = await getQuotaConsumption(QuotaScope.USER, ownerId);
    assert.equal(usage.runningApps, 1);
  });

  it('counts project members for the PROJECT scope', async () => {
    const project = await createProject();
    await ProjectMembership.create({
      projectId: project._id,
      userId: objectId(),
      role: 'OWNER',
      acceptedAt: new Date(),
    });
    await ProjectMembership.create({
      projectId: project._id,
      userId: objectId(),
      role: 'MAINTAINER',
      acceptedAt: new Date(),
    });
    const usage = await getQuotaConsumption(QuotaScope.PROJECT, project._id);
    assert.equal(usage.projectMembers, 2);
  });

  it('returns an empty object for an unknown scope type', async () => {
    const usage = await getQuotaConsumption('PLANET', objectId());
    assert.deepEqual(usage, {});
  });
});

describe('admin.service — setQuotaOverride', () => {
  before(async () => {
    await startTestDb();
    configureAuditService(AuditEvent);
  });
  after(async () => {
    configureAuditService(null);
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function createUser() {
    return User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: `ada-${objectId()}@example.test`,
      passwordHash: 'hash',
    });
  }

  function adminContext() {
    return { adminId: objectId().toString(), adminRole: 'SUPER_ADMIN', reason: 'ticket 42' };
  }

  it('stores only fields allowed for the scope', async () => {
    const user = await createUser();
    await setQuotaOverride({
      ...adminContext(),
      scopeType: QuotaScope.USER,
      scopeId: user._id,
      limits: { maxOwnedProjects: 5, hackerField: 99 },
    });
    const stored = await Quota.findOne({ scopeType: QuotaScope.USER, scopeId: user._id }).lean();
    assert.equal(stored.hackerField, undefined);
  });

  it('ignores user-only limits on a project override', async () => {
    const project = await createProject();
    await setQuotaOverride({
      ...adminContext(),
      scopeType: QuotaScope.PROJECT,
      scopeId: project._id,
      limits: { maxOwnedProjects: 9, memoryMb: 512 },
    });
    const stored = await getQuotaOverride(QuotaScope.PROJECT, project._id);
    assert.equal(stored.maxOwnedProjects, null);
  });

  it('rejects negative quota values', async () => {
    const user = await createUser();
    const result = await setQuotaOverride({
      ...adminContext(),
      scopeType: QuotaScope.USER,
      scopeId: user._id,
      limits: { maxOwnedProjects: -1 },
    });
    assert.match(result.error, /Invalid quota value/);
  });

  it('rejects an invalid scope type', async () => {
    const result = await setQuotaOverride({
      ...adminContext(),
      scopeType: 'GALAXY',
      scopeId: objectId(),
      limits: { maxOwnedProjects: 2 },
    });
    assert.equal(result.success, false);
  });

  it('refuses an override for a user that does not exist', async () => {
    const result = await setQuotaOverride({
      ...adminContext(),
      scopeType: QuotaScope.USER,
      scopeId: objectId(),
      limits: { maxOwnedProjects: 2 },
    });
    assert.equal(result.success, false);
  });

  it('updates an existing override instead of duplicating it', async () => {
    const user = await createUser();
    const base = { ...adminContext(), scopeType: QuotaScope.USER, scopeId: user._id };
    await setQuotaOverride({ ...base, limits: { maxOwnedProjects: 2 } });
    await setQuotaOverride({ ...base, limits: { maxOwnedProjects: 4 } });
    const all = await Quota.find({ scopeType: QuotaScope.USER, scopeId: user._id }).lean();
    assert.deepEqual(
      all.map((quota) => quota.maxOwnedProjects),
      [4],
    );
  });

  it('removes a cleared field so the limit falls back to its default', async () => {
    const user = await createUser();
    const base = { ...adminContext(), scopeType: QuotaScope.USER, scopeId: user._id };
    await setQuotaOverride({ ...base, limits: { maxOwnedProjects: 2, memoryMb: 512 } });
    await setQuotaOverride({ ...base, limits: { memoryMb: 512 }, cleared: ['maxOwnedProjects'] });
    const stored = await getQuotaOverride(QuotaScope.USER, user._id);
    assert.equal(stored.maxOwnedProjects, undefined);
  });

  it('deletes the override document once every field is cleared', async () => {
    const user = await createUser();
    const base = { ...adminContext(), scopeType: QuotaScope.USER, scopeId: user._id };
    await setQuotaOverride({ ...base, limits: { maxOwnedProjects: 2 } });
    await setQuotaOverride({ ...base, limits: {}, cleared: ['maxOwnedProjects'] });
    assert.equal(await getQuotaOverride(QuotaScope.USER, user._id), null);
  });

  it('keeps the original creator when a different admin updates the override', async () => {
    const user = await createUser();
    const firstAdminId = objectId().toString();
    const base = { ...adminContext(), scopeType: QuotaScope.USER, scopeId: user._id };
    await setQuotaOverride({ ...base, adminId: firstAdminId, limits: { maxOwnedProjects: 2 } });
    await setQuotaOverride({ ...base, limits: { maxOwnedProjects: 3 } });
    const stored = await getQuotaOverride(QuotaScope.USER, user._id);
    assert.equal(stored.createdBy.toString(), firstAdminId);
  });

  it('audits each changed limit with its previous and new value', async () => {
    const user = await createUser();
    const base = { ...adminContext(), scopeType: QuotaScope.USER, scopeId: user._id };
    await setQuotaOverride({ ...base, limits: { maxOwnedProjects: 2 } });
    await setQuotaOverride({ ...base, limits: { maxOwnedProjects: 4 } });
    const event = await AuditEvent.findOne({ action: 'admin.quota_updated' })
      .sort({ _id: -1 })
      .lean();
    assert.deepEqual(event.metadata.changes, { maxOwnedProjects: { from: 2, to: 4 } });
  });
});

describe('admin.service — getQuotaPageData', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('resolves a project limit through the owner override', async () => {
    const ownerId = objectId();
    const project = await createProject({ ownerId });
    await Quota.create({ scopeType: QuotaScope.USER, scopeId: ownerId, memoryMb: 1024 });
    const page = await getQuotaPageData(QuotaScope.PROJECT, project._id);
    assert.equal(page.effective.memoryMb, 1024);
  });

  it('lets a project override win over the owner override', async () => {
    const ownerId = objectId();
    const project = await createProject({ ownerId });
    await Quota.create({ scopeType: QuotaScope.USER, scopeId: ownerId, memoryMb: 1024 });
    await Quota.create({ scopeType: QuotaScope.PROJECT, scopeId: project._id, memoryMb: 512 });
    const page = await getQuotaPageData(QuotaScope.PROJECT, project._id);
    assert.equal(page.effective.memoryMb, 512);
  });

  it('lines usage up against the matching limit key', async () => {
    const ownerId = objectId();
    await User.create({
      _id: ownerId,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      passwordHash: 'hash',
    });
    await createProject({ ownerId });
    const page = await getQuotaPageData(QuotaScope.USER, ownerId);
    assert.equal(page.usage.maxOwnedProjects, 1);
  });

  it('returns null for a project that does not exist', async () => {
    assert.equal(await getQuotaPageData(QuotaScope.PROJECT, objectId()), null);
  });

  it('returns null for a scope type with no editable limits', async () => {
    assert.equal(await getQuotaPageData(QuotaScope.PLAN, objectId()), null);
  });
});

describe('admin.service — getQuotaScopeName', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('resolves a USER scope to the owner’s name and email', async () => {
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      passwordHash: 'hash',
    });
    const name = await getQuotaScopeName(QuotaScope.USER, user._id);
    assert.equal(name, 'Ada Lovelace (ada@example.test)');
  });

  it('resolves a PROJECT scope to the project’s name and slug', async () => {
    const project = await createProject({ name: 'My App', slug: 'my-app' });
    const name = await getQuotaScopeName(QuotaScope.PROJECT, project._id);
    assert.equal(name, 'My App (my-app)');
  });

  it('falls back to the email for an account created without a name', async () => {
    // Legacy accounts predate the required-name validation, so bypass it.
    const { insertedId } = await User.collection.insertOne({
      email: 'nameless@example.test',
      passwordHash: 'hash',
    });
    const user = { _id: insertedId };
    const name = await getQuotaScopeName(QuotaScope.USER, user._id);
    assert.equal(name, 'nameless@example.test');
  });

  it('returns null when the scoped record no longer exists', async () => {
    const name = await getQuotaScopeName(QuotaScope.USER, objectId());
    assert.equal(name, null);
  });

  it('returns null for a scope type it does not resolve', async () => {
    const name = await getQuotaScopeName(QuotaScope.PLAN, objectId());
    assert.equal(name, null);
  });
});
