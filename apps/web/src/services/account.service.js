import { User } from '@hellodeploy/database';
import { hashPassword, verifyPassword } from '@hellodeploy/auth';
import { AuditOutcome, UserStatus } from '@hellodeploy/contracts';
import { logger, writeAuditEvent } from '@hellodeploy/observability';

import { LEGAL_CONTACT_EMAIL } from '../config/legal-policies.js';
import { queueEmailNotification } from './notification.service.js';
import { revokeUserSessions } from './session-revocation.service.js';

/** What the account page shows about the signed-in user. */
export async function getAccountOverview(userId) {
  const user = await User.findById(userId).select('+passwordHash').lean();
  if (!user) {
    return null;
  }
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    hasPassword: Boolean(user.passwordHash),
    hasGoogle: Boolean(user.googleSubject),
    hasGithubApp: Boolean(user.githubInstallationId),
    closureRequestedAt: user.closureRequestedAt ?? null,
    createdAt: user.createdAt,
  };
}

export async function updateProfile({ userId, firstName, lastName, sourceIp, correlationId }) {
  const user = await User.findOneAndUpdate(
    { _id: userId, status: UserStatus.ACTIVE },
    { $set: { firstName, lastName } },
    { new: true, runValidators: true },
  );
  if (!user) {
    return { success: false, error: 'Your account could not be updated.' };
  }

  await writeAuditEvent({
    action: 'account.profile_updated',
    outcome: AuditOutcome.SUCCESS,
    actorId: userId.toString(),
    targetType: 'user',
    targetId: userId.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true, sessionUser: user.toSessionUser() };
}

/**
 * Change the password of a signed-in user who knows the current one. Every
 * other browser signed in to the account is signed out; the one that made the
 * change stays signed in.
 */
export async function changePassword(
  { userId, currentPassword, newPassword, sessionId, sourceIp, correlationId },
  { queueNotification = queueEmailNotification } = {},
) {
  const user = await User.findOne({ _id: userId, status: UserStatus.ACTIVE }).select(
    '+passwordHash',
  );
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
    await writeAuditEvent({
      action: 'account.password_change_rejected',
      outcome: AuditOutcome.FAILURE,
      actorId: userId.toString(),
      sourceIp,
      correlationId,
    });
    return { success: false, error: 'Your current password is incorrect.' };
  }

  user.passwordHash = await hashPassword(newPassword);
  user.configVersion += 1;
  await user.save({ validateModifiedOnly: true });

  const revokedSessions = await revokeUserSessions(user._id, { exceptSessionId: sessionId }).catch(
    (error) => {
      logger.warn('Password change: other sessions could not be revoked', {
        error: error.message,
        userId: user._id.toString(),
        correlationId,
      });
      return null;
    },
  );

  await writeAuditEvent({
    action: 'account.password_changed',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    targetType: 'user',
    targetId: user._id.toString(),
    sourceIp,
    correlationId,
    metadata: { revokedSessions },
  });

  await queueNotification({
    userId: user._id,
    kind: 'password-changed',
    payload: { firstName: user.firstName },
    correlationId,
  }).catch((error) => {
    logger.warn('Password change email could not be queued', {
      error: error.message,
      userId: user._id.toString(),
      correlationId,
    });
  });

  return { success: true, sessionUser: user.toSessionUser() };
}

/**
 * Record a request to close the account. Nothing is deleted here: an admin
 * reviews the request and completes it with the existing permanent deletion,
 * so deletion behaves the same however it was asked for.
 */
export async function requestAccountClosure(
  { userId, sourceIp, correlationId },
  { queueNotification = queueEmailNotification } = {},
) {
  const user = await User.findOneAndUpdate(
    { _id: userId, status: UserStatus.ACTIVE, closureRequestedAt: null },
    { $set: { closureRequestedAt: new Date() } },
    { new: true },
  );
  if (!user) {
    return { success: false, error: 'A closure request is already open for this account.' };
  }

  await writeAuditEvent({
    action: 'account.closure_requested',
    outcome: AuditOutcome.SUCCESS,
    actorId: user._id.toString(),
    targetType: 'user',
    targetId: user._id.toString(),
    sourceIp,
    correlationId,
  });

  await queueNotification({
    userId: user._id,
    kind: 'account-closure-requested',
    payload: { firstName: user.firstName, contactEmail: LEGAL_CONTACT_EMAIL },
    correlationId,
  }).catch((error) => {
    logger.warn('Closure confirmation email could not be queued', {
      error: error.message,
      userId: user._id.toString(),
      correlationId,
    });
  });

  return { success: true };
}
