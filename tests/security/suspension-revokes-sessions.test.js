import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { User, mongoose } from '@hellodeploy/database';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';

const { suspendUser } = await import('../../apps/web/src/services/admin.service.js');

/**
 * requireAuth reads status from the session's own copy of the user, not the
 * record, and the cookie is rolling — so unless suspension also drops the
 * stored sessions, a suspended user keeps full access for as long as they keep
 * browsing.
 */
describe('suspending a user ends their signed-in sessions', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function activeUserWithSession() {
    const user = await User.create({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      passwordHash: 'x',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });

    await mongoose.connection.db.collection('sessions').insertOne({
      _id: 'sid-under-test',
      session: JSON.stringify({ user: { id: user._id.toString(), email: user.email } }),
      expires: new Date(Date.now() + 86_400_000),
    });

    return user;
  }

  it("removes the suspended user's stored session", async () => {
    const user = await activeUserWithSession();

    await suspendUser({
      userId: user._id,
      adminId: user._id.toString(),
      adminRole: PlatformRole.SUPER_ADMIN,
      reason: 'abuse',
    });

    const remaining = await mongoose.connection.db
      .collection('sessions')
      .countDocuments({ _id: 'sid-under-test' });
    assert.equal(remaining, 0);
  });

  it("leaves another user's session untouched", async () => {
    const user = await activeUserWithSession();
    const bystander = await User.create({
      firstName: 'Alan',
      lastName: 'Turing',
      email: 'alan@example.com',
      passwordHash: 'x',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
    await mongoose.connection.db.collection('sessions').insertOne({
      _id: 'sid-bystander',
      session: JSON.stringify({ user: { id: bystander._id.toString() } }),
      expires: new Date(Date.now() + 86_400_000),
    });

    await suspendUser({
      userId: user._id,
      adminId: user._id.toString(),
      adminRole: PlatformRole.SUPER_ADMIN,
      reason: 'abuse',
    });

    const remaining = await mongoose.connection.db
      .collection('sessions')
      .countDocuments({ _id: 'sid-bystander' });
    assert.equal(remaining, 1);
  });
});
