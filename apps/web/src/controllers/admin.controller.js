import { asyncHandler } from '../utils/async-handler.js';
import { ApprovalStatus } from '@hellodeploy/contracts';
import { AuditOutcome } from '@hellodeploy/contracts';
import { writeAuditEvent } from '@hellodeploy/observability';
import {
  getAdminOverview,
  getUsers,
  getUserDetail,
  suspendUser,
  reactivateUser,
  forceSignOutUser,
  unlockUser,
  markEmailVerified,
  resendUserVerification,
  sendUserPasswordReset,
  changeUserRole,
  deleteUserPermanently,
  getProjects,
  adminSuspendProjectWithStop,
  adminReactivateProject,
  ApprovalQueueView,
  getApprovalRequests,
  reviewApprovalRequest,
  reviewProvisionalApproval,
  updateUserApprovalTrust,
  pauseQueue,
  resumeQueue,
  setQuotaOverride,
  getQuotaPageData,
} from '../services/admin.service.js';
import { collectServerStats } from '../services/server-stats.service.js';
import {
  AUDIT_PERIODS,
  AUDIT_RETENTION_DAYS,
  exportAuditEvents,
  getAuditFilterOptions,
  searchAuditEvents,
  toActionLabel,
} from '../services/audit-search.service.js';
import { getMaintenanceMode, setMaintenanceMode } from '../services/platform-settings.service.js';
import { env } from '../config/env.js';
import { PROVISIONAL_APPROVAL_DELAY_MS } from '../services/provisional-approval.service.js';
import { validateSetQuota } from '../validators/admin.validator.js';
import { getUxMetrics } from '../services/product-analytics.service.js';
import { isSafeReturnPath } from '../utils/safe-redirect.js';

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

export const getAdminUxMetrics = asyncHandler(async (req, res) => {
  const metrics = await getUxMetrics(req.query.days);
  res.render('pages/admin/ux-metrics', {
    title: 'UX Metrics',
    metrics,
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

const AUDIT_FILTER_NAMES = [
  'action',
  'actor',
  'actorId',
  'targetType',
  'correlationId',
  'outcome',
  'period',
  'from',
  'to',
];

// Only plain strings survive; bracketed query params arrive as objects.
export function readAuditFilters(query) {
  const filters = Object.fromEntries(
    AUDIT_FILTER_NAMES.map((name) => [
      name,
      typeof query[name] === 'string' ? query[name].trim() : '',
    ]),
  );
  // Leaving "Custom range" still submits the date inputs; a chosen period
  // drops them. Links without a period (older ones) keep their dates.
  if (typeof query.period === 'string' && filters.period !== 'custom') {
    filters.from = '';
    filters.to = '';
  }
  return filters;
}

export const getAdminAuditEvents = asyncHandler(async (req, res) => {
  const filters = readAuditFilters(req.query);

  const [result, filterOptions] = await Promise.all([
    searchAuditEvents({
      ...filters,
      page: Math.max(1, parseInt(req.query.page) || 1),
      limit: 50,
    }),
    getAuditFilterOptions(),
  ]);

  res.render('pages/admin/audit-events', {
    title: 'Audit Events',
    ...result,
    filters,
    filterOptions,
    retentionDays: AUDIT_RETENTION_DAYS,
    periods: AUDIT_PERIODS,
    toActionLabel,
  });
});

function csvCell(value) {
  const normalized = value === null || value === undefined ? '' : String(value);
  return `"${normalized.replaceAll('"', '""')}"`;
}

export const getAdminAuditExport = asyncHandler(async (req, res) => {
  const filters = readAuditFilters(req.query);
  const events = await exportAuditEvents(filters);

  await writeAuditEvent({
    action: 'admin.audit_events_exported',
    outcome: AuditOutcome.SUCCESS,
    actorId: req.session.user.id,
    actorRole: req.session.user.platformRole,
    targetType: 'audit_events',
    sourceIp: req.ip,
    correlationId: req.correlationId,
    metadata: { count: events.length, filters },
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
  const page = await getQuotaPageData(scopeType, scopeId);
  if (!page) {
    req.flash('error', 'Quota target not found.');
    return res.redirect('/admin');
  }
  res.render('pages/admin/quota', { title: 'Quota Override', scopeType, scopeId, ...page });
});

export const postAdminSetQuota = asyncHandler(async (req, res) => {
  const { scopeType, scopeId } = req.params;
  const page = await getQuotaPageData(scopeType, scopeId);
  if (!page) {
    req.flash('error', 'Quota target not found.');
    return res.redirect('/admin');
  }

  const { errors, hasErrors, limits, cleared, reason } = validateSetQuota(req.body, scopeType, {
    max: {
      memoryMb: env.QUOTA_MAX_MEMORY_MB,
      cpuCores: env.QUOTA_MAX_CPU_CORES,
      // The worker caps every build at BUILD_TIMEOUT_MS, so a higher override would be a lie.
      buildTimeoutSeconds: Math.floor(env.BUILD_TIMEOUT_MS / 1000),
    },
  });
  if (hasErrors) {
    return res.status(400).render('pages/admin/quota', {
      title: 'Quota Override',
      scopeType,
      scopeId,
      ...page,
      formValues: req.body,
      errors,
    });
  }

  const result = await setQuotaOverride({
    scopeType,
    scopeId,
    limits,
    cleared,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    reason,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else if (Object.keys(result.changes).length === 0) {
    req.flash('success', 'No limits changed.');
  } else {
    req.flash('success', result.quota ? 'Quota updated.' : 'Override removed. Defaults apply.');
  }

  res.redirect(`/admin/quotas/${scopeType}/${scopeId}`);
});

// ─── Users ─────────────────────────────────────────────────────────────────────

export const getAdminUsers = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const { status, role, search } = req.query;

  const { users, total, limit } = await getUsers({ page, status, role, search });

  res.render('pages/admin/users', {
    title: 'Users',
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    filters: { status: status ?? '', role: role ?? '', search: search ?? '' },
    now: new Date(),
  });
});

export const getAdminUserDetail = asyncHandler(async (req, res) => {
  const detail = await getUserDetail(req.params.userId);
  if (!detail) {
    req.flash('error', 'User not found.');
    return res.redirect('/admin/users');
  }

  // `user` is the signed-in admin in res.locals, so the viewed account is `target`.
  const { user: target, ...rest } = detail;
  res.render('pages/admin/user-detail', {
    title: fullName(target),
    target,
    ...rest,
  });
});

function userActionContext(req) {
  return {
    userId: req.params.userId,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  };
}

// Suspend/reactivate are offered on both the list and the detail page, so they
// return to whichever one the admin acted from.
function userReturnPath(req) {
  return isSafeReturnPath(req.body.returnTo) ? req.body.returnTo : '/admin/users';
}

function fullName(user) {
  return `${user.firstName} ${user.lastName}`;
}

export const postSuspendUser = asyncHandler(async (req, res) => {
  const result = await suspendUser({ ...userActionContext(req), reason: req.body.reason });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `${fullName(result.user)} suspended.`);
  }

  res.redirect(userReturnPath(req));
});

export const postReactivateUser = asyncHandler(async (req, res) => {
  const result = await reactivateUser(userActionContext(req));

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `${fullName(result.user)} reactivated.`);
  }

  res.redirect(userReturnPath(req));
});

export const postForceSignOut = asyncHandler(async (req, res) => {
  const result = await forceSignOutUser(userActionContext(req));

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    const noun = result.revokedSessions === 1 ? 'session' : 'sessions';
    req.flash(
      'success',
      `${fullName(result.user)} signed out (${result.revokedSessions} ${noun} ended).`,
    );
  }

  res.redirect(`/admin/users/${req.params.userId}`);
});

export const postUnlockUser = asyncHandler(async (req, res) => {
  const result = await unlockUser(userActionContext(req));

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `${fullName(result.user)} unlocked. Failed sign-in attempts were reset.`);
  }

  res.redirect(`/admin/users/${req.params.userId}`);
});

export const postMarkEmailVerified = asyncHandler(async (req, res) => {
  const result = await markEmailVerified(userActionContext(req));

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `${result.user.email} marked as verified.`);
  }

  res.redirect(`/admin/users/${req.params.userId}`);
});

export const postResendVerification = asyncHandler(async (req, res) => {
  const result = await resendUserVerification(userActionContext(req));

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `Verification email sent to ${result.user.email}.`);
  }

  res.redirect(`/admin/users/${req.params.userId}`);
});

export const postSendPasswordReset = asyncHandler(async (req, res) => {
  const result = await sendUserPasswordReset(userActionContext(req));

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `Password reset code sent to ${result.user.email}.`);
  }

  res.redirect(`/admin/users/${req.params.userId}`);
});

export const postUpdateUserApprovalTrust = asyncHandler(async (req, res) => {
  const result = await updateUserApprovalTrust({
    ...userActionContext(req),
    accountTier: req.body.accountTier,
    isTrusted: req.body.isTrusted === '1',
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `Auto-approval settings saved for ${fullName(result.user)}.`);
  }

  res.redirect(`/admin/users/${req.params.userId}`);
});

export const postChangeUserRole = asyncHandler(async (req, res) => {
  const result = await changeUserRole({ ...userActionContext(req), newRole: req.body.role });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', `${fullName(result.user)} is now ${result.user.platformRole}.`);
  }

  res.redirect(`/admin/users/${req.params.userId}`);
});

export const postDeleteUser = asyncHandler(async (req, res) => {
  const result = await deleteUserPermanently({
    ...userActionContext(req),
    confirmEmail: req.body.confirmEmail,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(`/admin/users/${req.params.userId}`);
  }

  const count = result.deletedProjects.length;
  const projectsNote = count > 0 ? ` and ${count} project${count === 1 ? '' : 's'}` : '';
  req.flash(
    'success',
    `${fullName(result.user)} (${result.user.email})${projectsNote} permanently deleted.`,
  );
  res.redirect('/admin/users');
});

// ─── Projects ──────────────────────────────────────────────────────────────────

export const getAdminProjects = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const { status, search } = req.query;

  const { projects, total, limit } = await getProjects({ page, status, search });

  res.render('pages/admin/projects', {
    title: 'All Projects',
    projects,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    filters: { status: status ?? '', search: search ?? '' },
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
    req.flash('success', `${result.project.name} suspended.`);
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
    req.flash('success', `${result.project.name} reactivated.`);
  }

  res.redirect('/admin/projects');
});

// ─── Approval requests ─────────────────────────────────────────────────────────

export const getApprovalRequestsList = asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const view = Object.values(ApprovalQueueView).includes(req.query.view)
    ? req.query.view
    : ApprovalQueueView.OPEN;
  const now = new Date();
  const { requests, total, counts, limit } = await getApprovalRequests({ page, view, now });

  res.render('pages/admin/approval-requests', {
    title: 'Approval Requests',
    requests,
    total,
    counts,
    view,
    now,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    isAutoApprovalEnabled: env.AUTO_APPROVAL_ENABLED,
    provisionalDelayMs: PROVISIONAL_APPROVAL_DELAY_MS,
  });
});

export const postReviewApprovalRequest = asyncHandler(async (req, res) => {
  const { decision, note } = req.body;
  const allowed = [ApprovalStatus.APPROVED, ApprovalStatus.CHANGES_REQUESTED];

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
    req.flash(
      'success',
      decision === ApprovalStatus.APPROVED ? 'Project approved.' : 'Changes requested.',
    );
  }

  res.redirect('/admin/approval-requests');
});

export const postReviewProvisionalApproval = asyncHandler(async (req, res) => {
  const result = await reviewProvisionalApproval({
    requestId: req.params.requestId,
    decision: req.body.decision,
    note: req.body.note,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash(
      'success',
      req.body.decision === 'CONFIRM'
        ? 'Project confirmed. Provisional limits were removed.'
        : 'Project suspended.',
    );
  }

  res.redirect('/admin/approval-requests');
});
