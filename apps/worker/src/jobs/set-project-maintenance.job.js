import { Project, Deployment } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';
import { activateRoutes } from '../nginx/helper-client.js';
import {
  buildApplicationRouteSet,
  buildMaintenanceRouteSet,
  listActiveCustomDomains,
} from '../nginx/project-routes.js';
import { env } from '../config/env.js';

const defaultDeps = { activateRoutes, listActiveCustomDomains };

/**
 * SET_PROJECT_MAINTENANCE job handler.
 *
 * Toggles per-project maintenance mode. Unlike STOP_PROJECT, this never stops
 * the running container — it only swaps the Nginx route between the app and a
 * static maintenance response, so re-enabling traffic is an instant route swap
 * back to the already-running container rather than a redeploy.
 *
 * Payload: { projectId, enabled, message }
 */
export async function handleSetProjectMaintenance(job, deps = defaultDeps) {
  const { projectId, enabled, message } = job.data;

  if (!env.NGINX_ENABLED) {
    logger.info('SetProjectMaintenance: nginx disabled, nothing to do', { projectId });
    return;
  }

  const project = await Project.findById(projectId).lean();
  if (!project) {
    logger.warn('SetProjectMaintenance: project not found', { projectId });
    return;
  }

  const customDomains = await deps.listActiveCustomDomains(projectId);

  if (enabled) {
    const routes = buildMaintenanceRouteSet({
      project,
      message,
      customDomains,
      deploymentDomain: env.DEPLOYMENT_DOMAIN,
    });
    await deps.activateRoutes({ routes });

    logger.info('SetProjectMaintenance: maintenance enabled', {
      projectId,
      routeCount: routes.length,
    });
    return;
  }

  // Disabling — restore the route to the currently active container, if any.
  if (!project.activeDeploymentId) {
    logger.info('SetProjectMaintenance: no active deployment to restore, route left as-is', {
      projectId,
    });
    return;
  }

  const activeDeployment = await Deployment.findById(project.activeDeploymentId).lean();
  if (!activeDeployment?.activeContainerId || !activeDeployment?.containerPort) {
    logger.warn('SetProjectMaintenance: active deployment has no running container to restore', {
      projectId,
      deploymentId: project.activeDeploymentId?.toString(),
    });
    return;
  }

  const routes = buildApplicationRouteSet({
    project,
    port: activeDeployment.containerPort,
    deploymentId: activeDeployment._id.toString(),
    customDomains,
    deploymentDomain: env.DEPLOYMENT_DOMAIN,
  });
  await deps.activateRoutes({ routes });

  logger.info('SetProjectMaintenance: maintenance disabled, route restored', {
    projectId,
    routeCount: routes.length,
    port: activeDeployment.containerPort,
  });
}
