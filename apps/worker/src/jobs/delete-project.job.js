import { logger } from '@hellodeploy/observability';
import { stopAndRemoveContainer } from '../deployment/container.js';
import { removeRoute } from '../nginx/helper-client.js';
import { isValidSubdomainLabel } from '../nginx/reserved-subdomains.js';
import { env } from '../config/env.js';

/**
 * DELETE_PROJECT job handler.
 *
 * Called when an owner permanently deletes a project. Unlike STOP_PROJECT
 * (which swaps in a maintenance block), this fully removes the nginx route.
 * Steps:
 *   1. Stop and remove the active container, if any
 *   2. Remove the nginx config for the project's subdomain entirely
 *
 * Database record cleanup (Project, Deployment, EnvironmentSecret, Domain,
 * etc.) is handled synchronously by the web app before this job is enqueued —
 * this job only tears down infrastructure the web app cannot reach directly.
 */
export async function handleDeleteProject(job) {
  const { projectId, subdomain } = job.data;

  if (job.data.activeContainerId) {
    try {
      await stopAndRemoveContainer(job.data.activeContainerId);
      logger.info('DeleteProject: stopped active container', {
        projectId,
        containerId: job.data.activeContainerId,
      });
    } catch (err) {
      logger.warn('DeleteProject: failed to stop container', {
        projectId,
        error: err.message,
      });
    }
  }

  if (env.NGINX_ENABLED && subdomain && isValidSubdomainLabel(subdomain)) {
    try {
      await removeRoute({
        configDir: env.NGINX_HELLODEPLOY_CONFIG_DIR,
        slug: subdomain,
        nginxBinary: env.NGINX_BINARY_PATH,
      });
      logger.info('DeleteProject: nginx route removed', { projectId, subdomain });
    } catch (err) {
      logger.error('DeleteProject: failed to remove nginx route', {
        projectId,
        subdomain,
        error: err.message,
      });
    }
  }

  logger.info('DeleteProject: teardown complete', { projectId });
}
