import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { User } from '@hellodeploy/database';
import { UserStatus, PlatformRole } from '@hellodeploy/contracts';
import { generateToken } from '@hellodeploy/auth';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { verifyEmail } = await import('../../apps/web/src/services/auth.service.js');
const { getVerifyEmail } = await import('../../apps/web/src/controllers/auth.controller.js');
const { closeDeploymentQueue } = await import('../../apps/web/src/queue/client.js');

async function createPendingUser(overrides = {}) {
  const { raw, hash } = generateToken(32);
  const user = await User.create({
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: `ada-${objectId()}@example.test`,
    passwordHash: 'hash',
    platformRole: PlatformRole.USER,
    status: UserStatus.PENDING_VERIFICATION,
    emailVerificationTokenHash: hash,
    emailVerificationExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...overrides,
  });
  return { user, rawToken: raw };
}

function fakeResponse() {
  const res = { redirected: null, rendered: null };
  res.redirect = (url) => {
    res.redirected = url;
  };
  res.render = (view, data) => {
    res.rendered = { view, data };
  };
  return res;
}

function fakeSession(initial = {}) {
  const session = { ...initial };
  session.regenerate = (cb) => {
    // express-session mutates the same session object in place on regenerate
    delete session.user;
    cb(null);
  };
  session.save = (cb) => cb();
  return session;
}

describe('email verification establishes a session (no forced re-login)', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await closeDeploymentQueue();
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('verifyEmail() returns a sessionUser (not a raw user doc) on success', async () => {
    const { user, rawToken } = await createPendingUser();

    const result = await verifyEmail({ rawToken, sourceIp: '127.0.0.1', correlationId: 'test' });

    assert.equal(result.success, true);
    assert.deepEqual(result.sessionUser, {
      id: user._id.toString(),
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: user.email,
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
      configVersion: user.configVersion,
    });
  });

  it('verifyEmail() activates the account and records lastLoginAt', async () => {
    const { rawToken, user } = await createPendingUser();

    await verifyEmail({ rawToken, sourceIp: '127.0.0.1', correlationId: 'test' });

    const fresh = await User.findById(user._id).lean();
    assert.equal(fresh.status, UserStatus.ACTIVE);
    assert.ok(
      fresh.lastLoginAt instanceof Date,
      'lastLoginAt must be set once a session is granted',
    );
  });

  it('verifyEmail() does not grant a session on an invalid token', async () => {
    const bogusToken = ['not', 'a', 'real', 'value'].join('-');

    const result = await verifyEmail({
      rawToken: bogusToken,
      sourceIp: '127.0.0.1',
      correlationId: 'test',
    });

    assert.equal(result.success, false);
    assert.equal(result.sessionUser, undefined);
  });

  it('getVerifyEmail signs the user in and redirects straight to their dashboard', async () => {
    const { rawToken, user } = await createPendingUser();
    const req = {
      query: { token: rawToken },
      ip: '127.0.0.1',
      correlationId: 'test',
      session: fakeSession(),
      flash: () => {},
    };
    const res = fakeResponse();

    await getVerifyEmail(req, res);

    assert.equal(req.session.user?.id, user._id.toString());
    assert.equal(res.redirected, '/dashboard');
  });

  it('getVerifyEmail regenerates the session before setting session.user (fixation protection)', async () => {
    const { rawToken } = await createPendingUser();
    let regenerateCalledBeforeUserSet = false;
    const req = {
      query: { token: rawToken },
      ip: '127.0.0.1',
      correlationId: 'test',
      session: {
        regenerate(cb) {
          regenerateCalledBeforeUserSet = req.session.user === undefined;
          cb(null);
        },
        save(cb) {
          cb();
        },
      },
      flash: () => {},
    };
    const res = fakeResponse();

    await getVerifyEmail(req, res);

    assert.equal(regenerateCalledBeforeUserSet, true);
  });

  it('getVerifyEmail leaves the account unauthenticated on an expired/invalid token', async () => {
    const bogusToken = ['garbage', 'value'].join('-');
    const req = {
      query: { token: bogusToken },
      ip: '127.0.0.1',
      correlationId: 'test',
      session: fakeSession(),
      flash: () => {},
    };
    const res = fakeResponse();

    await getVerifyEmail(req, res);

    assert.equal(req.session.user, undefined);
    assert.equal(res.rendered?.data?.error, 'This verification link is invalid or has expired.');
  });
});
