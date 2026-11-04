import { User } from '@hellodeploy/database';
import {
  ADMIN_OPS_EVENT_CHANNEL,
  DASHBOARD_DENSITIES,
  DASHBOARD_REFRESH_SECONDS,
  DASHBOARD_TABLE_ROWS,
  HISTORY_RANGES,
  MONITORING_POLICY_LIMITS,
  OPTIONAL_COLLECTORS,
  OPTIONAL_DASHBOARD_WIDGETS,
  PlatformRole,
  THRESHOLD_RULES,
  UserStatus,
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
import { getMonitoringSnapshot } from '../services/admin-ops/snapshot.service.js';
import {
  IncidentNotFoundError,
  acknowledgeIncident,
} from '../services/admin-ops/incidents.service.js';
import { getRedisConnection } from '../queue/client.js';
import { subscribeChannel } from '../services/deploy-log-stream.js';
import { acquireStreamSlot, releaseStreamSlot } from '../services/sse-limiter.js';

const LIVE_PANELS = new Set([
  'incidents',
  'kpis',
  'trends',
  'capacity',
  'apps',
  'consumers',
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
  const overview = await buildOverview({
    policy,
    preferences,
    deps: req.app.locals.adminOpsDeps,
  });
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
  const overview = await buildOverview({ policy, preferences, deps: req.app.locals.adminOpsDeps });
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

/**
 * The sanitized collector snapshot as JSON, for tooling and diagnostics. It
 * is the same copy the panels render from: no Docker metadata beyond state,
 * limits and HelloDeploy's own labels, and no names for unmanaged containers.
 */
export const getOverviewSnapshot = asyncHandler(async (req, res) => {
  const read = req.app.locals.adminOpsDeps?.getMonitoringSnapshot ?? getMonitoringSnapshot;
  const { snapshot, freshness, ageSeconds, reason } = await read();
  res.set('Cache-Control', 'no-store');
  res.json({ freshness, ageSeconds, reason, snapshot });
});

// Inside the limiter's 7-minute slot TTL, so a crashed process never holds a
// slot longer than one window; the browser reconnects transparently.
const EVENT_STREAM_MAX_MS = 6 * 60_000;
const EVENT_HEARTBEAT_MS = 25_000;
const EVENT_ROLE_RECHECK_MS = 2 * 60_000;
const EVENT_STREAMS_PER_ADMIN = 2;
let eventSequence = 0;
const eventEpoch = Date.now().toString(36);

/** Only these fields of each event type ever reach a browser. */
const EVENT_FIELDS = {
  deployment: ['deploymentId', 'status', 'at'],
  app: ['projectId', 'slug', 'from', 'to', 'at'],
  incident: ['id', 'fingerprint', 'severity', 'state', 'title', 'at', 'muted'],
};

/**
 * Live admin events over SSE: deployment transitions, application health
 * changes and incidents. Payloads are ids and states only. Every connection
 * re-checks the administrator's role in the database, because the session
 * copy can lag a demotion, and again every two minutes while open.
 */
export const getOverviewEvents = asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  if (!(await isStillAdmin(userId))) {
    res.status(403).end();
    return;
  }
  const slotKey = `sse:admin-ops:user:${userId}`;
  if (!(await acquireStreamSlot(slotKey, EVENT_STREAMS_PER_ADMIN))) {
    res.set('Retry-After', '30');
    res.status(429).end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let closed = false;
  const send = (type, data) => {
    if (closed) {
      return;
    }
    eventSequence += 1;
    res.write(
      `id: ${eventEpoch}-${eventSequence}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`,
    );
    // A compression layer in front would otherwise hold events back.
    res.flush?.();
  };

  // Without a Redis connection there is no pub/sub: the page polls instead.
  const subscribe =
    req.app.locals.adminOpsDeps?.subscribeChannel ??
    ((channel, handler) => (getRedisConnection() ? subscribeChannel(channel, handler) : null));
  const unsubscribe = subscribe(ADMIN_OPS_EVENT_CHANNEL, (payload) => {
    const fields = EVENT_FIELDS[payload?.type];
    if (!fields) {
      return;
    }
    send(
      payload.type,
      Object.fromEntries(fields.filter((f) => f in payload).map((f) => [f, payload[f]])),
    );
  });

  res.write('retry: 5000\n\n');
  send('hello', { live: Boolean(unsubscribe), at: new Date().toISOString() });

  const heartbeat = setInterval(() => {
    if (!closed) {
      res.write(': ping\n\n');
      res.flush?.();
    }
  }, EVENT_HEARTBEAT_MS);
  const recheck = setInterval(async () => {
    if (!(await isStillAdmin(userId).catch(() => false))) {
      send('forbidden', {});
      finish();
    }
  }, EVENT_ROLE_RECHECK_MS);
  const lifetime = setTimeout(() => {
    send('reconnect', {});
    finish();
  }, EVENT_STREAM_MAX_MS);

  function finish() {
    if (closed) {
      return;
    }
    closed = true;
    clearInterval(heartbeat);
    clearInterval(recheck);
    clearTimeout(lifetime);
    unsubscribe?.();
    releaseStreamSlot(slotKey).catch(() => {});
    res.end();
  }

  if (!unsubscribe) {
    // No pub/sub available: tell the page to rely on polling, and close.
    send('unavailable', {});
    finish();
    return;
  }
  req.on('close', finish);
});

async function isStillAdmin(userId) {
  const user = await User.findById(userId).select('platformRole status').lean();
  return (
    Boolean(user) &&
    user.status === UserStatus.ACTIVE &&
    [PlatformRole.ADMIN, PlatformRole.SUPER_ADMIN].includes(user.platformRole)
  );
}

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

/**
 * Acknowledge an incident. The page posts with fetch and refreshes the strip
 * in place; without JavaScript the form posts normally and returns here.
 */
export const postAcknowledgeIncident = asyncHandler(async (req, res) => {
  const wantsJson = req.get('accept')?.includes('application/json');
  try {
    await acknowledgeIncident({ incidentId: req.params.incidentId, actor: actorFrom(req) });
  } catch (error) {
    if (!(error instanceof IncidentNotFoundError)) {
      throw error;
    }
    if (wantsJson) {
      res.status(409).json({ error: { code: error.code, message: error.message } });
      return;
    }
    req.flash('error', error.message);
    res.redirect('/admin');
    return;
  }
  if (wantsJson) {
    res.json({ acknowledged: true });
    return;
  }
  req.flash('success', 'Incident acknowledged. It stays open until it recovers.');
  res.redirect('/admin');
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
