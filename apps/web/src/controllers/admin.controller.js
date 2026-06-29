import { asyncHandler } from '../utils/async-handler.js';
import { ApprovalStatus } from '@hellodeploy/contracts';
import {
  getAdminOverview,
  getUsers,
  suspendUser,
  reactivateUser,
  getProjects,
  adminSuspendProject,
  adminSuspendProjectWithStop,
  adminReactivateProject,
  getApprovalRequests,
  reviewApprovalRequest,
  pauseQueue,
  resumeQueue,
  setQuotaOverride,
  getQuotaOverride,
} from '../services/admin.service.js';
import { collectServerStats } from '../services/server-stats.service.js';
import { searchAuditEvents } from '../services/audit-search.service.js';

// ─── Overview ──────────────────────────────────────────────────────────────────

export const getAdminIndex = asyncHandler(async (req, res) => {
  const [stats, server] = await Promise.all([
    getAdminOverview(),
    collectServerStats(),
  ]);
  res.render('pages/admin/index', {
    title: 'Admin Overview',
    stats,
    server,
  });
});

// ─── Server dashboard ──────────────────────────────────────────────────────────

export const getAdminServer = asyncHandler(async (req, res) => {
  const server = await collectServerStats();
  res.render('pages/admin/server', {
    title: 'Server & Queue',
    server,
  });
});

export const postPauseQueue = asyncHandler(async (req, res) => {
  const result = await pauseQueue(req.session.user.id, req.session.user.platformRole, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  if (!result.success) req.flash('error', result.error);
  else req.flash('success', 'Deployment queue paused. No new jobs will start until resumed.');
  res.redirect('/admin/server');
});

export const postResumeQueue = asyncHandler(async (req, res) => {
  const result = await resumeQueue(req.session.user.id, req.session.user.platformRole, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  if (!result.success) req.flash('error', result.error);
  else req.flash('success', 'Deployment queue resumed.');
  res.redirect('/admin/server');
});

// ─── Audit events ──────────────────────────────────────────────────────────────

export const getAdminAuditEvents = asyncHandler(async (req, res) => {
  const { action, actorId, targetType, outcome, from, to, page } = req.query;

  const result = await searchAuditEvents({
    action,
    actorId,
    targetType,
    outcome,
    from,
    to,
    page: Math.max(1, parseInt(page) || 1),
    limit: 50,
  });

  res.render('pages/admin/audit-events', {
    title: 'Audit Events',
    ...result,
    filters: { action: action ?? '', actorId: actorId ?? '', targetType: targetType ?? '', outcome: outcome ?? '', from: from ?? '', to: to ?? '' },
  });
});

// ─── Quota management ──────────────────────────────────────────────────────────

export const getAdminQuota = asyncHandler(async (req, res) => {
  const { scopeType, scopeId } = req.params;
  const quota = await getQuotaOverride(scopeType, scopeId);
  res.render('pages/admin/quota', {
    title: 'Quota Override',
    quota,
    scopeType,
    scopeId,
  });
});

export const postAdminSetQuota = asyncHandler(async (req, res) => {
  const { scopeType, scopeId } = req.params;
  const {
    maxOwnedProjects, maxRunningApps, maxProjectMembers,
    memoryMb, cpuCores, deploymentsPerMonth, buildTimeoutSeconds,
    maxCustomDomains, maxRollbackReleases, logRetentionDays, reason,
  } = req.body;

  const limits = {};
  const numericFields = { maxOwnedProjects, maxRunningApps, maxProjectMembers, memoryMb, deploymentsPerMonth, buildTimeoutSeconds, maxCustomDomains, maxRollbackReleases, logRetentionDays };
  const floatFields = { cpuCores };

  for (const [k, v] of Object.entries(numericFields)) {
    if (v !== '' && v !== undefined) limits[k] = parseInt(v, 10);
  }
  for (const [k, v] of Object.entries(floatFields)) {
    if (v !== '' && v !== undefined) limits[k] = parseFloat(v);
  }

  const result = await setQuotaOverride({
    scopeType,
    scopeId,
    limits,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    reason,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) req.flash('error', result.error);
  else req.flash('success', 'Quota updated.');

  res.redirect(`/admin/quotas/${scopeType}/${scopeId}`);
});

// ─── Users ─────────────────────────────────────────────────────────────────────

export const getAdminUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const { status, search } = req.query;

  const { users, total, limit } = await getUsers({ page, status, search });

  res.render('pages/admin/users', {
    title: 'Users',
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    filters: { status: status ?? '', search: search ?? '' },
  });
});

export const postSuspendUser = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const result = await suspendUser({
    userId: req.params.userId,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    reason,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'User suspended.');
  }

  res.redirect('/admin/users');
});

export const postReactivateUser = asyncHandler(async (req, res) => {
  const result = await reactivateUser({
    userId: req.params.userId,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'User reactivated.');
  }

  res.redirect('/admin/users');
});

// ─── Projects ──────────────────────────────────────────────────────────────────

export const getAdminProjects = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const { status } = req.query;

  const { projects, total, limit } = await getProjects({ page, status });

  res.render('pages/admin/projects', {
    title: 'All Projects',
    projects,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    filters: { status: status ?? '' },
  });
});

export const postAdminSuspendProject = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const result = await adminSuspendProjectWithStop({
    projectId: req.params.projectId,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    reason,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Project suspended.');
  }

  res.redirect('/admin/projects');
});

export const postAdminReactivateProject = asyncHandler(async (req, res) => {
  const result = await adminReactivateProject({
    projectId: req.params.projectId,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Project reactivated.');
  }

  res.redirect('/admin/projects');
});

// ─── Approval requests ─────────────────────────────────────────────────────────

export const getApprovalRequestsList = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const { requests, total, limit } = await getApprovalRequests({ page });

  res.render('pages/admin/approval-requests', {
    title: 'Approval Requests',
    requests,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

export const postReviewApprovalRequest = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  const allowed = [ApprovalStatus.APPROVED, ApprovalStatus.REJECTED];

  if (!allowed.includes(decision)) {
    req.flash('error', 'Invalid decision.');
    return res.redirect('/admin/approval-requests');
  }

  const result = await reviewApprovalRequest({
    requestId: req.params.requestId,
    decision,
    note,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `Request ${decision.toLowerCase()}.`);
  }

  res.redirect('/admin/approval-requests');
});
