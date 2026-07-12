import { logger } from '@hellodeploy/observability';
import { networkName, removeNetwork, stopAndRemoveContainer } from '../deployment/container.js';
import { removeDockerImage } from '../deployment/build.js';
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
const defaultDeps = { stopAndRemoveContainer, removeDockerImage, removeNetwork, removeRoute };

export async function handleDeleteProject(job, deps = defaultDeps) {
  const { projectId, subdomain, projectSlug } = job.data;
  const containerIds = job.data.containerIds ?? [job.data.activeContainerId].filter(Boolean);
  const imageTags = job.data.imageTags ?? [];
  const failures = [];

  for (const containerId of [...new Set(containerIds)]) {
    try {
      const removed = await deps.stopAndRemoveContainer(containerId);
      if (removed === false) {
        failures.push(`container:${containerId}`);
      }
      logger.info('DeleteProject: removed container', {
        projectId,
        containerId,
      });
    } catch (err) {
      failures.push(`container:${containerId}`);
      logger.warn('DeleteProject: failed to stop container', {
        projectId,
        error: err.message,
      });
    }
  }

  for (const imageTag of [...new Set(imageTags)]) {
    try {
      const removed = await deps.removeDockerImage(imageTag);
      if (removed === false) {
        failures.push(`image:${imageTag}`);
      }
      logger.info('DeleteProject: removed image', { projectId, imageTag });
    } catch (err) {
      failures.push(`image:${imageTag}`);
      logger.warn('DeleteProject: failed to remove image', {
        projectId,
        imageTag,
        error: err.message,
      });
    }
  }

  if (projectSlug) {
    const removed = await deps.removeNetwork(networkName(projectSlug));
    if (removed === false) {
      failures.push(`network:${projectSlug}`);
    }
  }

  if (env.NGINX_ENABLED && subdomain && isValidSubdomainLabel(subdomain)) {
    try {
      await deps.removeRoute({
        configDir: env.NGINX_HELLODEPLOY_CONFIG_DIR,
        slug: subdomain,
        nginxBinary: env.NGINX_BINARY_PATH,
      });
      logger.info('DeleteProject: nginx route removed', { projectId, subdomain });
    } catch (err) {
      failures.push(`route:${subdomain}`);
      logger.error('DeleteProject: failed to remove nginx route', {
        projectId,
        subdomain,
        error: err.message,
      });
    }
  }

  if (failures.length > 0) {
    throw new Error(`Project teardown incomplete for: ${failures.join(', ')}`);
  }

  logger.info('DeleteProject: teardown complete', { projectId });
}
