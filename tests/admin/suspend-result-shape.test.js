import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { User } from '@hellodeploy/database';
import { ProjectStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

const { suspendUser, reactivateUser, adminSuspendProjectWithStop, adminReactivateProject } =
  await import('../../apps/web/src/services/admin.service.js');

const noQueue = { getDeploymentQueue: () => null };

// Flash messages need the acted-on record's name/email, not a generic
// "User suspended." — these tests lock in the return-value contract the
// controller relies on to build that message.
describe('admin suspend/reactivate result shape', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('returns the suspended user record', async () => {
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      passwordHash: 'hash',
    });

    const result = await suspendUser({
      userId: user._id,
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
    });

    assert.equal(result.user.firstName, 'Ada');
    assert.equal(result.user.lastName, 'Lovelace');
  });

  it('returns the reactivated user record', async () => {
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      passwordHash: 'hash',
      status: 'SUSPENDED',
    });

    const result = await reactivateUser({
      userId: user._id,
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
    });

    assert.equal(result.user.firstName, 'Ada');
  });

  it('returns the suspended project record', async () => {
    const project = await createProject({ name: 'My App' });

    const result = await adminSuspendProjectWithStop(
      {
        projectId: project._id,
        adminId: objectId().toString(),
        adminRole: 'SUPER_ADMIN',
      },
      noQueue,
    );

    assert.equal(result.project.name, 'My App');
  });

  it('returns the reactivated project record', async () => {
    const project = await createProject({ name: 'My App', status: ProjectStatus.SUSPENDED });

    const result = await adminReactivateProject({
      projectId: project._id,
      adminId: objectId().toString(),
      adminRole: 'SUPER_ADMIN',
    });

    assert.equal(result.project.name, 'My App');
  });
});
