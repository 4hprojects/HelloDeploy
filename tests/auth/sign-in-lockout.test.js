import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { User } from '@hellodeploy/database';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { hashPassword } from '@hellodeploy/auth';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';

const { signIn } = await import('../../apps/web/src/services/auth.service.js');

const PASSWORD = 'correct-horse-battery-staple';
const MAX_ATTEMPTS = 10;

/**
 * The per-IP sign-in limiter cannot see a spray at one account spread across
 * many addresses. These are the properties the per-account throttle has to hold:
 * it must stop after a bounded number of wrong guesses, a correct password must
 * clear it, and it must never become a way to discover which addresses exist.
 */
describe('per-account sign-in throttling', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function activeUser() {
    return User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      passwordHash: await hashPassword(PASSWORD),
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    });
  }

  async function guessWrong(times) {
    for (let i = 0; i < times; i += 1) {
      await signIn({ email: 'ada@example.com', password: 'wrong', sourceIp: '203.0.113.7' });
    }
  }

  it('locks the account once the attempt limit is reached', async () => {
    await activeUser();

    await guessWrong(MAX_ATTEMPTS);

    const locked = await User.findOne({ email: 'ada@example.com' }).lean();
    assert.ok(locked.lockedUntil > new Date());
  });

  it('refuses the correct password while locked', async () => {
    await activeUser();
    await guessWrong(MAX_ATTEMPTS);

    const result = await signIn({ email: 'ada@example.com', password: PASSWORD });

    assert.equal(result.success, false);
  });

  it('still admits the correct password before the limit', async () => {
    await activeUser();
    await guessWrong(MAX_ATTEMPTS - 1);

    const result = await signIn({ email: 'ada@example.com', password: PASSWORD });

    assert.equal(result.success, true);
  });

  it('clears the failure count on a successful sign-in', async () => {
    await activeUser();
    await guessWrong(3);

    await signIn({ email: 'ada@example.com', password: PASSWORD });

    const after = await User.findOne({ email: 'ada@example.com' }).lean();
    assert.equal(after.failedLoginAttempts, 0);
  });

  it('answers a locked account exactly as it answers an unknown address', async () => {
    await activeUser();
    await guessWrong(MAX_ATTEMPTS);

    const locked = await signIn({ email: 'ada@example.com', password: PASSWORD });
    const unknown = await signIn({ email: 'nobody@example.com', password: PASSWORD });

    assert.equal(locked.error, unknown.error);
  });
});
