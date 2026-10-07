import { Resend } from 'resend';
import { Notification, User } from '@hellodeploy/database';
import {
  AuditOutcome,
  buildEmailContent,
  NotificationStatus,
  JobType,
  getFailureCopy,
} from '@hellodeploy/contracts';
import { buildNotificationAad, decrypt } from '@hellodeploy/security';
import { enqueueJob } from '@hellodeploy/queue';
import { logger, writeAuditEvent } from '@hellodeploy/observability';
import { env } from '../config/env.js';
import { getNotificationQueue } from '../queue/notification-queue.js';

let resend = null;

function client() {
  if (!resend && env.RESEND_API_KEY) {
    resend = new Resend(env.RESEND_API_KEY);
  }
  return resend;
}

function readPayload(notification) {
  return JSON.parse(
    decrypt({
      ciphertext: notification.ciphertext,
      iv: notification.iv,
      authTag: notification.authTag,
      version: notification.encryptionVersion,
      aad: notification.aadBound ? buildNotificationAad(notification._id) : undefined,
    }),
  );
}

function providerErrorType(error) {
  const candidate = String(error?.name ?? 'provider_error');
  return /^[a-z0-9_-]{1,80}$/i.test(candidate) ? candidate : 'provider_error';
}

export function isPermanentNotificationError(error) {
  const type = providerErrorType(error).toLowerCase();
  if (
    [
      'invalid_access',
      'invalid_api_key',
      'invalid_from_address',
      'invalid_idempotency_key',
      'invalid_idempotent_request',
      'invalid_parameter',
      'invalid_region',
      'method_not_allowed',
      'missing_api_key',
      'missing_required_field',
      'not_found',
      'recipient_unavailable',
      'restricted_api_key',
      'validation_error',
    ].includes(type)
  ) {
    return true;
  }
  const statusCode = Number(error?.statusCode ?? error?.status);
  return (
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode < 500 &&
    ![408, 409, 425, 429].includes(statusCode)
  );
}

export async function handleSendNotification(job, deps = {}) {
  const NotificationModel = deps.Notification ?? Notification;
  const UserModel = deps.User ?? User;
  const provider = deps.client ?? client();
  const notification = await NotificationModel.findOneAndUpdate(
    {
      _id: job.data.notificationId,
      status: {
        $in: [NotificationStatus.PENDING, NotificationStatus.PROCESSING],
      },
    },
    { $set: { status: NotificationStatus.PROCESSING }, $inc: { attemptCount: 1 } },
    { new: true },
  ).select('+ciphertext +iv +authTag');
  if (!notification) {
    return;
  }

  try {
    if (!provider) {
      throw Object.assign(new Error('provider unavailable'), { name: 'provider_unconfigured' });
    }
    const user = await UserModel.findById(notification.userId).select('email firstName').lean();
    if (!user?.email) {
      throw Object.assign(new Error('recipient unavailable'), { name: 'recipient_unavailable' });
    }
    const payload = readPayload(notification);
    const content = buildEmailContent(notification.kind, {
      ...payload,
      firstName: payload.firstName ?? user.firstName,
    });
    const { data, error } = await provider.emails.send(
      { from: env.EMAIL_FROM, to: user.email, ...content },
      { idempotencyKey: notification._id.toString() },
    );
    if (error) {
      throw Object.assign(new Error('provider rejected request'), error);
    }
    await NotificationModel.updateOne(
      { _id: notification._id },
      {
        $set: {
          status: NotificationStatus.SENT,
          providerMessageId: data?.id ?? null,
          sentAt: new Date(),
          nextAttemptAt: null,
          lastErrorType: null,
        },
      },
    );
    logger.info('[notification] Email accepted by provider', {
      notificationId: notification._id.toString(),
      kind: notification.kind,
      providerMessageId: data?.id ?? null,
    });
    await writeAuditEvent({
      action: 'notification.email_accepted',
      outcome: AuditOutcome.SUCCESS,
      actorId: notification.userId.toString(),
      targetType: 'notification',
      targetId: notification._id.toString(),
      metadata: { kind: notification.kind },
    }).catch(() => {});
  } catch (error) {
    const permanent = isPermanentNotificationError(error);
    const finalAttempt = permanent || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const skipped = providerErrorType(error) === 'recipient_unavailable';
    const retryDelay = Math.min(5_000 * 2 ** job.attemptsMade, 5 * 60_000);
    await NotificationModel.updateOne(
      { _id: notification._id },
      {
        $set: {
          status: skipped
            ? NotificationStatus.SUPPRESSED
            : finalAttempt
              ? NotificationStatus.FAILED
              : NotificationStatus.PENDING,
          lastErrorType: providerErrorType(error),
          failedAt: finalAttempt ? new Date() : null,
          nextAttemptAt: finalAttempt ? null : new Date(Date.now() + retryDelay),
        },
      },
    );
    logger.warn('[notification] Email delivery attempt failed', {
      notificationId: notification._id.toString(),
      kind: notification.kind,
      errorType: providerErrorType(error),
      finalAttempt,
      permanent,
    });
    if (finalAttempt) {
      await writeAuditEvent({
        action: skipped ? 'notification.email_skipped' : 'notification.email_failed',
        outcome: skipped ? AuditOutcome.DENIED : AuditOutcome.FAILURE,
        actorId: notification.userId.toString(),
        targetType: 'notification',
        targetId: notification._id.toString(),
        metadata: { kind: notification.kind, errorType: providerErrorType(error) },
      }).catch(() => {});
    }
    if (!finalAttempt) {
      throw error;
    }
  }
}

async function enqueueNotification(notification, queue) {
  await enqueueJob(
    queue,
    JobType.SEND_NOTIFICATION,
    {
      version: 1,
      notificationId: notification._id.toString(),
      correlationId: notification.correlationId,
    },
    { jobId: `notification-${notification._id}` },
  );
}

export async function sweepNotifications({
  queue = getNotificationQueue(),
  limit = 100,
  draftOlderThanMs = 60_000,
} = {}) {
  if (!queue) {
    return { enqueued: 0, reconciled: 0 };
  }
  let reconciled = 0;
  const drafts = await Notification.find({
    status: NotificationStatus.DRAFT,
    createdAt: { $lte: new Date(Date.now() - draftOlderThanMs) },
  })
    .select('+ciphertext +iv +authTag')
    .limit(limit);
  for (const notification of drafts) {
    try {
      const payload = readPayload(notification);
      const user = await User.findById(notification.userId)
        .select('+emailVerificationTokenHash +passwordResetTokenHash')
        .lean();
      const expected = payload.credentialHash;
      const matches =
        expected &&
        (user?.emailVerificationTokenHash === expected ||
          user?.passwordResetTokenHash === expected);
      await Notification.updateOne(
        { _id: notification._id, status: NotificationStatus.DRAFT },
        {
          $set: {
            status: matches ? NotificationStatus.PENDING : NotificationStatus.FAILED,
            nextAttemptAt: matches ? new Date() : null,
            lastErrorType: matches ? null : 'credential_replaced',
            failedAt: matches ? null : new Date(),
          },
        },
      );
      if (matches) {
        reconciled += 1;
      }
    } catch (error) {
      await Notification.updateOne(
        { _id: notification._id, status: NotificationStatus.DRAFT },
        {
          $set: {
            status: NotificationStatus.FAILED,
            lastErrorType: providerErrorType(error),
            failedAt: new Date(),
          },
        },
      );
    }
  }

  const due = await Notification.find({
    status: NotificationStatus.PENDING,
    $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: new Date() } }],
  }).limit(limit);
  for (const notification of due) {
    await enqueueNotification(notification, queue);
  }
  return { enqueued: due.length, reconciled };
}

export function deploymentNotificationPayload(opts) {
  const copy = opts.failureCode ? getFailureCopy(opts.failureCode) : null;
  return {
    ...opts,
    dashboardUrl: `https://${opts.platformDomain}/projects/${opts.projectSlug}/deployments`,
    failureMessage: copy?.message,
    failureAction: copy?.action,
  };
}
