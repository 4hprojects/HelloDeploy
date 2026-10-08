import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { User, Project, ProjectMembership, AuditEvent } from '@hellodeploy/database';
import { PlatformRole, ProjectRole, UserStatus, AuditOutcome } from '@hellodeploy/contracts';
import { configureAuditService } from '@hellodeploy/observability';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

const { deleteUserPermanently } = await import('../../apps/web/src/services/admin.service.js');

const EMAIL = 'doomed@example.test';

function createTarget(overrides = {}) {
  return User.create({
    firstName: 'Doomed',
    lastName: 'User',
    email: EMAIL,
    passwordHash: 'hash',
    status: UserStatus.ACTIVE,
    ...overrides,
  });
}

function createQueueDeps() {
  const jobs = [];
  return {
    jobs,
    deps: {
      getDeploymentQueue: () => ({}),
      enqueueJob: async (_queue, type, payload) => jobs.push({ type, payload }),
    },
  };
}

const offlineQueue = { getDeploymentQueue: () => null };

function deleteAsSuperAdmin(userId, confirmEmail, deps) {
  return deleteUserPermanently(
    {
      userId,
      confirmEmail,
      adminId: objectId().toString(),
      adminRole: PlatformRole.SUPER_ADMIN,
    },
    deps,
  );
}

describe('permanent user deletion', () => {
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

  it('deletes the user record', async () => {
    const target = await createTarget();

    await deleteAsSuperAdmin(target._id, EMAIL, createQueueDeps().deps);

    assert.equal(await User.exists({ _id: target._id }), null);
  });

  it('accepts the confirmation email in any case', async () => {
    const target = await createTarget();

    const result = await deleteAsSuperAdmin(
      target._id,
      ' Doomed@Example.TEST ',
      createQueueDeps().deps,
    );

    assert.equal(result.success, true);
  });

  it('keeps the user when the confirmation email does not match', async () => {
    const target = await createTarget();

    await deleteAsSuperAdmin(target._id, 'someone-else@example.test', createQueueDeps().deps);

    assert.notEqual(await User.exists({ _id: target._id }), null);
  });

  it('refuses an admin who is not a super admin', async () => {
    const target = await createTarget();

    const result = await deleteUserPermanently({
      userId: target._id,
      confirmEmail: EMAIL,
      adminId: objectId().toString(),
      adminRole: PlatformRole.ADMIN,
    });

    assert.equal(result.error, 'Only a Super Admin can delete accounts.');
  });

  it('leaves a project owner untouched while the worker queue is offline', async () => {
    const target = await createTarget();
    await createProject({ ownerId: target._id });

    await deleteAsSuperAdmin(target._id, EMAIL, offlineQueue);

    const stored = await User.findById(target._id).lean();
    assert.equal(stored.status, UserStatus.ACTIVE);
  });

  it('deletes a user without projects even while the worker queue is offline', async () => {
    const target = await createTarget();

    const result = await deleteAsSuperAdmin(target._id, EMAIL, offlineQueue);

    assert.equal(result.success, true);
  });

  it('deletes the projects the user owns', async () => {
    const target = await createTarget();
    const project = await createProject({ ownerId: target._id });

    await deleteAsSuperAdmin(target._id, EMAIL, createQueueDeps().deps);

    assert.equal(await Project.exists({ _id: project._id }), null);
  });

  it('schedules infrastructure teardown for each owned project', async () => {
    const target = await createTarget();
    const project = await createProject({ ownerId: target._id });
    const { jobs, deps } = createQueueDeps();

    await deleteAsSuperAdmin(target._id, EMAIL, deps);

    assert.deepEqual(
      jobs.map((job) => job.payload.projectId),
      [project._id.toString()],
    );
  });

  it("keeps other people's projects but removes the user's membership", async () => {
    const target = await createTarget();
    const project = await createProject();
    await ProjectMembership.create({
      projectId: project._id,
      userId: target._id,
      role: ProjectRole.MAINTAINER,
    });

    await deleteAsSuperAdmin(target._id, EMAIL, createQueueDeps().deps);

    assert.deepEqual(
      [
        Boolean(await Project.exists({ _id: project._id })),
        await ProjectMembership.countDocuments({ userId: target._id }),
      ],
      [true, 0],
    );
  });

  it("keeps the user's earlier audit history", async () => {
    const target = await createTarget();
    await AuditEvent.create({
      action: 'auth.signed_in',
      outcome: AuditOutcome.SUCCESS,
      actorId: target._id,
    });

    await deleteAsSuperAdmin(target._id, EMAIL, createQueueDeps().deps);

    assert.equal(await AuditEvent.countDocuments({ action: 'auth.signed_in' }), 1);
  });

  it('records who was deleted in the audit log', async () => {
    const target = await createTarget();

    await deleteAsSuperAdmin(target._id, EMAIL, createQueueDeps().deps);

    const event = await AuditEvent.findOne({ action: 'admin.user_deleted' }).lean();
    assert.equal(event.metadata.email, EMAIL);
  });
});
