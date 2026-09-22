import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { User } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';

// Claim the provider key before the service loads: apps/web's config imports
// dotenv, so a real key would otherwise reach this suite.
process.env.RESEND_API_KEY = '';

const { registerUser } = await import('../../apps/web/src/services/auth.service.js');

function registration(email) {
  return {
    firstName: 'Sam',
    lastName: 'Rivera',
    email,
    password: 'Passw0rdTest',
    sourceIp: '127.0.0.1',
    correlationId: 'test',
  };
}

describe('registerUser email delivery', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('reports whether the verification email was sent', async () => {
    const result = await registerUser(registration('new@example.test'));
    assert.equal(typeof result.verificationEmailSent, 'boolean');
  });

  it('still creates the account when delivery is skipped', async () => {
    await registerUser(registration('new@example.test'));
    const user = await User.findOne({ email: 'new@example.test' }).lean();
    assert.ok(user);
  });

  // The regression this guards: sendVerificationEmail used to be awaited
  // unguarded, so a provider error propagated out of an already-committed
  // registration and surfaced as a generic 500.
  const failingSender = {
    sendVerificationEmail: async () => {
      throw new Error('Email delivery failed: domain not verified');
    },
  };

  it('does not throw when the email provider rejects', async () => {
    await assert.doesNotReject(() =>
      registerUser({ ...registration('resilient@example.test'), deps: failingSender }),
    );
  });

  it('reports the delivery failure to the caller', async () => {
    const result = await registerUser({
      ...registration('resilient@example.test'),
      deps: failingSender,
    });
    assert.equal(result.verificationEmailSent, false);
  });

  it('keeps the account so the person can use resend rather than re-register', async () => {
    await registerUser({ ...registration('resilient@example.test'), deps: failingSender });
    const user = await User.findOne({ email: 'resilient@example.test' }).lean();
    assert.ok(user);
  });

  it('keeps returning null for a duplicate address', async () => {
    await registerUser(registration('dupe@example.test'));
    const second = await registerUser(registration('dupe@example.test'));
    assert.equal(second, null);
  });
});
