import {
  DASHBOARD_DENSITIES,
  DASHBOARD_REFRESH_SECONDS,
  DASHBOARD_TABLE_ROWS,
  HISTORY_RANGES,
  MONITORING_POLICY_LIMITS,
  OPTIONAL_COLLECTORS,
  OPTIONAL_DASHBOARD_WIDGETS,
  PlatformRole,
  THRESHOLD_RULES,
  isNotificationMuted,
  validateDashboardPreferencesInput,
  validateMonitoringPolicyInput,
} from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';

import { asyncHandler } from '../utils/async-handler.js';
import {
  getDashboardPreferences,
  resetDashboardPreferences,
  saveDashboardPreferences,
  setSidebarCollapsed,
} from '../services/admin-ops/dashboard-preferences.service.js';
import {
  PolicyConflictError,
  getMonitoringPolicy,
  resetMonitoringPolicy,
  saveMonitoringPolicy,
} from '../services/admin-ops/monitoring-policy.service.js';
import { buildOverview } from '../services/admin-ops/overview.service.js';

const LIVE_PANELS = new Set([
  'incidents',
  'kpis',
  'trends',
  'capacity',
  'apps',
  'deployments',
  'services',
  'attention',
  'activity',
]);

/**
 * Admin shell for every rendered admin page: the personal sidebar state is
 * applied on the server so a collapsed sidebar never flashes open.
 */
export const loadAdminShell = asyncHandler(async (req, res, next) => {
  res.locals.adminPreferences = await getDashboardPreferences(req.session.user.id);
  res.locals.shellStyles = ['css/admin-shell.css'];
  res.locals.shellScripts = ['js/admin-shell.js'];
  next();
});

export const getAdminIndex = asyncHandler(async (req, res) => {
  const preferences =
    res.locals.adminPreferences ?? (await getDashboardPreferences(req.session.user.id));
  const policy = await getMonitoringPolicy();
  const overview = await buildOverview({ policy, preferences, user: req.session.user });
  res.render('pages/admin/index', {
    title: 'Admin Operations',
    overview,
    preferences,
    policy,
    layoutModifier: 'layout--wide',
    pageStyles: ['css/admin-ops.css'],
    pageScripts: ['js/admin-ops.js'],
  });
});

/**
 * Panel fragments for the live refresh. Reads the shared snapshot only; a
 * refresh, however frequent, never starts a collection on the host.
 */
export const getOverviewLive = asyncHandler(async (req, res) => {
  const requested = String(req.query.panels ?? '')
    .split(',')
    .filter((id) => LIVE_PANELS.has(id));
  const panels = requested.length > 0 ? [...new Set(requested)] : [...LIVE_PANELS];
  const preferences = await getDashboardPreferences(req.session.user.id);
  const policy = await getMonitoringPolicy();
  const overview = await buildOverview({ policy, preferences, user: req.session.user, panels });
  const rendered = {};
  await Promise.all(
    panels
      .filter((id) => !preferences.hiddenWidgets.includes(id))
      .map(async (id) => {
        rendered[id] = await renderPartial(res, 'partials/admin-ops/panel', {
          panel: id,
          overview,
          preferences,
        });
      }),
  );
  res.set('Cache-Control', 'no-store');
  res.json({ generatedAt: overview.generatedAt, status: overview.status, panels: rendered });
});

export const getOverviewSettings = asyncHandler(async (req, res) => {
  const [preferences, policy] = await Promise.all([
    getDashboardPreferences(req.session.user.id),
    getMonitoringPolicy({ fresh: true }),
  ]);
  renderSettings(req, res, { preferences, policy });
});

export const postPersonalSettings = asyncHandler(async (req, res) => {
  const result = validateDashboardPreferencesInput(req.body);
  if (!result.ok) {
    const policy = await getMonitoringPolicy({ fresh: true });
    const preferences = await getDashboardPreferences(req.session.user.id);
    res.status(422);
    return renderSettings(req, res, { preferences, policy, personalErrors: result.errors });
  }
  await saveDashboardPreferences(req.session.user.id, result.value);
  req.flash('success', 'Your dashboard preferences were saved.');
  res.redirect('/admin/overview/settings');
});

export const postPersonalReset = asyncHandler(async (req, res) => {
  await resetDashboardPreferences(req.session.user.id);
  req.flash('success', 'Your dashboard preferences were restored to the defaults.');
  res.redirect('/admin/overview/settings');
});

export const postPlatformSettings = asyncHandler(async (req, res) => {
  const current = await getMonitoringPolicy({ fresh: true });
  const result = validateMonitoringPolicyInput(req.body, { current });
  if (!result.ok) {
    const preferences = await getDashboardPreferences(req.session.user.id);
    res.status(422);
    return renderSettings(req, res, {
      preferences,
      policy: current,
      policyForm: mergeFlatForm(current, req.body),
      platformErrors: result.errors,
    });
  }
  try {
    const { changes } = await saveMonitoringPolicy({ value: result.value, actor: actorFrom(req) });
    const count = Object.keys(changes).length;
    req.flash(
      'success',
      count === 0
        ? 'The platform policy was saved without changes.'
        : `The platform policy was saved (${count} setting${count === 1 ? '' : 's'} changed). The worker applies it within 30 seconds.`,
    );
  } catch (error) {
    if (!(error instanceof PolicyConflictError)) {
      throw error;
    }
    req.flash(
      'error',
      'Another administrator changed the policy first. Review the current values and save again.',
    );
  }
  res.redirect('/admin/overview/settings#platform-title');
});

export const postPlatformReset = asyncHandler(async (req, res) => {
  try {
    await resetMonitoringPolicy({ actor: actorFrom(req), revision: Number(req.body.revision) });
    req.flash('success', 'The platform policy was restored to the defaults.');
  } catch (error) {
    if (!(error instanceof PolicyConflictError)) {
      throw error;
    }
    req.flash('error', 'Another administrator changed the policy first. Nothing was reset.');
  }
  res.redirect('/admin/overview/settings#platform-title');
});

/** Sidebar toggle from any admin page (JSON, CSRF header). */
export const postSidebarPreference = asyncHandler(async (req, res) => {
  const collapsed = req.body?.collapsed === true || req.body?.collapsed === 'true';
  const preferences = await setSidebarCollapsed(req.session.user.id, collapsed);
  res.set('Cache-Control', 'no-store');
  res.json({ sidebarCollapsed: preferences.sidebarCollapsed });
});

function renderSettings(
  req,
  res,
  { preferences, policy, policyForm, personalErrors, platformErrors },
) {
  res.render('pages/admin/overview-settings', {
    title: 'Overview settings',
    preferences,
    policyForm: policyForm ?? policy,
    policyUpdatedAt: policy.updatedAt,
    mutedUntil: isNotificationMuted(policy) ? policy.notifications.muteUntil : null,
    canEditPlatform: req.session.user.platformRole === PlatformRole.SUPER_ADMIN,
    personalErrors: personalErrors ?? null,
    platformErrors: platformErrors ?? null,
    limits: MONITORING_POLICY_LIMITS,
    densities: DASHBOARD_DENSITIES,
    widgets: OPTIONAL_DASHBOARD_WIDGETS,
    refreshOptions: DASHBOARD_REFRESH_SECONDS,
    historyRanges: Object.keys(HISTORY_RANGES),
    tableRowOptions: DASHBOARD_TABLE_ROWS,
    collectors: OPTIONAL_COLLECTORS,
    thresholdRules: THRESHOLD_RULES,
    pageStyles: ['css/admin-ops.css'],
  });
}

/** Re-show what the administrator typed after a failed save, over the stored policy. */
function mergeFlatForm(policy, body) {
  const form = structuredClone(policy);
  for (const [name, raw] of Object.entries(body ?? {})) {
    const path = name.split('.');
    let target = form;
    for (const segment of path.slice(0, -1)) {
      target = target?.[segment];
    }
    const leaf = path.at(-1);
    if (
      target &&
      typeof target === 'object' &&
      leaf in target &&
      typeof target[leaf] !== 'object'
    ) {
      const value = Array.isArray(raw) ? raw.at(-1) : raw;
      target[leaf] = typeof target[leaf] === 'boolean' ? value === 'true' : String(value);
    }
  }
  return form;
}

function actorFrom(req) {
  return {
    id: req.session.user.id,
    role: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  };
}

function renderPartial(res, view, locals) {
  return new Promise((resolve, reject) => {
    res.render(view, { ...locals, layout: false }, (error, html) => {
      if (error) {
        logger.error('Overview panel render failed', { panel: locals.panel, error: error.message });
        reject(error);
        return;
      }
      resolve(html);
    });
  });
}
