import {
  User,
  Project,
  ProjectMembership,
  ApprovalRequest,
  Quota,
  Deployment,
  Domain,
  Repository,
  AuditEvent,
  Notification,
  ProductEvent,
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
  PlatformRole,
} from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { getDeploymentQueue } from '../queue/client.js';
import { isApprovalSnapshotCurrent } from './approval-readiness.service.js';
import { initiatePasswordReset, resendVerificationEmail } from './auth.service.js';
import { deleteProject } from './project.service.js';

const ADMIN_SEARCH_MAX_LENGTH = 200;

function normalizeAdminSearch(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, ADMIN_SEARCH_MAX_LENGTH);
}

function allowlistedStatus(value, statuses) {
  return typeof value === 'string' && Object.values(statuses).includes(value) ? value : null;
}

function escapedSearchRegex(value) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

// ─── Overview ─────────────────────────────────────────────────────────────────

export async function getAdminOverview() {
  const [
    totalUsers,
    activeUsers,
    totalProjects,
    pendingApprovals,
    pendingDomainApprovals,
    recentActivity,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ status: UserStatus.ACTIVE }),
    Project.countDocuments({ status: { $ne: ProjectStatus.ARCHIVED } }),
    ApprovalRequest.countDocuments({ status: ApprovalStatus.PENDING }),
    Domain.countDocuments({ status: DomainStatus.PENDING_ADMIN_APPROVAL }),
    AuditEvent.find({ action: /^admin\./ })
      .select('action outcome targetType createdAt')
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
  ]);
  return {
    totalUsers,
    activeUsers,
    totalProjects,
    pendingApprovals,
    pendingDomainApprovals,
    recentActivity,
  };
}

// ─── User management ──────────────────────────────────────────────────────────

export async function getUsers({ page = 1, limit = 20, status, role, search } = {}) {
  const query = {};
  const safeStatus = allowlistedStatus(status, UserStatus);
  if (safeStatus) {
    query.status = { $eq: safeStatus };
  }
  const safeRole = allowlistedStatus(role, PlatformRole);
  if (safeRole) {
    query.platformRole = { $eq: safeRole };
  }
  const safeSearch = normalizeAdminSearch(search);
  if (safeSearch) {
    const regex = escapedSearchRegex(safeSearch);
    query.$or = [{ firstName: regex }, { lastName: regex }, { email: regex }];
  }
  const skip = (page - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(query),
  ]);
  return { users, total, page, limit };
}

export async function getUserDetail(userId) {
  const user = await User.findById(userId).select('+passwordHash').lean();
  if (!user) {
    return null;
  }
  const { passwordHash, ...profile } = user;

  const [ownedProjects, memberships, recentActivity] = await Promise.all([
    Project.find({ ownerId: userId })
      .select('name slug status createdAt')
      .sort({ createdAt: -1 })
      .lean(),
    ProjectMembership.find({ userId })
      .populate({ path: 'projectId', model: 'Project', select: 'name slug status ownerId' })
      .lean(),
    AuditEvent.find({
      $or: [{ targetType: 'user', targetId: userId.toString() }, { actorId: userId }],
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
  ]);

  const memberProjects = memberships
    .filter((m) => m.projectId && m.projectId.ownerId?.toString() !== userId.toString())
    .map((m) => ({ ...m.projectId, memberRole: m.role }));

  return {
    user: profile,
    hasPassword: Boolean(passwordHash),
    hasGoogle: Boolean(user.googleSubject),
    isLocked: Boolean(user.lockedUntil && user.lockedUntil > new Date()),
    ownedProjects,
    memberProjects,
    recentActivity,
  };
}

/**
 * Which accounts an admin may act on. Returns an error message, or null when allowed.
 *
 * Admins moderate users; only a Super Admin moderates admins. Super Admin
 * accounts are untouchable except for a role change by another Super Admin,
 * so an account must be demoted before it can be suspended or deleted. Acting
 * on yourself is refused outright; with that rule a Super Admin can never
 * demote the last Super Admin, because the actor always remains one.
 */
function manageUserError({ adminId, adminRole, target, isRoleChange = false }) {
  if (target._id.toString() === adminId?.toString()) {
    return 'You cannot perform this action on your own account.';
  }
  if (target.platformRole === PlatformRole.SUPER_ADMIN) {
    if (isRoleChange && adminRole === PlatformRole.SUPER_ADMIN) {
      return null;
    }
    return 'Super Admin accounts must be demoted before they can be managed.';
  }
  if (target.platformRole === PlatformRole.ADMIN && adminRole !== PlatformRole.SUPER_ADMIN) {
    return 'Only a Super Admin can manage administrator accounts.';
  }
  return null;
}

async function findManageableUser({ userId, adminId, adminRole, isRoleChange, select }) {
  const query = User.findById(userId);
  if (select) {
    query.select(select);
  }
  const user = await query;
  if (!user) {
    return { error: 'User not found.' };
  }
  const error = manageUserError({ adminId, adminRole, target: user, isRoleChange });
  return error ? { error } : { user };
}

function auditUserAction(
  action,
  { userId, adminId, adminRole, sourceIp, correlationId },
  metadata,
) {
  return writeAuditEvent({
    action,
    outcome: AuditOutcome.SUCCESS,
    actorId: adminId,
    actorRole: adminRole,
    targetType: 'user',
    targetId: userId.toString(),
    sourceIp,
    correlationId,
    metadata,
  });
}

/**
 * Delete a user's server-side sessions so a suspension takes effect at once.
 *
 * `requireAuth` reads status from the session's own copy of the user rather than
 * the record, so suspending alone leaves every signed-in browser working. The
 * cookie is rolling, so an active tab renews it indefinitely and the suspension
 * never lands. Dropping the stored sessions is what ends access.
 *
 * Returns the number of sessions removed; a store that is not reachable is not
 * allowed to fail the suspension itself.
 */
async function revokeUserSessions(userId) {
  const collection = mongoose.connection.db?.collection('sessions');
  if (!collection) {
    return 0;
  }

  // connect-mongo serialises the session to a JSON string, so the user id is
  // matched inside it. An ObjectId's hex carries no regex metacharacters, and
  // normalising through ObjectId keeps anything else out of the pattern.
  const id = new mongoose.Types.ObjectId(String(userId)).toString();
  const { deletedCount } = await collection.deleteMany({
    session: { $regex: `"id":"${id}"` },
  });
  return deletedCount ?? 0;
}

const SUSPENDABLE_STATUSES = [UserStatus.ACTIVE, UserStatus.PENDING_VERIFICATION];

export async function suspendUser({ userId, adminId, adminRole, reason, sourceIp, correlationId }) {
  const { user, error } = await findManageableUser({ userId, adminId, adminRole });
  if (error) {
    return { success: false, error };
  }
  if (user.status === UserStatus.SUSPENDED) {
    return { success: false, error: 'User is already suspended.' };
  }
  if (!SUSPENDABLE_STATUSES.includes(user.status)) {
    return { success: false, error: 'Only active or pending accounts can be suspended.' };
  }

  user.status = UserStatus.SUSPENDED;
  user.suspendedAt = new Date();
  user.suspensionReason = reason?.trim() || null;
  user.configVersion += 1;
  await user.save();

  const revokedSessions = await revokeUserSessions(userId);

  await auditUserAction(
    'admin.user_suspended',
    { userId, adminId, adminRole, sourceIp, correlationId },
    { reason: reason?.trim() || null, revokedSessions },
  );

  return { success: true, user };
}

export async function reactivateUser({ userId, adminId, adminRole, sourceIp, correlationId }) {
  const { user, error } = await findManageableUser({ userId, adminId, adminRole });
  if (error) {
    return { success: false, error };
  }
  if (user.status !== UserStatus.SUSPENDED) {
    return { success: false, error: 'User is not currently suspended.' };
  }

  // A user suspended before verifying their email goes back to pending, not
  // active, so reactivation cannot be used to skip verification.
  user.status = user.emailVerifiedAt ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION;
  user.suspendedAt = null;
  user.suspensionReason = null;
  user.configVersion += 1;
  await user.save();

  await auditUserAction('admin.user_reactivated', {
    userId,
    adminId,
    adminRole,
    sourceIp,
    correlationId,
  });

  return { success: true, user };
}

export async function forceSignOutUser({ userId, adminId, adminRole, sourceIp, correlationId }) {
  const { user, error } = await findManageableUser({ userId, adminId, adminRole });
  if (error) {
    return { success: false, error };
  }

  const revokedSessions = await revokeUserSessions(userId);

  await auditUserAction(
    'admin.user_signed_out',
    { userId, adminId, adminRole, sourceIp, correlationId },
    { revokedSessions },
  );

  return { success: true, user, revokedSessions };
}

export async function unlockUser({ userId, adminId, adminRole, sourceIp, correlationId }) {
  const { user, error } = await findManageableUser({ userId, adminId, adminRole });
  if (error) {
    return { success: false, error };
  }

  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  await user.save();

  await auditUserAction('admin.user_unlocked', {
    userId,
    adminId,
    adminRole,
    sourceIp,
    correlationId,
  });

  return { success: true, user };
}

export async function markEmailVerified({ userId, adminId, adminRole, sourceIp, correlationId }) {
  const { user, error } = await findManageableUser({ userId, adminId, adminRole });
  if (error) {
    return { success: false, error };
  }
  if (user.status !== UserStatus.PENDING_VERIFICATION) {
    return { success: false, error: 'This account is not awaiting email verification.' };
  }

  user.status = UserStatus.ACTIVE;
  user.emailVerifiedAt = new Date();
  user.emailVerificationTokenHash = null;
  user.emailVerificationExpiresAt = null;
  await user.save();

  await auditUserAction('admin.user_email_verified', {
    userId,
    adminId,
    adminRole,
    sourceIp,
    correlationId,
  });

  return { success: true, user };
}

export async function resendUserVerification(
  { userId, adminId, adminRole, sourceIp, correlationId },
  deps = {},
) {
  const resend = deps.resendVerificationEmail ?? resendVerificationEmail;
  const { user, error } = await findManageableUser({ userId, adminId, adminRole });
  if (error) {
    return { success: false, error };
  }
  if (user.status !== UserStatus.PENDING_VERIFICATION) {
    return { success: false, error: 'This account is not awaiting email verification.' };
  }

  await resend({ email: user.email, sourceIp, correlationId });

  await auditUserAction('admin.user_verification_resent', {
    userId,
    adminId,
    adminRole,
    sourceIp,
    correlationId,
  });

  return { success: true, user };
}

export async function sendUserPasswordReset(
  { userId, adminId, adminRole, sourceIp, correlationId },
  deps = {},
) {
  const initiate = deps.initiatePasswordReset ?? initiatePasswordReset;
  const { user, error } = await findManageableUser({
    userId,
    adminId,
    adminRole,
    select: '+passwordHash',
  });
  if (error) {
    return { success: false, error };
  }
  // initiatePasswordReset is deliberately silent for ineligible accounts, so
  // the admin would see "sent" for an email that never goes out.
  if (!user.passwordHash) {
    return { success: false, error: 'This account signs in with Google and has no password.' };
  }
  if (user.status !== UserStatus.ACTIVE) {
    return { success: false, error: 'Password resets can only be sent to active accounts.' };
  }

  const delivery = await initiate({ email: user.email, sourceIp, correlationId });
  if (!delivery?.delivered) {
    return {
      success: false,
      error: 'The password reset email could not be sent. Try again later.',
    };
  }

  await auditUserAction('admin.user_password_reset_sent', {
    userId,
    adminId,
    adminRole,
    sourceIp,
    correlationId,
  });

  return { success: true, user };
}

export async function changeUserRole({
  userId,
  newRole,
  adminId,
  adminRole,
  sourceIp,
  correlationId,
}) {
  if (adminRole !== PlatformRole.SUPER_ADMIN) {
    return { success: false, error: 'Only a Super Admin can change platform roles.' };
  }
  const role = allowlistedStatus(newRole, PlatformRole);
  if (!role) {
    return { success: false, error: 'Invalid role.' };
  }
  const { user, error } = await findManageableUser({
    userId,
    adminId,
    adminRole,
    isRoleChange: true,
  });
  if (error) {
    return { success: false, error };
  }
  const previousRole = user.platformRole;
  if (previousRole === role) {
    return { success: false, error: `User already has the ${role} role.` };
  }

  user.platformRole = role;
  user.configVersion += 1;
  await user.save();

  // The session carries its own copy of the role, so without this a demoted
  // admin keeps admin access until they sign out.
  const revokedSessions = await revokeUserSessions(userId);

  await auditUserAction(
    'admin.user_role_changed',
    { userId, adminId, adminRole, sourceIp, correlationId },
    { from: previousRole, to: role, revokedSessions },
  );

  return { success: true, user };
}

/**
 * Permanently delete a user, every project they own, and their memberships.
 *
 * Project teardown runs through deleteProject, which needs the worker queue, so
 * the account is suspended and signed out first. If a project fails to delete
 * part-way, the account is left suspended rather than half-deleted, and a retry
 * picks up the projects that remain. Audit events are kept as history.
 */
export async function deleteUserPermanently(
  { userId, confirmEmail, adminId, adminRole, sourceIp, correlationId },
  deps = {},
) {
  const removeProject = deps.deleteProject ?? deleteProject;
  const getQueue = deps.getDeploymentQueue ?? getDeploymentQueue;

  if (adminRole !== PlatformRole.SUPER_ADMIN) {
    return { success: false, error: 'Only a Super Admin can delete accounts.' };
  }
  const { user, error } = await findManageableUser({ userId, adminId, adminRole });
  if (error) {
    return { success: false, error };
  }
  if (typeof confirmEmail !== 'string' || confirmEmail.trim().toLowerCase() !== user.email) {
    return { success: false, error: 'The confirmation email did not match. Nothing was deleted.' };
  }

  const ownedProjects = await Project.find({ ownerId: userId }).select('_id slug').lean();
  if (ownedProjects.length > 0 && !getQueue()) {
    return {
      success: false,
      error:
        'Account deletion is temporarily unavailable because the deployment worker queue is offline.',
    };
  }

  if (user.status !== UserStatus.SUSPENDED) {
    user.status = UserStatus.SUSPENDED;
    user.suspendedAt = new Date();
    user.suspensionReason = 'Account deletion in progress.';
    user.configVersion += 1;
    await user.save();
  }
  await revokeUserSessions(userId);

  const deletedProjects = [];
  for (const project of ownedProjects) {
    const result = await removeProject(
      { projectId: project._id, actorId: adminId, sourceIp, correlationId },
      { getDeploymentQueue: getQueue, enqueueJob: deps.enqueueJob ?? enqueueJob },
    );
    if (!result.success) {
      return {
        success: false,
        error: `Could not delete project "${project.slug}": ${result.error} The account is suspended; retry to finish.`,
        deletedProjects,
      };
    }
    deletedProjects.push(project.slug);
  }

  await Promise.all([
    ProjectMembership.deleteMany({ userId }),
    Notification.deleteMany({ userId }),
    Quota.deleteMany({ scopeType: QuotaScope.USER, scopeId: userId }),
    ProductEvent.updateMany({ userId }, { $set: { userId: null } }),
  ]);
  await User.deleteOne({ _id: userId });

  // The user record is gone, so the audit row is the only place their identity survives.
  await auditUserAction(
    'admin.user_deleted',
    { userId, adminId, adminRole, sourceIp, correlationId },
    { email: user.email, name: `${user.firstName} ${user.lastName}`, deletedProjects },
  );

  return { success: true, user, deletedProjects };
}

// ─── Project management ───────────────────────────────────────────────────────

export async function getProjects({ page = 1, limit = 20, status, search } = {}) {
  const query = {};
  const safeStatus = allowlistedStatus(status, ProjectStatus);
  if (safeStatus) {
    query.status = { $eq: safeStatus };
  }
  const safeSearch = normalizeAdminSearch(search);
  if (safeSearch) {
    const regex = escapedSearchRegex(safeSearch);
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
export async function adminSuspendProjectWithStop(
  { projectId, adminId, adminRole, reason, sourceIp, correlationId },
  deps = {},
) {
  const getQueue = deps.getDeploymentQueue ?? getDeploymentQueue;
  const addJob = deps.enqueueJob ?? enqueueJob;
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

  const queue = getQueue();
  if (queue) {
    await addJob(
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
