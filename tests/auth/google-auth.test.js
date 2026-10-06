import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { hashPassword } from '@hellodeploy/auth';
import { User } from '@hellodeploy/database';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';

const {
  completeGoogleAccount,
  createGoogleAuthorization,
  linkGoogleAccount,
  resolveGoogleIdentity,
  verifyGoogleReauthentication,
} = await import('../../apps/web/src/services/google-auth.service.js');
const { initiatePasswordReset } = await import('../../apps/web/src/services/auth.service.js');

const identity = {
  subject: 'google-subject-123',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
};

describe('Google account authentication', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('builds a state, nonce, and PKCE-bound authorization request', async () => {
    const { url, codeVerifier } = await createGoogleAuthorization({
      state: 'state-value',
      nonce: 'nonce-value',
      intent: 'sign-in',
    });
    const authorization = new URL(url);
    assert.equal(authorization.origin, 'https://accounts.google.com');
    assert.equal(authorization.searchParams.get('response_type'), 'code');
    assert.equal(authorization.searchParams.get('state'), 'state-value');
    assert.equal(authorization.searchParams.get('nonce'), 'nonce-value');
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(authorization.searchParams.get('code_challenge'));
    assert.ok(codeVerifier);
    assert.deepEqual(
      new Set(authorization.searchParams.get('scope').split(' ')),
      new Set(['openid', 'email', 'profile']),
    );
  });

  it('creates an active verified Google-only account keyed by subject', async () => {
    const result = await completeGoogleAccount({
      identity,
      firstName: 'Ada',
      lastName: 'Lovelace',
      sourceIp: '127.0.0.1',
    });

    assert.equal(result.success, true);
    const user = await User.findOne({ email: identity.email }).select('+passwordHash').lean();
    assert.equal(user.googleSubject, identity.subject);
    assert.equal(user.passwordHash, null);
    assert.equal(user.status, UserStatus.ACTIVE);
    assert.ok(user.emailVerifiedAt instanceof Date);
  });

  it('rejects a new account with no authentication method', async () => {
    await assert.rejects(
      User.create({
        firstName: 'No',
        lastName: 'Login',
        email: 'no-login@example.com',
        status: UserStatus.ACTIVE,
      }),
      /password or Google identity/i,
    );
  });

  it('signs in by stable subject without replacing local profile data', async () => {
    const user = await User.create({
      firstName: 'Local',
      lastName: 'Name',
      email: identity.email,
      googleSubject: identity.subject,
      status: UserStatus.ACTIVE,
      platformRole: PlatformRole.USER,
    });

    const result = await resolveGoogleIdentity({
      identity: { ...identity, email: 'changed@example.com', firstName: 'Changed' },
    });

    assert.equal(result.kind, 'authenticated');
    assert.equal(result.sessionUser.id, user.id);
    assert.equal(result.sessionUser.firstName, 'Local');
    assert.equal(result.sessionUser.email, identity.email);
  });

  it('requires the existing password before linking a matching email', async () => {
    const passwordHash = await hashPassword('CorrectHorse1');
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: identity.email,
      passwordHash,
      status: UserStatus.ACTIVE,
      platformRole: PlatformRole.USER,
    });

    const denied = await linkGoogleAccount({ identity, password: 'wrong' });
    assert.equal(denied.success, false);
    assert.equal((await User.findById(user._id)).googleSubject, null);

    const linked = await linkGoogleAccount({ identity, password: 'CorrectHorse1' });
    assert.equal(linked.success, true);
    assert.equal((await User.findById(user._id)).googleSubject, identity.subject);
  });

  it('uses verified Google identity to activate a password-confirmed pending account', async () => {
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: identity.email,
      passwordHash: await hashPassword('CorrectHorse1'),
      status: UserStatus.PENDING_VERIFICATION,
      platformRole: PlatformRole.USER,
      emailVerificationTokenHash: 'old-token',
      emailVerificationExpiresAt: new Date(Date.now() + 60_000),
    });

    const result = await linkGoogleAccount({ identity, password: 'CorrectHorse1' });
    assert.equal(result.success, true);
    const fresh = await User.findById(user._id).select('+emailVerificationTokenHash').lean();
    assert.equal(fresh.status, UserStatus.ACTIVE);
    assert.equal(fresh.emailVerificationTokenHash, null);
  });

  it('does not let password recovery add a password to a Google-only account', async () => {
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: identity.email,
      googleSubject: identity.subject,
      status: UserStatus.ACTIVE,
      platformRole: PlatformRole.USER,
    });

    await initiatePasswordReset({ email: identity.email });
    const fresh = await User.findById(user._id).select('+passwordResetTokenHash').lean();
    assert.equal(fresh.passwordResetTokenHash, null);
  });

  it('reauthenticates only the Google subject linked to the current user', async () => {
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: identity.email,
      googleSubject: identity.subject,
      status: UserStatus.ACTIVE,
      platformRole: PlatformRole.USER,
    });

    assert.equal(await verifyGoogleReauthentication({ userId: user._id, identity }), true);
    assert.equal(
      await verifyGoogleReauthentication({
        userId: user._id,
        identity: { ...identity, subject: 'another-google-account' },
      }),
      false,
    );
  });

  it('does not link an archived account through a matching Google email', async () => {
    await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: identity.email,
      passwordHash: await hashPassword('CorrectHorse1'),
      status: UserStatus.ARCHIVED,
      platformRole: PlatformRole.USER,
    });

    const resolved = await resolveGoogleIdentity({ identity });
    const linked = await linkGoogleAccount({ identity, password: 'CorrectHorse1' });
    assert.equal(resolved.kind, 'denied');
    assert.equal(linked.success, false);
  });
});
