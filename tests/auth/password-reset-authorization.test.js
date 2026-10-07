import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { User } from '@hellodeploy/database';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { hashToken, verifyPassword } from '@hellodeploy/auth';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';

const { initiatePasswordReset, verifyPasswordResetCode, completePasswordReset } =
  await import('../../apps/web/src/services/auth.service.js');

describe('password reset authorization', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('uses a short-lived single-use nonce to complete the reset', async () => {
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada-reset@example.test',
      passwordHash: 'legacy-hash',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
    let code;
    await initiatePasswordReset(
      { email: user.email, correlationId: 'reset-auth' },
      {
        sendResetEmail: async (input) => {
          code = input.resetCode;
          return { status: 'accepted' };
        },
        writeAudit: async () => {},
      },
    );
    const verified = await verifyPasswordResetCode({ email: user.email, code });
    assert.equal(verified.success, true);
    assert.ok(verified.expiresAt <= Date.now() + 15 * 60 * 1000);

    const completed = await completePasswordReset(
      {
        userId: verified.userId,
        resetNonce: verified.resetNonce,
        newPassword: 'NewPassword1',
        correlationId: 'reset-auth',
      },
      { queueNotification: async () => Promise.reject(new Error('queue unavailable')) },
    );
    assert.equal(completed.success, true);
    const fresh = await User.findById(user._id).select('+passwordHash').lean();
    assert.equal(await verifyPassword(fresh.passwordHash, 'NewPassword1'), true);

    const replay = await completePasswordReset({
      userId: verified.userId,
      resetNonce: verified.resetNonce,
      newPassword: 'AnotherPassword1',
    });
    assert.equal(replay.success, false);
  });

  it('rejects an expired reset authorization without changing the password', async () => {
    const user = await User.create({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'expired-reset@example.test',
      passwordHash: 'legacy-hash',
      passwordResetSessionNonceHash: hashToken('expired-nonce'),
      passwordResetSessionExpiresAt: new Date(Date.now() - 1_000),
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
    const result = await completePasswordReset({
      userId: user._id,
      resetNonce: 'expired-nonce',
      newPassword: 'NewPassword1',
    });
    assert.equal(result.success, false);
    assert.equal(
      (await User.findById(user._id).select('+passwordHash').lean()).passwordHash,
      'legacy-hash',
    );
  });
});
