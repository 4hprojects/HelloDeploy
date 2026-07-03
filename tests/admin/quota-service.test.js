import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Quota, ProjectMembership } from '@hellodeploy/database';
import { DeploymentStatus, QuotaScope, ProjectStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { getQuotaConsumption, setQuotaOverride, getQuotaOverride } =
  await import('../../apps/web/src/services/admin.service.js');

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
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('creates an override with only the allowed numeric fields', async () => {
    const userId = objectId();
    const result = await setQuotaOverride({
      scopeType: QuotaScope.USER,
      scopeId: userId,
      limits: { maxOwnedProjects: 5, hackerField: 99 },
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
      reason: 'test bump',
    });
    assert.equal(result.success, true);
    const stored = await Quota.findOne({ scopeType: QuotaScope.USER, scopeId: userId }).lean();
    assert.equal(stored.maxOwnedProjects, 5);
    assert.equal(stored.hackerField, undefined);
  });

  it('rejects negative quota values', async () => {
    const result = await setQuotaOverride({
      scopeType: QuotaScope.USER,
      scopeId: objectId(),
      limits: { maxOwnedProjects: -1 },
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
    });
    assert.equal(result.success, false);
    assert.match(result.error, /Invalid quota value/);
  });

  it('rejects an invalid scope type', async () => {
    const result = await setQuotaOverride({
      scopeType: 'GALAXY',
      scopeId: objectId(),
      limits: { maxOwnedProjects: 2 },
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
    });
    assert.equal(result.success, false);
  });

  it('updates an existing override instead of duplicating it', async () => {
    const userId = objectId();
    const base = {
      scopeType: QuotaScope.USER,
      scopeId: userId,
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
    };
    await setQuotaOverride({ ...base, limits: { maxOwnedProjects: 2 } });
    await setQuotaOverride({ ...base, limits: { maxOwnedProjects: 4 } });
    const all = await Quota.find({ scopeType: QuotaScope.USER, scopeId: userId }).lean();
    assert.equal(all.length, 1);
    assert.equal(all[0].maxOwnedProjects, 4);
    const fetched = await getQuotaOverride(QuotaScope.USER, userId);
    assert.equal(fetched.maxOwnedProjects, 4);
  });
});
