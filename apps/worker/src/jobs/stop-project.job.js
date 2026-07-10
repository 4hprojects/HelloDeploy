import { Project, Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { stopAndRemoveContainer } from '../deployment/container.js';
import { generateMaintenanceBlock } from '../nginx/template.js';
import { activateRoute } from '../nginx/helper-client.js';
import { isValidSubdomainLabel } from '../nginx/reserved-subdomains.js';
import { env } from '../config/env.js';

/**
 * STOP_PROJECT job handler.
 *
 * Called when an admin suspends a project. Steps:
 *   1. Find the project's active deployment
 *   2. Stop and remove the active container
 *   3. Replace nginx route with a maintenance 503 block
 *   4. Mark active deployment as ROLLED_BACK (it is no longer serving)
 */
export async function handleStopProject(job) {
  const { projectId } = job.data;

  const project = await Project.findById(projectId).lean();
  if (!project) {
    logger.warn('StopProject: project not found', { projectId });
    return;
  }

  // ── Stop active container ───────────────────────────────────────────────────
  if (project.activeDeploymentId) {
    const deployment = await Deployment.findById(project.activeDeploymentId).lean();
    if (deployment?.activeContainerId) {
      try {
        await stopAndRemoveContainer(deployment.activeContainerId);
        logger.info('StopProject: stopped active container', {
          projectId,
          containerId: deployment.activeContainerId,
        });
      } catch (err) {
        logger.warn('StopProject: failed to stop container', {
          projectId,
          error: err.message,
        });
      }

      await Deployment.updateOne(
        { _id: deployment._id },
        {
          $set: {
            status: DeploymentStatus.ROLLED_BACK,
            activeContainerId: null,
            completedAt: new Date(),
          },
        },
      );
    }
  }

  // ── Replace nginx with maintenance block ────────────────────────────────────
  if (env.NGINX_ENABLED) {
    const subdomain = project.platformSubdomain ?? project.slug;

    if (isValidSubdomainLabel(subdomain)) {
      const maintenanceConfig = generateMaintenanceBlock({
        subdomain,
        domain: env.PLATFORM_DOMAIN,
      });

      try {
        await activateRoute({
          configDir: env.NGINX_HELLODEPLOY_CONFIG_DIR,
          slug: subdomain,
          configContent: maintenanceConfig,
          nginxBinary: env.NGINX_BINARY_PATH,
        });
        logger.info('StopProject: nginx maintenance block activated', { projectId, subdomain });
      } catch (err) {
        logger.error('StopProject: failed to activate maintenance block', {
          projectId,
          subdomain,
          error: err.message,
        });
      }
    }
  }

  // Clear active deployment reference
  await Project.updateOne({ _id: projectId }, { $set: { activeDeploymentId: null } });

  logger.info('StopProject: project stopped', { projectId });
}
