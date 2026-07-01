import { PlatformRole } from '@hellodeploy/contracts';
import { getMaintenanceMode } from '../services/platform-settings.service.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const MAINTENANCE_CONTROL_PATHS = new Set([
  '/admin/server/maintenance/enable',
  '/admin/server/maintenance/disable',
]);

export function createMaintenanceModeMiddleware({
  getMaintenanceModeFn = getMaintenanceMode,
} = {}) {
  return async function maintenanceModeMiddleware(req, res, next) {
    const maintenance = await getMaintenanceModeFn();
    res.locals.maintenanceMode = maintenance;

    if (!maintenance.enabled || SAFE_METHODS.has(req.method)) {
      return next();
    }

    if (MAINTENANCE_CONTROL_PATHS.has(req.path)) {
      return next();
    }

    if (req.session?.user?.platformRole === PlatformRole.SUPER_ADMIN) {
      return next();
    }

    const message =
      maintenance.message ?? 'HelloDeploy is in maintenance mode. Please try again later.';

    if (req.accepts('html')) {
      return res.status(503).render('pages/error', {
        title: 'Maintenance Mode',
        layout: 'layouts/main',
        message,
      });
    }

    return res.status(503).json({
      error: {
        code: 'MAINTENANCE_MODE',
        message,
        correlationId: req.correlationId,
      },
    });
  };
}

export const maintenanceModeMiddleware = createMaintenanceModeMiddleware();
