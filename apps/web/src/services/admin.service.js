import {
  User,
  Project,
  ProjectMembership,
  ApprovalRequest,
  Quota,
  Deployment,
  Domain,
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

// ─── Overview ─────────────────────────────────────────────────────────────────

export async function getAdminOverview() {
  const [totalUsers, activeUsers, totalProjects, pendingApprovals] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: UserStatus.ACTIVE }),
    Project.countDocuments({ status: { $ne: ProjectStatus.ARCHIVED } }),
    ApprovalRequest.countDocuments({ status: ApprovalStatus.PENDING }),
  ]);
  return { totalUsers, activeUsers, totalProjects, pendingApprovals };
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

  return { success: true };
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

  return { success: true };
}

// ─── Project management ───────────────────────────────────────────────────────

export async function getProjects({ page = 1, limit = 20, status } = {}) {
  const query = {};
  if (status) {
    query.status = status;
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

  return { success: true };
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

  return { success: true };
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
      .populate('projectId', 'name slug status')
      .populate('requestedBy', 'firstName lastName email')
      .lean(),
    ApprovalRequest.countDocuments(query),
  ]);
  return { requests, total, page, limit };
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
  if (!Object.values(ApprovalStatus).includes(decision) || decision === ApprovalStatus.PENDING) {
    return { success: false, error: 'Invalid decision.' };
  }

  const request = await ApprovalRequest.findById(requestId);
  if (!request) {
    return { success: false, error: 'Request not found.' };
  }
  if (request.status !== ApprovalStatus.PENDING) {
    return { success: false, error: 'This request is no longer pending.' };
  }

  request.status = decision;
  request.reviewedBy = adminId;
  request.reviewedAt = new Date();
  request.adminNote = note?.trim() || null;
  await request.save();

  if (decision === ApprovalStatus.APPROVED) {
    await Project.updateOne({ _id: request.projectId }, { $set: { status: ProjectStatus.ACTIVE } });
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
    metadata: { projectId: request.projectId.toString(), decision, note: request.adminNote },
  });

  return { success: true };
}
