import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { AuditOutcome, PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { User } from '@hellodeploy/database';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';

const { initiatePasswordReset } = await import('../../apps/web/src/services/auth.service.js');

async function createPasswordUser(overrides = {}) {
  return User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.test',
    passwordHash: 'stored-password-hash',
    platformRole: PlatformRole.USER,
    status: UserStatus.ACTIVE,
    ...overrides,
  });
}

describe('password reset initiation', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('stores an expiring hash and records success only after provider acceptance', async () => {
    const user = await createPasswordUser();
    const auditEvents = [];
    let emailInput;

    await initiatePasswordReset(
      {
        email: user.email,
        sourceIp: '203.0.113.10',
        correlationId: 'reset-correlation',
      },
      {
        sendResetEmail: async (input) => {
          emailInput = input;
          return { status: 'accepted', providerMessageId: 'email-message-id' };
        },
        writeAudit: async (event) => auditEvents.push(event),
      },
    );

    const fresh = await User.findById(user._id).select('+passwordResetTokenHash').lean();
    const submittedHash = createHash('sha256').update(emailInput.resetCode).digest('hex');
    assert.equal(fresh.passwordResetTokenHash, submittedHash);
    assert.ok(fresh.passwordResetExpiresAt > new Date());
    assert.equal(emailInput.correlationId, 'reset-correlation');
    assert.equal(auditEvents.length, 1);
    assert.equal(auditEvents[0].outcome, AuditOutcome.SUCCESS);
  });

  it('keeps unknown, inactive, and Google-only accounts externally indistinguishable', async () => {
    await createPasswordUser({ email: 'inactive@example.test', status: UserStatus.SUSPENDED });
    await User.create({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'google@example.test',
      googleSubject: 'google-subject',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
    let emailCalls = 0;
    const dependencies = {
      sendResetEmail: async () => {
        emailCalls += 1;
        return { status: 'accepted', providerMessageId: 'unused' };
      },
      writeAudit: async () => {},
    };

    for (const email of ['unknown@example.test', 'inactive@example.test', 'google@example.test']) {
      assert.equal(await initiatePasswordReset({ email }, dependencies), undefined);
    }
    assert.equal(emailCalls, 0);
  });

  it('records skipped and rejected delivery internally without throwing', async () => {
    const user = await createPasswordUser();
    const auditEvents = [];
    const baseInput = {
      email: user.email,
      sourceIp: '203.0.113.10',
      correlationId: 'reset-correlation',
    };

    await initiatePasswordReset(baseInput, {
      sendResetEmail: async () => ({ status: 'skipped', providerMessageId: null }),
      writeAudit: async (event) => auditEvents.push(event),
    });
    await initiatePasswordReset(baseInput, {
      sendResetEmail: async () => {
        throw new Error('provider unavailable');
      },
      writeAudit: async (event) => auditEvents.push(event),
    });

    assert.deepEqual(
      auditEvents.map(({ outcome, metadata }) => ({ outcome, metadata })),
      [
        { outcome: AuditOutcome.FAILURE, metadata: { deliveryStatus: 'skipped' } },
        { outcome: AuditOutcome.FAILURE, metadata: { deliveryStatus: 'failed' } },
      ],
    );
  });
});
