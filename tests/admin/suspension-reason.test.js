import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { User, Project } from '@hellodeploy/database';
import { JobType, UserStatus, ProjectStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

const { suspendUser, reactivateUser, adminSuspendProjectWithStop, adminReactivateProject } =
  await import('../../apps/web/src/services/admin.service.js');

const noQueue = { getDeploymentQueue: () => null };

async function createUser(overrides = {}) {
  return User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: `ada-${objectId()}@example.test`,
    passwordHash: 'hash',
    ...overrides,
  });
}

describe('admin suspension reason', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('records the reason when suspending a user', async () => {
    const user = await createUser();

    await suspendUser({
      userId: user._id,
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
      reason: 'Abusive behavior reported by another user',
    });

    const fresh = await User.findById(user._id).lean();
    assert.equal(fresh.suspensionReason, 'Abusive behavior reported by another user');
  });

  it('leaves the reason null when none is given', async () => {
    const user = await createUser();

    await suspendUser({
      userId: user._id,
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
    });

    const fresh = await User.findById(user._id).lean();
    assert.equal(fresh.suspensionReason, null);
  });

  it('clears the reason when a user is reactivated', async () => {
    const user = await createUser({ status: UserStatus.SUSPENDED, suspensionReason: 'Old reason' });

    await reactivateUser({
      userId: user._id,
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
    });

    const fresh = await User.findById(user._id).lean();
    assert.equal(fresh.suspensionReason, null);
  });

  it('records the reason when suspending a project', async () => {
    const project = await createProject();

    await adminSuspendProjectWithStop(
      {
        projectId: project._id,
        adminId: objectId().toString(),
        adminRole: 'SUPER_ADMIN',
        reason: 'Terms of service violation',
      },
      noQueue,
    );

    const fresh = await Project.findById(project._id).lean();
    assert.equal(fresh.suspensionReason, 'Terms of service violation');
  });

  it('enqueues the stop job through the injected queue boundary', async () => {
    const project = await createProject();
    const queue = {};
    let enqueueCall;

    await adminSuspendProjectWithStop(
      {
        projectId: project._id,
        adminId: objectId().toString(),
        adminRole: 'SUPER_ADMIN',
        correlationId: 'test-correlation',
      },
      {
        getDeploymentQueue: () => queue,
        enqueueJob: async (...args) => {
          enqueueCall = args;
        },
      },
    );

    assert.equal(enqueueCall[0], queue);
    assert.equal(enqueueCall[1], JobType.STOP_PROJECT);
    assert.equal(enqueueCall[2].projectId, project._id.toString());
  });

  it('clears the project reason when reactivated', async () => {
    const project = await createProject({
      status: ProjectStatus.SUSPENDED,
      suspensionReason: 'Old reason',
    });

    await adminReactivateProject({
      projectId: project._id,
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
    });

    const fresh = await Project.findById(project._id).lean();
    assert.equal(fresh.suspensionReason, null);
  });
});
