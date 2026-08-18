import {
  User,
  Project,
  ProjectMembership,
  ApprovalRequest,
  Quota,
  Deployment,
  Domain,
  Repository,
  mongoose,
} from '@hellodeploy/database';
import {
  UserStatus,
  ProjectStatus,
  ApprovalStatus,
  AuditOutcome,
  QuotaScope,
  JobType,
  DeploymentStatus,
  DomainStatus,
} from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { getDeploymentQueue } from '../queue/client.js';
import { isApprovalSnapshotCurrent } from './approval-readiness.service.js';

// ─── Overview ─────────────────────────────────────────────────────────────────

export async function getAdminOverview() {
  const [totalUsers, activeUsers, totalProjects, pendingApprovals, pendingDomainApprovals] =
    await Promise.all([
      User.countDocuments(),
      User.countDocuments({ status: UserStatus.ACTIVE }),
      Project.countDocuments({ status: { $ne: ProjectStatus.ARCHIVED } }),
      ApprovalRequest.countDocuments({ status: ApprovalStatus.PENDING }),
      Domain.countDocuments({ status: DomainStatus.PENDING_ADMIN_APPROVAL }),
    ]);
  return { totalUsers, activeUsers, totalProjects, pendingApprovals, pendingDomainApprovals };
}

// ─── User management ──────────────────────────────────────────────────────────

export async function getUsers({ page = 1, limit = 20, status, search } = {}) {
  const query = {};
  if (status) {
    query.status = status;
  }
  if (search?.trim()) {
    const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
  }
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(query),
  ]);
  return { users, total, page, limit };
}

export async function suspendUser({ userId, adminId, adminRole, reason, sourceIp, correlationId }) {
  const user = await User.findById(userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }
  if (user.status === UserStatus.SUSPENDED) {
    return { success: false, error: 'User is already suspended.' };
  }

  user.status = UserStatus.SUSPENDED;
  user.suspendedAt = new Date();
  user.suspensionReason = reason?.trim() || null;
  user.configVersion += 1;
  await user.save();

  await writeAuditEvent({
    action: 'admin.user_suspended',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'user',
    targetId: userId.toString(),
    sourceIp,
    correlationId,
    metadata: { reason: reason?.trim() || null },
  });

  return { success: true, user };
}

export async function reactivateUser({ userId, adminId, adminRole, sourceIp, correlationId }) {
  const user = await User.findById(userId);
  if (!user) {
    return { success: false, error: 'User not found.' };
  }
  if (user.status !== UserStatus.SUSPENDED) {
    return { success: false, error: 'User is not currently suspended.' };
  }

  user.status = UserStatus.ACTIVE;
  user.suspendedAt = null;
  user.suspensionReason = null;
  user.configVersion += 1;
  await user.save();

  await writeAuditEvent({
    action: 'admin.user_reactivated',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'user',
    targetId: userId.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true, user };
}

// ─── Project management ───────────────────────────────────────────────────────

export async function getProjects({ page = 1, limit = 20, status, search } = {}) {
  const query = {};
  if (status) {
    query.status = status;
  }
  if (search?.trim()) {
    const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    query.$or = [{ name: regex }, { slug: regex }];
  }
  const skip = (page - 1) * limit;
  const [projects, total] = await Promise.all([
    Project.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('ownerId', 'firstName lastName email')
      .lean(),
    Project.countDocuments(query),
  ]);
  return { projects, total, page, limit };
}

export async function adminSuspendProject({
  projectId,
  adminId,
  adminRole,
  reason,
  sourceIp,
  correlationId,
}) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }
  if (project.status === ProjectStatus.SUSPENDED) {
    return { success: false, error: 'Project is already suspended.' };
  }
  if (project.status === ProjectStatus.ARCHIVED) {
    return { success: false, error: 'Cannot suspend an archived project.' };
  }

  project.status = ProjectStatus.SUSPENDED;
  await project.save();

  await writeAuditEvent({
    action: 'admin.project_suspended',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { reason: reason?.trim() || null },
  });

  return { success: true };
}

export async function adminReactivateProject({
  projectId,
  adminId,
  adminRole,
  sourceIp,
  correlationId,
}) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }
  if (project.status !== ProjectStatus.SUSPENDED) {
    return { success: false, error: 'Project is not currently suspended.' };
  }

  project.status = ProjectStatus.ACTIVE;
  project.suspendedAt = null;
  project.suspensionReason = null;
  await project.save();

  await writeAuditEvent({
    action: 'admin.project_reactivated',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
  });

  return { success: true, project };
}

// ─── Queue management ─────────────────────────────────────────────────────────

export async function pauseQueue(adminId, adminRole, opts = {}) {
  const queue = getDeploymentQueue();
  if (!queue) {
    return { success: false, error: 'Queue unavailable.' };
  }
  await queue.pause();
  await writeAuditEvent({
    action: 'admin.queue_paused',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
  });
  return { success: true };
}

export async function resumeQueue(adminId, adminRole, opts = {}) {
  const queue = getDeploymentQueue();
  if (!queue) {
    return { success: false, error: 'Queue unavailable.' };
  }
  await queue.resume();
  await writeAuditEvent({
    action: 'admin.queue_resumed',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
  });
  return { success: true };
}

// ─── Quota management ─────────────────────────────────────────────────────────

export async function setQuotaOverride({
  scopeType,
  scopeId,
  limits,
  adminId,
  adminRole,
  reason,
  sourceIp,
  correlationId,
}) {
  if (!Object.values(QuotaScope).includes(scopeType)) {
    return { success: false, error: 'Invalid quota scope type.' };
  }

  const allowedLimits = [
    'maxOwnedProjects',
    'maxRunningApps',
    'maxProjectMembers',
    'memoryMb',
    'cpuCores',
    'deploymentsPerMonth',
    'buildTimeoutSeconds',
    'maxCustomDomains',
    'maxRollbackReleases',
    'logRetentionDays',
  ];
  const cleanLimits = {};
  for (const key of allowedLimits) {
    if (limits[key] === undefined) {
      continue;
    }
    if (!Number.isFinite(limits[key]) || limits[key] < 0) {
      return { success: false, error: `Invalid quota value for ${key}.` };
    }
    cleanLimits[key] = limits[key];
  }

  const quota = await Quota.findOneAndUpdate(
    { scopeType, scopeId },
    { $set: { ...cleanLimits, createdBy: adminId, reason: reason?.trim() || null } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await writeAuditEvent({
    action: 'admin.quota_updated',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: scopeType.toLowerCase(),
    targetId: scopeId?.toString(),
    sourceIp,
    correlationId,
    metadata: { scopeType, limits: Object.keys(cleanLimits) },
  });

  return { success: true, quota };
}

export async function getQuotaOverride(scopeType, scopeId) {
  return Quota.findOne({ scopeType, scopeId }).lean();
}

/**
 * Resolve a quota scope to a human-readable label for display.
 * Falls back to null when the scope type is unrecognized or the underlying
 * record no longer exists — callers should show the raw ID in that case.
 */
export async function getQuotaScopeName(scopeType, scopeId) {
  if (scopeType === QuotaScope.USER) {
    const user = await User.findById(scopeId).select('firstName lastName email').lean();
    return user ? `${user.firstName} ${user.lastName} (${user.email})` : null;
  }
  if (scopeType === QuotaScope.PROJECT) {
    const project = await Project.findById(scopeId).select('name slug').lean();
    return project ? `${project.name} (${project.slug})` : null;
  }
  return null;
}

export async function getQuotaConsumption(scopeType, scopeId) {
  if (scopeType === QuotaScope.USER) {
    const projects = await Project.find({
      ownerId: scopeId,
      status: { $ne: ProjectStatus.ARCHIVED },
    })
      .select('_id')
      .lean();
    const projectIds = projects.map((project) => project._id);
    const [ownedProjects, runningApps, customDomains] = await Promise.all([
      Project.countDocuments({ ownerId: scopeId, status: { $ne: ProjectStatus.ARCHIVED } }),
      Deployment.countDocuments({
        projectId: { $in: projectIds },
        status: DeploymentStatus.HEALTHY,
        activeContainerId: { $ne: null },
      }),
      Domain.countDocuments({
        projectId: { $in: projectIds },
        status: { $ne: DomainStatus.REMOVED },
      }),
    ]);
    return { ownedProjects, runningApps, customDomains };
  }

  if (scopeType === QuotaScope.PROJECT) {
    const [runningApps, projectMembers, customDomains] = await Promise.all([
      Deployment.countDocuments({
        projectId: scopeId,
        status: DeploymentStatus.HEALTHY,
        activeContainerId: { $ne: null },
      }),
      ProjectMembership.countDocuments({ projectId: scopeId }),
      Domain.countDocuments({ projectId: scopeId, status: { $ne: DomainStatus.REMOVED } }),
    ]);
    return { runningApps, projectMembers, customDomains };
  }

  return {};
}

// ─── Suspend project with nginx maintenance ────────────────────────────────────

/**
 * Suspend a project AND enqueue a STOP_PROJECT job to shut down its container
 * and replace nginx with a maintenance block.
 */
export async function adminSuspendProjectWithStop({
  projectId,
  adminId,
  adminRole,
  reason,
  sourceIp,
  correlationId,
}) {
  const project = await Project.findById(projectId);
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }
  if (project.status === ProjectStatus.SUSPENDED) {
    return { success: false, error: 'Already suspended.' };
  }
  if (project.status === ProjectStatus.ARCHIVED) {
    return { success: false, error: 'Cannot suspend an archived project.' };
  }

  project.status = ProjectStatus.SUSPENDED;
  project.suspendedAt = new Date();
  project.suspensionReason = reason?.trim() || null;
  await project.save();

  const queue = getDeploymentQueue();
  if (queue) {
    await enqueueJob(
      queue,
      JobType.STOP_PROJECT,
      {
        version: 1,
        correlationId,
        actorId: adminId,
        actorRole: adminRole,
        projectId: projectId.toString(),
        reason: reason?.trim() || 'Suspended by administrator.',
      },
      { jobId: `stop-${projectId}` },
    );
  }

  await writeAuditEvent({
    action: 'admin.project_suspended',
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'project',
    targetId: projectId.toString(),
    sourceIp,
    correlationId,
    metadata: { reason: reason?.trim() || null },
  });

  return { success: true, project };
}

// ─── Approval requests ────────────────────────────────────────────────────────

export async function getApprovalRequests({ page = 1, limit = 20, status } = {}) {
  const query = status ? { status } : { status: ApprovalStatus.PENDING };
  const skip = (page - 1) * limit;
  const [requests, total] = await Promise.all([
    ApprovalRequest.find(query)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'projectId',
        select:
          'name slug status ownerId repositoryId productionBranch runtimeType deploymentMode buildConfiguration configurationVersion detection',
        populate: [
          { path: 'ownerId', select: 'firstName lastName email' },
          { path: 'repositoryId', select: 'fullName accessStatus lastCommitSha sourceType' },
        ],
      })
      .populate('requestedBy', 'firstName lastName email')
      .lean(),
    ApprovalRequest.countDocuments(query),
  ]);
  return {
    requests: requests.map((request) => {
      const project = request.projectId;
      const repository = project?.repositoryId ?? null;
      const snapshot = project
        ? isApprovalSnapshotCurrent({ request, project, repository })
        : {
            isCurrent: false,
            hasSnapshot: false,
            readiness: { isReady: false, findings: [] },
          };
      return {
        ...request,
        snapshotState: {
          isCurrent: snapshot.isCurrent,
          hasSnapshot: snapshot.hasSnapshot,
        },
        currentFindings: snapshot.readiness.findings,
      };
    }),
    total,
    page,
    limit,
  };
}

export async function reviewApprovalRequest({
  requestId,
  decision,
  note,
  adminId,
  adminRole,
  sourceIp,
  correlationId,
}) {
  const allowed = [ApprovalStatus.APPROVED, ApprovalStatus.CHANGES_REQUESTED];
  if (!allowed.includes(decision)) {
    return { success: false, error: 'Invalid decision.' };
  }

  const normalizedNote = note?.trim() ?? '';
  if (normalizedNote.length > 1000) {
    return { success: false, error: 'The note must be 1000 characters or fewer.' };
  }
  if (decision === ApprovalStatus.CHANGES_REQUESTED && !normalizedNote) {
    return { success: false, error: 'Explain what the project owner needs to change.' };
  }

  const session = await mongoose.startSession();
  let result = { success: false, error: 'This request could not be reviewed.' };
  let reviewedProjectId = null;
  try {
    await session.withTransaction(async () => {
      const request = await ApprovalRequest.findOne({
        _id: requestId,
        status: ApprovalStatus.PENDING,
      }).session(session);
      if (!request) {
        const exists = await ApprovalRequest.exists({ _id: requestId }).session(session);
        result = {
          success: false,
          error: exists ? 'This request is no longer pending.' : 'Request not found.',
        };
        return;
      }
      reviewedProjectId = request.projectId.toString();

      if (decision === ApprovalStatus.APPROVED) {
        const project = await Project.findById(request.projectId).session(session);
        if (!project) {
          result = {
            success: false,
            error: 'The project no longer exists. Request changes to close this request.',
          };
          return;
        }
        if (project.status !== ProjectStatus.DRAFT) {
          result = { success: false, error: 'Only draft projects can be approved.' };
          return;
        }
        const repository = project.repositoryId
          ? await Repository.findById(project.repositoryId).session(session)
          : null;
        const snapshot = isApprovalSnapshotCurrent({ request, project, repository });
        if (!snapshot.hasSnapshot) {
          result = {
            success: false,
            error: 'This legacy request must be returned and resubmitted before approval.',
          };
          return;
        }
        if (!snapshot.isCurrent) {
          result = {
            success: false,
            error:
              'The repository, application check, or project settings changed after submission. Request changes so the owner can check and resubmit.',
          };
          return;
        }

        const activated = await Project.updateOne(
          { _id: project._id, status: ProjectStatus.DRAFT },
          { $set: { status: ProjectStatus.ACTIVE } },
          { session },
        );
        if (activated.modifiedCount !== 1) {
          result = { success: false, error: 'The project changed while it was being reviewed.' };
          return;
        }
      }

      const reviewed = await ApprovalRequest.updateOne(
        { _id: request._id, status: ApprovalStatus.PENDING },
        {
          $set: {
            status: decision,
            reviewedBy: adminId,
            reviewedAt: new Date(),
            adminNote: normalizedNote || null,
          },
        },
        { session },
      );
      result =
        reviewed.modifiedCount === 1
          ? { success: true }
          : { success: false, error: 'This request is no longer pending.' };
      if (!result.success) {
        const conflict = new Error(result.error);
        conflict.code = 'APPROVAL_DECISION_CONFLICT';
        throw conflict;
      }
    });
  } catch (err) {
    if (err.code !== 'APPROVAL_DECISION_CONFLICT') {
      throw err;
    }
  } finally {
    await session.endSession();
  }

  if (!result.success) {
    return result;
  }
  await writeAuditEvent({
    action: `admin.approval_request.${decision.toLowerCase()}`,
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'approval_request',
    targetId: requestId.toString(),
    sourceIp,
    correlationId,
    metadata: { projectId: reviewedProjectId, decision },
  });

  return result;
}
