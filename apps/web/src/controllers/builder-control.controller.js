import {
  BUILDER_RUNTIME_FAMILIES,
  BUILDER_RUNTIME_LABELS,
  BuilderControlAction,
  MAX_BUILDER_IDLE_MINUTES,
  MIN_BUILDER_IDLE_MINUTES,
  PlatformRole,
} from '@hellodeploy/contracts';

import { env } from '../config/env.js';
import {
  getBuilderLiveStatus,
  getBuilderPageData,
  presentBuilderStatus,
  requestBuilderAction,
  updateBuilderSettings,
} from '../services/builder-control.service.js';
import { asyncHandler } from '../utils/async-handler.js';

const ACTION_MESSAGES = Object.freeze({
  [BuilderControlAction.START]:
    'Start requested. The page shows the result once the worker reports it.',
  [BuilderControlAction.STOP]:
    'Stop requested. A running build is never stopped by this; use Emergency Stop.',
  [BuilderControlAction.EMERGENCY_STOP]:
    'Emergency Stop requested. Any running build is cancelled and the build service is killed.',
  [BuilderControlAction.CHECK_REGISTRY]: 'Registry check requested.',
});

/** Builder routes do not exist while builder control is off. */
export function requireBuilderControl(req, res, next) {
  if (!env.BUILDER_CONTROL_ENABLED) {
    return res.status(404).render('pages/404', { title: 'Page Not Found', layout: 'layouts/main' });
  }
  next();
}

export const getAdminBuilder = asyncHandler(async (req, res) => {
  const activityPage = Math.max(1, parseInt(req.query.page) || 1);
  const data = await getBuilderPageData({ activityPage });
  res.render('pages/admin/builder', {
    title: 'Build Service',
    ...data,
    view: presentBuilderStatus({
      status: data.status,
      isFresh: data.isFresh,
      idleMinutes: data.settings.idleMinutes,
    }),
    runtimeFamilies: BUILDER_RUNTIME_FAMILIES,
    runtimeLabels: BUILDER_RUNTIME_LABELS,
    idleBounds: { min: MIN_BUILDER_IDLE_MINUTES, max: MAX_BUILDER_IDLE_MINUTES },
    isSuperAdmin: req.session.user.platformRole === PlatformRole.SUPER_ADMIN,
  });
});

/** The page's live status; it holds no credentials, only what the page shows. */
export const getAdminBuilderStatus = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(await getBuilderLiveStatus());
});

function createActionHandler(action) {
  return asyncHandler(async (req, res) => {
    const result = await requestBuilderAction({
      action,
      adminId: req.session.user.id,
      adminRole: req.session.user.platformRole,
      sourceIp: req.ip,
      correlationId: req.correlationId,
    });
    req.flash(
      result.success ? 'success' : 'error',
      result.success ? ACTION_MESSAGES[action] : result.error,
    );
    res.redirect('/admin/builder');
  });
}

export const postBuilderStart = createActionHandler(BuilderControlAction.START);
export const postBuilderStop = createActionHandler(BuilderControlAction.STOP);
export const postBuilderEmergencyStop = createActionHandler(BuilderControlAction.EMERGENCY_STOP);
export const postBuilderCheckRegistry = createActionHandler(BuilderControlAction.CHECK_REGISTRY);

export const postBuilderSettings = asyncHandler(async (req, res) => {
  const runtimes = Object.fromEntries(
    BUILDER_RUNTIME_FAMILIES.map((family) => [
      family,
      {
        enabled: req.body[`${family}Enabled`] === 'on',
        projectIds: [req.body[`${family}Projects`] ?? []]
          .flat()
          .filter((id) => typeof id === 'string'),
      },
    ]),
  );
  const result = await updateBuilderSettings({
    idleMinutes: req.body.idleMinutes,
    runtimes,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  req.flash(
    result.success ? 'success' : 'error',
    result.success ? 'Build service settings saved.' : result.error,
  );
  res.redirect('/admin/builder');
});
