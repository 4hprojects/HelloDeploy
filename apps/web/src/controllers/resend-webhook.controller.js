import { Webhook } from 'svix';
import { Notification, NotificationWebhookEvent } from '@hellodeploy/database';
import { NotificationStatus } from '@hellodeploy/contracts';
import { env } from '../config/env.js';
import { logger } from '@hellodeploy/observability';

const EVENT_STATUS = {
  'email.sent': NotificationStatus.SENT,
  'email.delivered': NotificationStatus.DELIVERED,
  'email.delivery_delayed': NotificationStatus.DELAYED,
  'email.failed': NotificationStatus.FAILED,
  'email.bounced': NotificationStatus.BOUNCED,
  'email.suppressed': NotificationStatus.SUPPRESSED,
};
const RANK = {
  [NotificationStatus.SENT]: 1,
  [NotificationStatus.DELAYED]: 2,
  [NotificationStatus.DELIVERED]: 3,
  [NotificationStatus.FAILED]: 3,
  [NotificationStatus.BOUNCED]: 4,
  [NotificationStatus.SUPPRESSED]: 4,
};

export async function handleResendWebhook(req, res, deps = {}) {
  if (!env.RESEND_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'Email webhooks are not configured.' });
  }
  let event;
  try {
    const verifier = deps.verifier ?? new Webhook(env.RESEND_WEBHOOK_SECRET);
    event = verifier.verify(req.body.toString('utf8'), {
      'svix-id': req.headers['svix-id'],
      'svix-timestamp': req.headers['svix-timestamp'],
      'svix-signature': req.headers['svix-signature'],
    });
  } catch {
    return res.status(401).json({ error: 'Invalid signature.' });
  }

  const eventId = req.headers['svix-id'];
  const providerMessageId = event?.data?.email_id ?? null;
  try {
    await (deps.EventModel ?? NotificationWebhookEvent).create({
      eventId,
      eventType: event.type,
      providerMessageId,
      occurredAt: event.created_at ? new Date(event.created_at) : null,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(200).json({ ok: true, duplicate: true });
    }
    throw error;
  }

  const nextStatus = EVENT_STATUS[event.type];
  if (nextStatus && providerMessageId) {
    const Model = deps.NotificationModel ?? Notification;
    const notification = await Model.findOne({ providerMessageId });
    if (notification && (RANK[nextStatus] ?? 0) > (RANK[notification.status] ?? 0)) {
      const timestampField = {
        [NotificationStatus.SENT]: 'sentAt',
        [NotificationStatus.DELIVERED]: 'deliveredAt',
        [NotificationStatus.DELAYED]: 'delayedAt',
        [NotificationStatus.FAILED]: 'failedAt',
        [NotificationStatus.BOUNCED]: 'bouncedAt',
        [NotificationStatus.SUPPRESSED]: 'suppressedAt',
      }[nextStatus];
      await Model.updateOne(
        { _id: notification._id },
        {
          $set: {
            status: nextStatus,
            [timestampField]: event.created_at ? new Date(event.created_at) : new Date(),
          },
        },
      );
    }
  }
  logger.info('[notification] Provider event processed', { eventType: event.type });
  return res.status(200).json({ ok: true });
}
