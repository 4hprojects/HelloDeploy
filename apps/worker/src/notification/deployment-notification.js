import { mongoose, Notification, User } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';
import {
  buildEmailContent,
  escapeEmailHtml,
  getFailureCopy,
  JobType,
  NotificationStatus,
} from '@hellodeploy/contracts';
import { buildNotificationAad, encrypt } from '@hellodeploy/security';
import { enqueueJob } from '@hellodeploy/queue';
import { getNotificationQueue } from '../queue/notification-queue.js';

export function escapeNotificationHtml(value) {
  return escapeEmailHtml(value);
}

export function buildDeploymentNotificationEmail(opts, owner) {
  const {
    projectName,
    projectSlug,
    sequenceNumber,
    status,
    commitSha,
    failureCode,
    failureSummary,
    platformDomain,
  } = opts;

  const failureCopy = failureCode ? getFailureCopy(failureCode) : null;
  return {
    to: owner.email,
    ...buildEmailContent('deployment-result', {
      firstName: owner.firstName || owner.name || 'there',
      projectName,
      sequenceNumber,
      status,
      commitSha,
      failureCode,
      failureSummary,
      failureMessage: failureCopy?.message,
      failureAction: failureCopy?.action,
      dashboardUrl: `https://${platformDomain}/projects/${projectSlug}/deployments`,
    }),
  };
}

export function shouldSendDeploymentNotification(notificationPreference, status) {
  if (notificationPreference === 'NONE') {
    return false;
  }
  return notificationPreference !== 'FAILURE_ONLY' || status === 'FAILED';
}

/**
 * Notify the project owner when a deployment completes (HEALTHY or FAILED).
 * Failures are logged but never rethrown — notifications must never block the deployment pipeline.
 *
 * @param {{
 *   ownerId: string,
 *   projectName: string,
 *   projectSlug: string,
 *   sequenceNumber: number,
 *   status: 'HEALTHY' | 'FAILED',
 *   commitSha: string,
 *   failureCode?: string,
 *   failureSummary?: string,
 *   platformDomain: string,
 *   notificationPreference?: 'ALL' | 'FAILURE_ONLY' | 'NONE',
 * }} opts
 */
export async function notifyDeploymentResult(opts) {
  const {
    ownerId,
    projectName,
    projectSlug,
    sequenceNumber,
    status,
    commitSha,
    failureCode,
    failureSummary,
    platformDomain,
    notificationPreference = 'ALL',
  } = opts;

  if (!shouldSendDeploymentNotification(notificationPreference, status)) {
    return;
  }

  try {
    const owner = await User.findById(ownerId).select('email firstName').lean();
    if (!owner) {
      return;
    }

    const _id = new mongoose.Types.ObjectId();
    const payload = {
      firstName: owner.firstName,
      projectName,
      projectSlug,
      sequenceNumber,
      status,
      commitSha,
      failureCode,
      failureSummary,
      failureMessage: failureCode ? getFailureCopy(failureCode)?.message : null,
      failureAction: failureCode ? getFailureCopy(failureCode)?.action : null,
      dashboardUrl: `https://${platformDomain}/projects/${projectSlug}/deployments`,
    };
    const encrypted = encrypt(JSON.stringify(payload), buildNotificationAad(_id));
    const notification = await Notification.create({
      _id,
      userId: ownerId,
      kind: 'deployment-result',
      status: NotificationStatus.PENDING,
      correlationId: opts.correlationId || 'deployment',
      projectId: opts.projectId,
      deploymentId: opts.deploymentId,
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      encryptionVersion: encrypted.version,
      aadBound: encrypted.aadBound,
      nextAttemptAt: new Date(),
    });
    const queue = getNotificationQueue();
    if (queue) {
      await enqueueJob(
        queue,
        JobType.SEND_NOTIFICATION,
        { version: 1, notificationId: _id.toString(), correlationId: notification.correlationId },
        { jobId: `notification-${_id}` },
      );
    }
  } catch (err) {
    logger.warn('[notification] Error sending deployment notification', {
      kind: 'deployment-result',
      errorType: err?.name ?? 'Error',
    });
  }
}
