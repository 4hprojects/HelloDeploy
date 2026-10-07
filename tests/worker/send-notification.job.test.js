import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { mongoose, Notification, User } from '@hellodeploy/database';
import { NotificationStatus, PlatformRole, UserStatus } from '@hellodeploy/contracts';
import { buildNotificationAad, encrypt } from '@hellodeploy/security';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';

const { handleSendNotification, isPermanentNotificationError, sweepNotifications } =
  await import('../../apps/worker/src/jobs/send-notification.job.js');

async function createNotification(user, status = NotificationStatus.PENDING, payload = {}) {
  const id = new mongoose.Types.ObjectId();
  const encrypted = encrypt(
    JSON.stringify({ firstName: user.firstName, ...payload }),
    buildNotificationAad(id),
  );
  await Notification.create({
    _id: id,
    userId: user._id,
    kind: 'password-changed',
    status,
    correlationId: 'notification-test',
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    encryptionVersion: encrypted.version,
    aadBound: encrypted.aadBound,
  });
  return id;
}

describe('send notification job', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('decrypts content, uses provider idempotency, and records acceptance', async () => {
    const user = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'private@example.test',
      passwordHash: 'hash',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
    const id = await createNotification(user);
    let options;
    const client = {
      emails: {
        async send(_message, inputOptions) {
          options = inputOptions;
          return { data: { id: 'provider-id' }, error: null };
        },
      },
    };
    await handleSendNotification(
      { data: { notificationId: id.toString() }, attemptsMade: 0, opts: { attempts: 5 } },
      { client },
    );
    const fresh = await Notification.findById(id).lean();
    assert.equal(fresh.status, NotificationStatus.SENT);
    assert.equal(fresh.providerMessageId, 'provider-id');
    assert.equal(options.idempotencyKey, id.toString());
  });

  it('retries transient provider failures and stops on permanent rejection', async () => {
    const user = await User.create({
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'private@example.test',
      passwordHash: 'hash',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
    const transientId = await createNotification(user);
    const transientClient = {
      emails: {
        async send() {
          return {
            data: null,
            error: { name: 'rate_limit_exceeded', statusCode: 429 },
          };
        },
      },
    };
    await assert.rejects(
      handleSendNotification(
        {
          data: { notificationId: transientId.toString() },
          attemptsMade: 0,
          opts: { attempts: 5 },
        },
        { client: transientClient },
      ),
    );
    const transient = await Notification.findById(transientId).lean();
    assert.equal(transient.status, NotificationStatus.PENDING);
    assert.equal(transient.lastErrorType, 'rate_limit_exceeded');
    assert.ok(transient.nextAttemptAt instanceof Date);

    const permanentId = await createNotification(user);
    const permanentClient = {
      emails: {
        async send() {
          return { data: null, error: { name: 'validation_error', statusCode: 422 } };
        },
      },
    };
    await handleSendNotification(
      {
        data: { notificationId: permanentId.toString() },
        attemptsMade: 0,
        opts: { attempts: 5 },
      },
      { client: permanentClient },
    );
    const permanent = await Notification.findById(permanentId).lean();
    assert.equal(permanent.status, NotificationStatus.FAILED);
    assert.equal(permanent.lastErrorType, 'validation_error');
    assert.equal(permanent.nextAttemptAt, null);
    assert.equal(isPermanentNotificationError({ statusCode: 408 }), false);
    assert.equal(isPermanentNotificationError({ name: 'invalid_idempotent_request' }), true);
    assert.equal(isPermanentNotificationError({ name: 'concurrent_idempotent_requests' }), false);
  });

  it('reclaims an interrupted processing record using the same idempotency key', async () => {
    const user = await User.create({
      firstName: 'Katherine',
      lastName: 'Johnson',
      email: 'private@example.test',
      passwordHash: 'hash',
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
    const id = await createNotification(user, NotificationStatus.PROCESSING);
    let idempotencyKey;
    await handleSendNotification(
      { data: { notificationId: id.toString() }, attemptsMade: 1, opts: { attempts: 5 } },
      {
        client: {
          emails: {
            async send(_message, options) {
              idempotencyKey = options.idempotencyKey;
              return { data: { id: 'provider-replayed' }, error: null };
            },
          },
        },
      },
    );
    assert.equal(idempotencyKey, id.toString());
    assert.equal((await Notification.findById(id).lean()).status, NotificationStatus.SENT);
  });

  it('suppresses a notification whose recipient no longer exists', async () => {
    const id = await createNotification({
      _id: new mongoose.Types.ObjectId(),
      firstName: 'Deleted',
    });
    await handleSendNotification(
      { data: { notificationId: id.toString() }, attemptsMade: 0, opts: { attempts: 5 } },
      { client: { emails: { async send() {} } } },
    );
    const fresh = await Notification.findById(id).lean();
    assert.equal(fresh.status, NotificationStatus.SUPPRESSED);
    assert.equal(fresh.lastErrorType, 'recipient_unavailable');
  });

  it('reconciles only a draft whose credential became active before the crash', async () => {
    const credentialHash = 'credential-hash';
    const user = await User.create({
      firstName: 'Dorothy',
      lastName: 'Vaughan',
      email: 'private@example.test',
      passwordHash: 'hash',
      passwordResetTokenHash: credentialHash,
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
      platformRole: PlatformRole.USER,
      status: UserStatus.ACTIVE,
    });
    const matchingId = await createNotification(user, NotificationStatus.DRAFT, {
      credentialHash,
    });
    const replacedId = await createNotification(user, NotificationStatus.DRAFT, {
      credentialHash: 'replaced-hash',
    });
    const enqueued = [];
    const result = await sweepNotifications({
      queue: { add: async (...args) => enqueued.push(args) },
      draftOlderThanMs: 0,
    });
    assert.deepEqual(result, { enqueued: 1, reconciled: 1 });
    assert.equal(
      (await Notification.findById(matchingId).lean()).status,
      NotificationStatus.PENDING,
    );
    assert.equal(
      (await Notification.findById(replacedId).lean()).status,
      NotificationStatus.FAILED,
    );
    assert.equal(enqueued.length, 1);
  });
});
