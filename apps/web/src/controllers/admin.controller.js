import { asyncHandler } from '../utils/async-handler.js';
import { ApprovalStatus } from '@hellodeploy/contracts';
import { AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import {
  getAdminOverview,
  getUsers,
  suspendUser,
  reactivateUser,
  getProjects,
  adminSuspendProjectWithStop,
  adminReactivateProject,
  getApprovalRequests,
  reviewApprovalRequest,
  pauseQueue,
  resumeQueue,
  setQuotaOverride,
  getQuotaOverride,
  getQuotaConsumption,
} from '../services/admin.service.js';
import { collectServerStats } from '../services/server-stats.service.js';
import { exportAuditEvents, searchAuditEvents } from '../services/audit-search.service.js';
import { getMaintenanceMode, setMaintenanceMode } from '../services/platform-settings.service.js';
import { validateSetQuota } from '../validators/admin.validator.js';

// ─── Overview ──────────────────────────────────────────────────────────────────

export const getAdminIndex = asyncHandler(async (req, res) => {
  const [stats, server] = await Promise.all([getAdminOverview(), collectServerStats()]);
  res.render('pages/admin/index', {
    title: 'Admin Overview',
    stats,
    server,
  });
});

// ─── Server dashboard ──────────────────────────────────────────────────────────

export const getAdminServer = asyncHandler(async (req, res) => {
  const [server, maintenance] = await Promise.all([collectServerStats(), getMaintenanceMode()]);
  res.render('pages/admin/server', {
    title: 'Server & Queue',
    server,
    maintenance,
  });
});

export const postPauseQueue = asyncHandler(async (req, res) => {
  const result = await pauseQueue(req.session.user.id, req.session.user.platformRole, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Deployment queue paused. No new jobs will start until resumed.');
  }
  res.redirect('/admin/server');
});

export const postResumeQueue = asyncHandler(async (req, res) => {
  const result = await resumeQueue(req.session.user.id, req.session.user.platformRole, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Deployment queue resumed.');
  }
  res.redirect('/admin/server');
});

export const postEnableMaintenance = asyncHandler(async (req, res) => {
  const result = await setMaintenanceMode({
    enabled: true,
    message: req.body.message,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  req.flash(
    result.success ? 'success' : 'error',
    result.success ? 'Maintenance mode enabled.' : result.error,
  );
  res.redirect('/admin/server');
});

export const postDisableMaintenance = asyncHandler(async (req, res) => {
  const result = await setMaintenanceMode({
    enabled: false,
    message: null,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  req.flash(
    result.success ? 'success' : 'error',
    result.success ? 'Maintenance mode disabled.' : result.error,
  );
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
    filters: {
      action: action ?? '',
      actorId: actorId ?? '',
      targetType: targetType ?? '',
      outcome: outcome ?? '',
      from: from ?? '',
      to: to ?? '',
    },
  });
});

function csvCell(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export const getAdminAuditExport = asyncHandler(async (req, res) => {
  const { action, actorId, targetType, outcome, from, to } = req.query;
  const events = await exportAuditEvents({ action, actorId, targetType, outcome, from, to });

  await writeAuditEvent({
    action: 'admin.audit_events_exported',
    outcome: AuditOutcome.SUCCESS,
    actorId: req.session.user.id,
    actorRole: req.session.user.platformRole,
    targetType: 'audit_events',
    sourceIp: req.ip,
    correlationId: req.correlationId,
    metadata: { count: events.length, filters: { action, actorId, targetType, outcome, from, to } },
  });

  const header = [
    'createdAt',
    'action',
    'outcome',
    'actorId',
    'actorRole',
    'targetType',
    'targetId',
    'correlationId',
  ];
  const rows = events.map((event) =>
    [
      event.createdAt?.toISOString?.() ?? event.createdAt,
      event.action,
      event.outcome,
      event.actorId?.toString?.() ?? event.actorId,
      event.actorRole,
      event.targetType,
      event.targetId,
      event.correlationId,
    ]
      .map(csvCell)
      .join(','),
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="hellodeploy-audit-events.csv"');
  res.send(`${header.map(csvCell).join(',')}\n${rows.join('\n')}\n`);
});

// ─── Quota management ──────────────────────────────────────────────────────────

export const getAdminQuota = asyncHandler(async (req, res) => {
  const { scopeType, scopeId } = req.params;
  const [quota, consumption] = await Promise.all([
    getQuotaOverride(scopeType, scopeId),
    getQuotaConsumption(scopeType, scopeId),
  ]);
  res.render('pages/admin/quota', {
    title: 'Quota Override',
    quota,
    consumption,
    scopeType,
    scopeId,
  });
});

export const postAdminSetQuota = asyncHandler(async (req, res) => {
  const { scopeType, scopeId } = req.params;
  const { reason } = req.body;

  const { errors, hasErrors, limits } = validateSetQuota(req.body);
  if (hasErrors) {
    const [quota, consumption] = await Promise.all([
      getQuotaOverride(scopeType, scopeId),
      getQuotaConsumption(scopeType, scopeId),
    ]);
    return res.status(400).render('pages/admin/quota', {
      title: 'Quota Override',
      quota: { ...quota, ...req.body },
      consumption,
      scopeType,
      scopeId,
      errors,
    });
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

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Quota updated.');
  }

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
