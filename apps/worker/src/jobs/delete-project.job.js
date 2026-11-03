import { ProjectTeardown } from '@hellodeploy/database';
import { logger, writeAuditEvent } from '@hellodeploy/observability';
import { AuditOutcome, ProjectTeardownStatus } from '@hellodeploy/contracts';
import { networkName, removeNetwork, stopAndRemoveContainer } from '../deployment/container.js';
import { removeDockerImage } from '../deployment/build.js';
import { deleteRegistryManifest, isPlatformImageRef } from '../deployment/registry.js';
import { removeRoute } from '../nginx/helper-client.js';
import { customDomainRouteSlug } from '../nginx/template.js';
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
 *   3. Remove the nginx config for each of its custom domains
 *
 * Database record cleanup (Project, Deployment, EnvironmentSecret, Domain,
 * etc.) is handled synchronously by the web app after this job is enqueued —
 * this job only tears down infrastructure the web app cannot reach directly.
 *
 * With a `teardownId`, what is left after each attempt is saved on the
 * ProjectTeardown record, so later attempts and an admin retry redo only that.
 */
const defaultDeps = {
  stopAndRemoveContainer,
  removeDockerImage,
  deleteRegistryManifest,
  removeNetwork,
  removeRoute,
};

export async function handleDeleteProject(job, deps = defaultDeps) {
  const { projectId, projectSlug, teardownId } = job.data;
  const teardown = teardownId ? await ProjectTeardown.findById(teardownId).lean() : null;
  if (teardownId && (!teardown || teardown.status === ProjectTeardownStatus.DONE)) {
    logger.info('DeleteProject: teardown already finished', { projectId, teardownId });
    return;
  }

  const inventory = teardown?.remaining ?? {
    containerIds: job.data.containerIds ?? [job.data.activeContainerId].filter(Boolean),
    imageTags: job.data.imageTags ?? [],
    registryImageRefs: job.data.registryImageRefs ?? [],
    subdomain: job.data.subdomain,
    customDomainHostnames: job.data.customDomainHostnames ?? [],
  };
  const { subdomain } = inventory;
  const remaining = {
    containerIds: [],
    imageTags: [],
    registryImageRefs: [],
    subdomain: null,
    customDomainHostnames: [],
  };
  const failures = [];

  for (const containerId of [...new Set(inventory.containerIds)]) {
    try {
      const removed = await deps.stopAndRemoveContainer(containerId);
      if (removed === false) {
        failures.push(`container:${containerId}`);
        remaining.containerIds.push(containerId);
      }
      logger.info('DeleteProject: removed container', {
        projectId,
        containerId,
      });
    } catch (err) {
      failures.push(`container:${containerId}`);
      remaining.containerIds.push(containerId);
      logger.warn('DeleteProject: failed to stop container', {
        projectId,
        error: err.message,
      });
    }
  }

  for (const imageTag of [...new Set(inventory.imageTags)]) {
    try {
      const removed = await deps.removeDockerImage(imageTag);
      if (removed === false) {
        failures.push(`image:${imageTag}`);
        remaining.imageTags.push(imageTag);
      }
      logger.info('DeleteProject: removed image', { projectId, imageTag });
    } catch (err) {
      failures.push(`image:${imageTag}`);
      remaining.imageTags.push(imageTag);
      logger.warn('DeleteProject: failed to remove image', {
        projectId,
        imageTag,
        error: err.message,
      });
    }
  }

  // Owner-supplied images live in the owner's registry and are not ours to delete.
  for (const imageRef of [...new Set(inventory.registryImageRefs)].filter((ref) =>
    isPlatformImageRef(ref),
  )) {
    try {
      await deps.deleteRegistryManifest(imageRef);
      logger.info('DeleteProject: removed registry manifest', { projectId, imageRef });
    } catch (err) {
      failures.push(`registry-image:${imageRef}`);
      remaining.registryImageRefs.push(imageRef);
      logger.warn('DeleteProject: failed to remove registry manifest', {
        projectId,
        imageRef,
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
      remaining.subdomain = subdomain;
      logger.error('DeleteProject: failed to remove nginx route', {
        projectId,
        subdomain,
        error: err.message,
      });
    }
  }

  for (const hostname of env.NGINX_ENABLED ? [...new Set(inventory.customDomainHostnames)] : []) {
    try {
      await deps.removeRoute({ slug: customDomainRouteSlug(hostname) });
      logger.info('DeleteProject: custom domain route removed', { projectId, hostname });
    } catch (err) {
      failures.push(`domain-route:${hostname}`);
      remaining.customDomainHostnames.push(hostname);
      logger.error('DeleteProject: failed to remove custom domain route', {
        projectId,
        hostname,
        error: err.message,
      });
    }
  }

  if (teardown) {
    await recordTeardownAttempt(teardown, job, { failures, remaining });
  }

  await writeAuditEvent({
    action: 'project.infrastructure_teardown',
    outcome: failures.length > 0 ? AuditOutcome.FAILURE : AuditOutcome.SUCCESS,
    targetType: 'project',
    targetId: projectId,
    metadata: { projectSlug, failures },
  }).catch(() => {});

  if (failures.length > 0) {
    throw new Error(`Project teardown incomplete for: ${failures.join(', ')}`);
  }

  logger.info('DeleteProject: teardown complete', { projectId });
}

// The project network is not kept in `remaining`: its removal runs on every
// attempt and treats a missing network as removed.
function recordTeardownAttempt(teardown, job, { failures, remaining }) {
  const isDone = failures.length === 0;
  let status = ProjectTeardownStatus.PENDING;
  if (isDone) {
    status = ProjectTeardownStatus.DONE;
  } else if (isFinalAttempt(job)) {
    status = ProjectTeardownStatus.FAILED;
  }
  return ProjectTeardown.updateOne(
    { _id: teardown._id },
    {
      $set: { status, failures, remaining, lastAttemptAt: new Date() },
      $inc: { attempts: 1 },
    },
  );
}

function isFinalAttempt(job) {
  return (job.attemptsMade ?? 0) + 1 >= (job.opts?.attempts ?? 1);
}
