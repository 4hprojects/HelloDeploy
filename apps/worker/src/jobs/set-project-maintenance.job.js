import { Project, Deployment } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';
import { generateServerBlock, generateMaintenanceBlock } from '../nginx/template.js';
import { activateRoute } from '../nginx/route-manager.js';
import { isReservedSubdomain, isValidSubdomainLabel } from '../nginx/reserved-subdomains.js';
import { env } from '../config/env.js';

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
export async function handleSetProjectMaintenance(job) {
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

  const subdomain = project.platformSubdomain ?? project.slug;
  if (!isValidSubdomainLabel(subdomain) || isReservedSubdomain(subdomain)) {
    logger.warn('SetProjectMaintenance: invalid subdomain, skipping', { projectId, subdomain });
    return;
  }

  if (enabled) {
    const maintenanceConfig = generateMaintenanceBlock({
      subdomain,
      domain: env.PLATFORM_DOMAIN,
      message,
    });

    await activateRoute({
      configDir: env.NGINX_HELLODEPLOY_CONFIG_DIR,
      slug: subdomain,
      configContent: maintenanceConfig,
      nginxBinary: env.NGINX_BINARY_PATH,
    });

    logger.info('SetProjectMaintenance: maintenance enabled', { projectId, subdomain });
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

  const appConfig = generateServerBlock({
    subdomain,
    domain: env.PLATFORM_DOMAIN,
    port: activeDeployment.containerPort,
    deploymentId: activeDeployment._id.toString(),
  });

  await activateRoute({
    configDir: env.NGINX_HELLODEPLOY_CONFIG_DIR,
    slug: subdomain,
    configContent: appConfig,
    nginxBinary: env.NGINX_BINARY_PATH,
  });

  logger.info('SetProjectMaintenance: maintenance disabled, route restored', {
    projectId,
    subdomain,
    port: activeDeployment.containerPort,
  });
}
