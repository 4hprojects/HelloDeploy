import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { User, mongoose } from '@hellodeploy/database';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const {
  suspendUser,
  reactivateUser,
  changeUserRole,
  forceSignOutUser,
  unlockUser,
  markEmailVerified,
  sendUserPasswordReset,
  getUserDetail,
} = await import('../../apps/web/src/services/admin.service.js');

let emailCounter = 0;

function createUser(overrides = {}) {
  return User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: `user-${++emailCounter}@example.test`,
    passwordHash: 'hash',
    status: UserStatus.ACTIVE,
    emailVerifiedAt: new Date(),
    ...overrides,
  });
}

async function insertSession(userId) {
  await mongoose.connection.db.collection('sessions').insertOne({
    _id: `sid-${userId}`,
    session: JSON.stringify({ user: { id: userId.toString() } }),
    expires: new Date(Date.now() + 86_400_000),
  });
}

function countSessions(userId) {
  return mongoose.connection.db.collection('sessions').countDocuments({ _id: `sid-${userId}` });
}

const asSuperAdmin = () => ({
  adminId: objectId().toString(),
  adminRole: PlatformRole.SUPER_ADMIN,
});
const asAdmin = () => ({ adminId: objectId().toString(), adminRole: PlatformRole.ADMIN });

describe('admin user management', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  describe('who may be managed', () => {
    it('refuses an admin suspending another admin', async () => {
      const target = await createUser({ platformRole: PlatformRole.ADMIN });

      const result = await suspendUser({ userId: target._id, ...asAdmin() });

      assert.equal(result.error, 'Only a Super Admin can manage administrator accounts.');
    });

    it('lets a super admin suspend an admin', async () => {
      const target = await createUser({ platformRole: PlatformRole.ADMIN });

      const result = await suspendUser({ userId: target._id, ...asSuperAdmin() });

      assert.equal(result.success, true);
    });

    it('refuses an admin acting on their own account', async () => {
      const self = await createUser({ platformRole: PlatformRole.ADMIN });

      const result = await forceSignOutUser({
        userId: self._id,
        adminId: self._id.toString(),
        adminRole: PlatformRole.ADMIN,
      });

      assert.equal(result.error, 'You cannot perform this action on your own account.');
    });

    it('refuses suspending a super admin, even by another super admin', async () => {
      const target = await createUser({ platformRole: PlatformRole.SUPER_ADMIN });

      const result = await suspendUser({ userId: target._id, ...asSuperAdmin() });

      assert.equal(
        result.error,
        'Super Admin accounts must be demoted before they can be managed.',
      );
    });
  });

  describe('suspension', () => {
    it('suspends an account still pending verification', async () => {
      const target = await createUser({
        status: UserStatus.PENDING_VERIFICATION,
        emailVerifiedAt: null,
      });

      await suspendUser({ userId: target._id, ...asAdmin() });

      const stored = await User.findById(target._id).lean();
      assert.equal(stored.status, UserStatus.SUSPENDED);
    });

    it('returns an unverified account to pending on reactivation', async () => {
      const target = await createUser({ status: UserStatus.SUSPENDED, emailVerifiedAt: null });

      await reactivateUser({ userId: target._id, ...asAdmin() });

      const stored = await User.findById(target._id).lean();
      assert.equal(stored.status, UserStatus.PENDING_VERIFICATION);
    });

    it('returns a verified account to active on reactivation', async () => {
      const target = await createUser({ status: UserStatus.SUSPENDED });

      await reactivateUser({ userId: target._id, ...asAdmin() });

      const stored = await User.findById(target._id).lean();
      assert.equal(stored.status, UserStatus.ACTIVE);
    });
  });

  describe('role changes', () => {
    it('promotes a user to admin', async () => {
      const target = await createUser();

      await changeUserRole({ userId: target._id, newRole: PlatformRole.ADMIN, ...asSuperAdmin() });

      const stored = await User.findById(target._id).lean();
      assert.equal(stored.platformRole, PlatformRole.ADMIN);
    });

    it('lets a super admin demote another super admin', async () => {
      const target = await createUser({ platformRole: PlatformRole.SUPER_ADMIN });

      await changeUserRole({ userId: target._id, newRole: PlatformRole.USER, ...asSuperAdmin() });

      const stored = await User.findById(target._id).lean();
      assert.equal(stored.platformRole, PlatformRole.USER);
    });

    it('refuses a super admin changing their own role', async () => {
      const self = await createUser({ platformRole: PlatformRole.SUPER_ADMIN });

      const result = await changeUserRole({
        userId: self._id,
        newRole: PlatformRole.USER,
        adminId: self._id.toString(),
        adminRole: PlatformRole.SUPER_ADMIN,
      });

      assert.equal(result.error, 'You cannot perform this action on your own account.');
    });

    it('refuses a role change by an admin', async () => {
      const target = await createUser();

      const result = await changeUserRole({
        userId: target._id,
        newRole: PlatformRole.ADMIN,
        ...asAdmin(),
      });

      assert.equal(result.error, 'Only a Super Admin can change platform roles.');
    });

    it('refuses a role outside the allowlist', async () => {
      const target = await createUser();

      const result = await changeUserRole({
        userId: target._id,
        newRole: 'ROOT',
        ...asSuperAdmin(),
      });

      assert.equal(result.error, 'Invalid role.');
    });

    it('signs the user out so the new role applies at once', async () => {
      const target = await createUser({ platformRole: PlatformRole.ADMIN });
      await insertSession(target._id);

      await changeUserRole({ userId: target._id, newRole: PlatformRole.USER, ...asSuperAdmin() });

      assert.equal(await countSessions(target._id), 0);
    });
  });

  describe('recovery tools', () => {
    it('force sign-out ends the stored session', async () => {
      const target = await createUser();
      await insertSession(target._id);

      await forceSignOutUser({ userId: target._id, ...asAdmin() });

      assert.equal(await countSessions(target._id), 0);
    });

    it('unlock clears the lockout', async () => {
      const target = await createUser({
        failedLoginAttempts: 10,
        lockedUntil: new Date(Date.now() + 3_600_000),
      });

      await unlockUser({ userId: target._id, ...asAdmin() });

      const stored = await User.findById(target._id).lean();
      assert.equal(stored.lockedUntil, null);
    });

    it('mark verified activates a pending account', async () => {
      const target = await createUser({
        status: UserStatus.PENDING_VERIFICATION,
        emailVerifiedAt: null,
      });

      await markEmailVerified({ userId: target._id, ...asAdmin() });

      const stored = await User.findById(target._id).lean();
      assert.equal(stored.status, UserStatus.ACTIVE);
    });

    it('refuses a password reset for a Google-only account', async () => {
      const target = await createUser({ passwordHash: null, googleSubject: 'google-sub-1' });

      const result = await sendUserPasswordReset({ userId: target._id, ...asAdmin() });

      assert.equal(result.error, 'This account signs in with Google and has no password.');
    });

    it("sends the password reset to the user's email", async () => {
      const target = await createUser();
      const sent = [];

      await sendUserPasswordReset(
        { userId: target._id, ...asAdmin() },
        { initiatePasswordReset: async ({ email }) => sent.push(email) },
      );

      assert.deepEqual(sent, [target.email]);
    });
  });

  describe('detail view', () => {
    it('reports whether the account has a password without exposing the hash', async () => {
      const target = await createUser();

      const detail = await getUserDetail(target._id);

      assert.deepEqual([detail.hasPassword, 'passwordHash' in detail.user], [true, false]);
    });
  });
});
