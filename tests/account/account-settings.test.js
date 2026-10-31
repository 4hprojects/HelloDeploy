import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import ejs from 'ejs';
import { User, mongoose } from '@hellodeploy/database';
import { hashPassword, verifyPassword } from '@hellodeploy/auth';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';

import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';

const { changePassword, requestAccountClosure, updateProfile } =
  await import('../../apps/web/src/services/account.service.js');
const { suspendUser } = await import('../../apps/web/src/services/admin.service.js');
const { LEGAL_CONTACT_EMAIL } = await import('../../apps/web/src/config/legal-policies.js');

const accountView = fileURLToPath(
  new URL('../../apps/web/src/views/pages/account.ejs', import.meta.url),
);
const CURRENT = 'Current-pass1';
const NEXT = 'Next-pass22';

function recordingQueue() {
  const sent = [];
  return { sent, queueNotification: async (input) => sent.push(input) };
}

async function createUser(overrides = {}) {
  return User.create({
    firstName: 'Grace',
    lastName: 'Hopper',
    email: 'grace@example.com',
    passwordHash: await hashPassword(CURRENT),
    platformRole: PlatformRole.USER,
    status: UserStatus.ACTIVE,
    ...overrides,
  });
}

async function storeSession(id, user) {
  await mongoose.connection.db.collection('sessions').insertOne({
    _id: id,
    session: JSON.stringify({ user: { id: user._id.toString() } }),
    expires: new Date(Date.now() + 86_400_000),
  });
}

async function storedSessionIds() {
  const rows = await mongoose.connection.db.collection('sessions').find().toArray();
  return rows.map((row) => row._id).sort();
}

function renderAccount(account, extra = {}) {
  return ejs.renderFile(accountView, {
    account: {
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      hasPassword: true,
      hasGoogle: false,
      hasGithubApp: false,
      closureRequestedAt: null,
      ...account,
    },
    sensitiveAuthRecent: false,
    profileErrors: {},
    passwordErrors: {},
    legalContactEmail: LEGAL_CONTACT_EMAIL,
    csrfToken: 'token',
    ...extra,
  });
}

describe('account settings', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  describe('changing the password', () => {
    it('signs out other browsers but keeps the one that made the change', async () => {
      const user = await createUser();
      await storeSession('this-browser', user);
      await storeSession('other-browser', user);

      await changePassword(
        {
          userId: user._id,
          currentPassword: CURRENT,
          newPassword: NEXT,
          sessionId: 'this-browser',
        },
        recordingQueue(),
      );

      assert.deepEqual(await storedSessionIds(), ['this-browser']);
    });

    it('stores the new password', async () => {
      const user = await createUser();

      await changePassword(
        { userId: user._id, currentPassword: CURRENT, newPassword: NEXT, sessionId: 's' },
        recordingQueue(),
      );

      const stored = await User.findById(user._id).select('+passwordHash');
      assert.equal(await verifyPassword(stored.passwordHash, NEXT), true);
    });

    it('refuses a wrong current password and keeps the old one', async () => {
      const user = await createUser();

      const result = await changePassword(
        { userId: user._id, currentPassword: 'Wrong-pass1', newPassword: NEXT, sessionId: 's' },
        recordingQueue(),
      );

      const stored = await User.findById(user._id).select('+passwordHash');
      assert.deepEqual(
        [result.success, await verifyPassword(stored.passwordHash, CURRENT)],
        [false, true],
      );
    });

    it('emails the user that the password changed', async () => {
      const user = await createUser();
      const queue = recordingQueue();

      await changePassword(
        { userId: user._id, currentPassword: CURRENT, newPassword: NEXT, sessionId: 's' },
        queue,
      );

      assert.deepEqual(
        queue.sent.map(({ kind, payload }) => [kind, payload]),
        [['password-changed', { firstName: 'Grace' }]],
      );
    });
  });

  describe('closing the account', () => {
    it('records the request without deleting anything', async () => {
      const user = await createUser();

      await requestAccountClosure({ userId: user._id }, recordingQueue());

      const stored = await User.findById(user._id);
      assert.deepEqual(
        [stored.status, stored.closureRequestedAt instanceof Date],
        [UserStatus.ACTIVE, true],
      );
    });

    it('refuses a second request while one is open', async () => {
      const user = await createUser({ closureRequestedAt: new Date('2026-10-01') });

      const result = await requestAccountClosure({ userId: user._id }, recordingQueue());

      assert.equal(result.success, false);
    });

    it('confirms the request by email with the address to withdraw it', async () => {
      const user = await createUser();
      const queue = recordingQueue();

      await requestAccountClosure({ userId: user._id }, queue);

      assert.deepEqual(
        queue.sent.map(({ kind, payload }) => [kind, payload.contactEmail]),
        [['account-closure-requested', LEGAL_CONTACT_EMAIL]],
      );
    });
  });

  it('updates the profile name', async () => {
    const user = await createUser();

    const result = await updateProfile({
      userId: user._id,
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    assert.deepEqual(
      [result.sessionUser.firstName, result.sessionUser.lastName],
      ['Ada', 'Lovelace'],
    );
  });

  it('emails a suspended user the reason and where to appeal', async () => {
    const user = await createUser();
    const queue = recordingQueue();

    await suspendUser(
      {
        userId: user._id,
        adminId: new mongoose.Types.ObjectId().toString(),
        adminRole: PlatformRole.SUPER_ADMIN,
        reason: ' Spam ',
      },
      queue,
    );

    assert.deepEqual(
      queue.sent.map(({ kind, payload }) => [kind, payload.reason, payload.contactEmail]),
      [['account-suspended', 'Spam', LEGAL_CONTACT_EMAIL]],
    );
  });

  describe('account page', () => {
    it('asks a Google-only user to reconfirm before closure', async () => {
      const html = await renderAccount({ hasPassword: false, hasGoogle: true });
      assert.match(html, /\/auth\/google\/reauthenticate\?returnTo=%2Faccount%23close-account/);
    });

    it('hides the password change form from a Google-only user', async () => {
      const html = await renderAccount({ hasPassword: false, hasGoogle: true });
      assert.doesNotMatch(html, /action="\/account\/password"/);
    });

    it('asks for the current password before closure', async () => {
      const html = await renderAccount({});
      assert.match(html, /action="\/account\/close"[\s\S]*name="currentPassword"/);
    });

    it('shows an open closure request instead of the form', async () => {
      const html = await renderAccount({ closureRequestedAt: new Date('2026-10-31T00:00:00Z') });
      assert.doesNotMatch(html, /action="\/account\/close"/);
    });
  });
});
