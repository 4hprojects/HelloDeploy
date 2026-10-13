import {
  ApprovalRequest,
  EnvironmentSecret,
  Project,
  Quota,
  Repository,
  User,
  mongoose,
} from '@hellodeploy/database';
import {
  ApprovalStatus,
  AuditOutcome,
  PlatformRole,
  ProjectStatus,
  QuotaScope,
  UserStatus,
} from '@hellodeploy/contracts';
import { logger, writeAuditEvent } from '@hellodeploy/observability';

import { env } from '../config/env.js';
import { isApprovalSnapshotCurrent } from './approval-readiness.service.js';
import { queueEmailNotification } from './notification.service.js';

export const PROVISIONAL_APPROVAL_DELAY_MS = 30 * 60 * 1000;

// Enough for a small app to prove itself; an admin lifts these by confirming.
const PROVISIONAL_LIMITS = Object.freeze({ memoryMb: 256, cpuCores: 0.25, maxCustomDomains: 0 });
const PROVISIONAL_QUOTA_REASON = 'Provisional approval — awaiting admin review';

/**
 * Email every active admin that a project is waiting in the approval queue.
 * Best-effort: a mail outage must never fail the owner's submission.
 */
export async function notifyAdminsOfPendingReview({ project, correlationId }, deps = {}) {
  const queueEmail = deps.queueEmailNotification ?? queueEmailNotification;
  const admins = await User.find({
    platformRole: { $in: [PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN] },
    status: UserStatus.ACTIVE,
  })
    .select('firstName')
    .lean();

  const results = await Promise.allSettled(
    admins.map((admin) =>
      queueEmail({
        userId: admin._id,
        kind: 'approval-requested',
        payload: {
          firstName: admin.firstName,
          projectName: project.name,
          reviewUrl: `${baseUrl()}/admin/approval-requests`,
          provisionalAfterMinutes: PROVISIONAL_APPROVAL_DELAY_MS / 60_000,
        },
        correlationId,
        projectId: project._id,
      }),
    ),
  );
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length > 0) {
    logger.warn('Approval: could not queue admin review emails', {
      projectId: project._id.toString(),
      failed: failed.length,
      error: failed[0].reason?.message,
      correlationId,
    });
  }
}

/**
 * Provisionally approve initial-deployment requests nobody reviewed in time.
 * Safe to run from several web instances: every write is conditional.
 */
export async function approveOverdueRequests({ now = new Date() } = {}) {
  const overdue = await ApprovalRequest.find({
    status: ApprovalStatus.PENDING,
    requestType: 'INITIAL_DEPLOYMENT',
    createdAt: { $lte: new Date(now.getTime() - PROVISIONAL_APPROVAL_DELAY_MS) },
  }).lean();

  let approved = 0;
  for (const request of overdue) {
    if (await approveProvisionally(request, now)) {
      approved += 1;
    }
  }
  return approved;
}

async function approveProvisionally(request, now) {
  const project = await Project.findById(request.projectId);
  if (!project) {
    return false;
  }
  const [repository, secrets] = await Promise.all([
    project.repositoryId ? Repository.findById(project.repositoryId) : null,
    EnvironmentSecret.find({ projectId: project._id }).select('name').lean(),
  ]);
  const configuredEnvironmentVariables = secrets.map(({ name }) => name);
  // A changed repo or config needs a fresh check, so it waits for the admin.
  if (
    !isApprovalSnapshotCurrent({ request, project, repository, configuredEnvironmentVariables })
      .isCurrent
  ) {
    return false;
  }

  const session = await mongoose.startSession();
  let quotaId = null;
  let isApproved = false;
  try {
    await session.withTransaction(async () => {
      isApproved = false;
      quotaId = null;
      const activated = await Project.updateOne(
        { _id: project._id, status: ProjectStatus.DRAFT },
        { $set: { status: ProjectStatus.ACTIVE } },
        { session },
      );
      if (activated.modifiedCount !== 1) {
        return;
      }

      const hasAdminOverride = await Quota.exists({
        scopeType: QuotaScope.PROJECT,
        scopeId: project._id,
      }).session(session);
      if (!hasAdminOverride) {
        const [quota] = await Quota.create(
          [
            {
              scopeType: QuotaScope.PROJECT,
              scopeId: project._id,
              ...PROVISIONAL_LIMITS,
              reason: PROVISIONAL_QUOTA_REASON,
            },
          ],
          { session },
        );
        quotaId = quota._id;
      }

      const reviewed = await ApprovalRequest.updateOne(
        { _id: request._id, status: ApprovalStatus.PENDING },
        {
          $set: {
            status: ApprovalStatus.APPROVED,
            reviewedAt: now,
            isAutoApproved: true,
            isProvisional: true,
            provisionalQuotaId: quotaId,
            autoApprovalReasons: ['review_timeout'],
          },
        },
        { session },
      );
      if (reviewed.modifiedCount !== 1) {
        // An admin decided while this ran; undo the activation with the transaction.
        throw new ProvisionalApprovalConflict();
      }
      isApproved = true;
    });
  } catch (err) {
    if (!(err instanceof ProvisionalApprovalConflict)) {
      throw err;
    }
  } finally {
    await session.endSession();
  }

  if (isApproved) {
    await writeAuditEvent({
      action: 'project.provisionally_approved',
      outcome: AuditOutcome.SUCCESS,
      targetType: 'project',
      targetId: project._id.toString(),
      correlationId: 'system',
      metadata: {
        approvalRequestId: request._id.toString(),
        provisionalQuotaId: quotaId?.toString() ?? null,
      },
    });
  }
  return isApproved;
}

class ProvisionalApprovalConflict extends Error {
  constructor() {
    super('The approval request was reviewed while provisional approval ran.');
    this.code = 'PROVISIONAL_APPROVAL_CONFLICT';
  }
}

function baseUrl() {
  return env.isProduction() ? `https://${env.PLATFORM_DOMAIN}` : `http://localhost:${env.PORT}`;
}
