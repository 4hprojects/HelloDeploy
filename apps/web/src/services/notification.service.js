import { mongoose, Notification } from '@hellodeploy/database';
import { NotificationStatus, JobType } from '@hellodeploy/contracts';
import { buildNotificationAad, encrypt } from '@hellodeploy/security';
import { enqueueJob } from '@hellodeploy/queue';
import { env } from '../config/env.js';
import { getNotificationQueue, getRedisConnection } from '../queue/client.js';

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('notification worker check timed out')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function isEmailDeliveryAvailable(options = {}) {
  const emailConfigured = options.emailConfigured ?? env.isEmailConfigured();
  if (!emailConfigured) {
    return false;
  }
  const redis = options.redis ?? getRedisConnection();
  if (redis?.status !== 'ready') {
    return false;
  }
  const queue = options.queue ?? getNotificationQueue();
  if (!queue) {
    return false;
  }
  try {
    const workers = await withTimeout(queue.getWorkers(), 2_000);
    return workers.length > 0;
  } catch {
    return false;
  }
}

export async function createNotificationDraft({
  userId,
  kind,
  payload,
  correlationId,
  projectId = null,
  deploymentId = null,
}) {
  const _id = new mongoose.Types.ObjectId();
  const encrypted = encrypt(JSON.stringify(payload), buildNotificationAad(_id));
  return Notification.create({
    _id,
    userId,
    kind,
    status: NotificationStatus.DRAFT,
    correlationId: correlationId || 'system',
    projectId,
    deploymentId,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    encryptionVersion: encrypted.version,
    aadBound: encrypted.aadBound,
  });
}

export async function scheduleNotification(notification, { queue = getNotificationQueue() } = {}) {
  if (!queue) {
    throw new Error('Notification queue is unavailable.');
  }
  await Notification.updateOne(
    { _id: notification._id, status: NotificationStatus.DRAFT },
    { $set: { status: NotificationStatus.PENDING, nextAttemptAt: new Date() } },
  );
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
  return { status: 'scheduled', notificationId: notification._id.toString() };
}

export async function queueEmailNotification(input, dependencies) {
  const draft = await createNotificationDraft(input);
  return scheduleNotification(draft, dependencies);
}
