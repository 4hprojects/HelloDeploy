import { resolve as dnsResolve } from 'node:dns/promises';
import { createHash, randomUUID } from 'node:crypto';
import { Domain, Project, Deployment } from '@hellodeploy/database';
import {
  AuditOutcome,
  DeploymentStatus,
  DomainStatus,
  JobType,
  ProjectStatus,
} from '@hellodeploy/contracts';
import { enqueueJob } from '@hellodeploy/queue';
import { logger, writeAuditEvent } from '@hellodeploy/observability';
import { generateCustomDomainServerBlock, customDomainRouteSlug } from '../nginx/template.js';
import { activateRoute, removeRoute } from '../nginx/helper-client.js';
import { withProjectRouteLock } from '../nginx/project-route-lock.js';
import { getWorkerQueue } from '../queue/worker-queue.js';
import { env } from '../config/env.js';

const VERIFICATION_TXT_PREFIX = 'hellodeploy-verify=';
const VERIFICATION_SUBDOMAIN_PREFIX = '_hellodeploy-verify.';
const DNS_MISMATCH_COPY =
  'TXT record not found or its value did not match. Check DNS and try again.';
const ACTIVATION_FAILED_COPY = 'Domain routing could not be activated. Try again.';
const REMOVAL_FAILED_COPY = 'Domain routing could not be removed. Try again.';

async function verifyDnsTxtRecord(hostname, tokenHash) {
  const lookupName = `${VERIFICATION_SUBDOMAIN_PREFIX}${hostname}`;
  try {
    const records = await dnsResolve(lookupName, 'TXT');
    return records.some((parts) => {
      const fullRecord = parts.join('');
      if (!fullRecord.startsWith(VERIFICATION_TXT_PREFIX)) {
        return false;
      }
      const token = fullRecord.slice(VERIFICATION_TXT_PREFIX.length);
      return createHash('sha256').update(token).digest('hex') === tokenHash;
    });
  } catch (err) {
    logger.info('VerifyDomain: DNS lookup failed', { hostname: lookupName, error: err.message });
    return false;
  }
}

async function enqueueDomainActivation(payload, jobId) {
  const queue = getWorkerQueue();
  if (!queue) {
    throw new Error('Worker queue is not initialized.');
  }
  await enqueueJob(queue, JobType.ACTIVATE_DOMAIN, payload, { jobId });
}

function matchesOperation(domain, data) {
  return (
    domain.lifecycleVersion === data.lifecycleVersion && domain.operationId === data.operationId
  );
}

function isFinalAttempt(job) {
  return job.attemptsMade + 1 >= (job.opts?.attempts ?? 1);
}

async function auditDomain(action, outcome, data, metadata = {}) {
  try {
    await writeAuditEvent({
      action,
      outcome,
      actorId: data.actorId ?? null,
      actorRole: data.actorRole ?? null,
      targetType: 'domain',
      targetId: data.domainId,
      correlationId: data.correlationId ?? null,
      metadata: { projectId: data.projectId, hostname: data.hostname, ...metadata },
    });
  } catch (err) {
    logger.warn('DomainJob: audit event could not be persisted', {
      action,
      domainId: data.domainId,
      error: err.message,
    });
  }
}

export async function handleVerifyDomain(job) {
  return handleVerifyDomainWithDependencies(job);
}

export async function handleVerifyDomainWithDependencies(
  job,
  {
    DomainModel = Domain,
    ProjectModel = Project,
    DeploymentModel = Deployment,
    verifyDns = verifyDnsTxtRecord,
    routeActivator = activateRoute,
    routeRemover = removeRoute,
    routeLock = withProjectRouteLock,
    enqueueActivation = enqueueDomainActivation,
    workerEnv = env,
  } = {},
) {
  if ((job.data.version ?? 1) < 2) {
    return handleLegacyDomainJob(job, {
      DomainModel,
      ProjectModel,
      DeploymentModel,
      verifyDns,
      routeActivator,
      routeRemover,
      routeLock,
      workerEnv,
    });
  }

  const data = job.data;
  const domain = await DomainModel.findById(data.domainId).lean();
  if (!domain) {
    logger.warn('VerifyDomain: domain not found', { domainId: data.domainId });
    return;
  }
  if (domain.status !== DomainStatus.VERIFYING || !matchesOperation(domain, data)) {
    logger.info('VerifyDomain: stale verification attempt skipped', {
      domainId: data.domainId,
      status: domain.status,
    });
    return;
  }

  const verified = await verifyDns(data.hostname, domain.verificationTokenHash);
  if (!verified) {
    await DomainModel.updateOne(
      {
        _id: data.domainId,
        status: DomainStatus.VERIFYING,
        lifecycleVersion: data.lifecycleVersion,
        operationId: data.operationId,
      },
      {
        $set: {
          status: DomainStatus.PENDING_VERIFICATION,
          operationError: DNS_MISMATCH_COPY,
          operationCompletedAt: new Date(),
        },
      },
    );
    await auditDomain('domain.verification_failed', AuditOutcome.FAILURE, data, {
      reason: 'DNS_MISMATCH',
    });
    logger.info('VerifyDomain: DNS verification did not match', {
      domainId: data.domainId,
      hostname: data.hostname,
    });
    return;
  }

  const project = await ProjectModel.findById(data.projectId).lean();
  const deployment = project?.activeDeploymentId
    ? await DeploymentModel.findById(project.activeDeploymentId).lean()
    : null;
  const canActivate =
    project?.status === ProjectStatus.ACTIVE &&
    deployment?.status === DeploymentStatus.HEALTHY &&
    Boolean(deployment.containerPort);
  const now = new Date();

  if (!canActivate) {
    await DomainModel.updateOne(
      {
        _id: data.domainId,
        status: DomainStatus.VERIFYING,
        lifecycleVersion: data.lifecycleVersion,
        operationId: data.operationId,
      },
      {
        $set: {
          status: DomainStatus.VERIFIED,
          verifiedAt: now,
          operationError: null,
          operationCompletedAt: now,
        },
      },
    );
    await auditDomain('domain.verified', AuditOutcome.SUCCESS, data, {
      activationDeferred: true,
    });
    return;
  }

  const activationOperationId = randomUUID();
  const claimed = await DomainModel.updateOne(
    {
      _id: data.domainId,
      status: DomainStatus.VERIFYING,
      lifecycleVersion: data.lifecycleVersion,
      operationId: data.operationId,
    },
    {
      $set: {
        status: DomainStatus.ACTIVATING,
        verifiedAt: now,
        operationId: activationOperationId,
        operationError: null,
        operationStartedAt: now,
        operationCompletedAt: null,
      },
    },
  );
  if (claimed?.modifiedCount !== undefined && claimed.modifiedCount === 0) {
    return;
  }

  try {
    const activationPayload = {
      version: 2,
      correlationId: data.correlationId,
      actorId: data.actorId,
      actorRole: data.actorRole,
      domainId: data.domainId,
      projectId: data.projectId,
      hostname: data.hostname,
      lifecycleVersion: data.lifecycleVersion,
      operationId: activationOperationId,
    };
    await enqueueActivation(
      activationPayload,
      `activate-domain-${data.domainId}-${activationOperationId}`,
    );
    await auditDomain('domain.verified', AuditOutcome.SUCCESS, data, {
      activationDeferred: false,
    });
    await auditDomain('domain.activation_started', AuditOutcome.SUCCESS, activationPayload, {
      automatic: true,
    });
  } catch (err) {
    logger.error('VerifyDomain: failed to enqueue automatic activation', {
      domainId: data.domainId,
      error: err.message,
    });
    await DomainModel.updateOne(
      {
        _id: data.domainId,
        status: DomainStatus.ACTIVATING,
        lifecycleVersion: data.lifecycleVersion,
        operationId: activationOperationId,
      },
      {
        $set: {
          status: DomainStatus.VERIFIED,
          operationError: ACTIVATION_FAILED_COPY,
          operationCompletedAt: new Date(),
        },
      },
    );
  }
}

export async function handleActivateDomain(job) {
  return handleActivateDomainWithDependencies(job);
}

export async function handleActivateDomainWithDependencies(
  job,
  {
    DomainModel = Domain,
    ProjectModel = Project,
    DeploymentModel = Deployment,
    routeActivator = activateRoute,
    routeRemover = removeRoute,
    routeLock = withProjectRouteLock,
    workerEnv = env,
  } = {},
) {
  const data = job.data;
  const domain = await DomainModel.findById(data.domainId).lean();
  if (!domain || domain.status !== DomainStatus.ACTIVATING || !matchesOperation(domain, data)) {
    logger.info('ActivateDomain: stale activation attempt skipped', { domainId: data.domainId });
    return;
  }

  let routeActivated = false;
  try {
    const activated = await routeLock(data.projectId, async () => {
      const freshDomain = await DomainModel.findById(data.domainId).lean();
      if (
        !freshDomain ||
        freshDomain.status !== DomainStatus.ACTIVATING ||
        !matchesOperation(freshDomain, data)
      ) {
        return false;
      }
      const project = await ProjectModel.findById(data.projectId).lean();
      const deployment = project?.activeDeploymentId
        ? await DeploymentModel.findById(project.activeDeploymentId).lean()
        : null;
      if (
        project?.status !== ProjectStatus.ACTIVE ||
        deployment?.status !== DeploymentStatus.HEALTHY ||
        !deployment.containerPort
      ) {
        await DomainModel.updateOne(
          { _id: data.domainId, operationId: data.operationId },
          {
            $set: {
              status: data.legacyApproval
                ? DomainStatus.PENDING_ADMIN_APPROVAL
                : DomainStatus.VERIFIED,
              operationError: 'Deploy a healthy release before activating this domain.',
              operationCompletedAt: new Date(),
            },
          },
        );
        return false;
      }
      if (!workerEnv.NGINX_ENABLED) {
        throw new Error('Nginx routing is disabled.');
      }

      await routeActivator({
        slug: customDomainRouteSlug(data.hostname),
        configContent: generateCustomDomainServerBlock({
          hostname: data.hostname,
          port: deployment.containerPort,
          deploymentId: deployment._id.toString(),
        }),
      });
      routeActivated = true;
      await DomainModel.updateOne(
        {
          _id: data.domainId,
          status: DomainStatus.ACTIVATING,
          lifecycleVersion: data.lifecycleVersion,
          operationId: data.operationId,
        },
        {
          $set: {
            status: DomainStatus.ACTIVE,
            activatedAt: new Date(),
            operationError: null,
            operationCompletedAt: new Date(),
          },
        },
      );
      return true;
    });
    if (!activated) {
      return;
    }
    await auditDomain('domain.activated', AuditOutcome.SUCCESS, data);
    logger.info('ActivateDomain: custom domain route activated', { hostname: data.hostname });
  } catch (err) {
    if (routeActivated) {
      try {
        await routeRemover({ slug: customDomainRouteSlug(data.hostname) });
      } catch (cleanupErr) {
        logger.error('ActivateDomain: failed to roll back route after state update failure', {
          domainId: data.domainId,
          error: cleanupErr.message,
        });
      }
    }
    const finalAttempt = isFinalAttempt(job);
    await DomainModel.updateOne(
      {
        _id: data.domainId,
        lifecycleVersion: data.lifecycleVersion,
        operationId: data.operationId,
      },
      {
        $set: {
          status: finalAttempt
            ? data.legacyApproval
              ? DomainStatus.PENDING_ADMIN_APPROVAL
              : DomainStatus.VERIFIED
            : DomainStatus.ACTIVATING,
          operationError: finalAttempt
            ? ACTIVATION_FAILED_COPY
            : 'Domain routing activation is retrying.',
          ...(finalAttempt ? { operationCompletedAt: new Date() } : {}),
        },
      },
    );
    if (finalAttempt) {
      await auditDomain('domain.activation_failed', AuditOutcome.FAILURE, data);
    }
    throw err;
  }
}

export async function handleRemoveDomain(job) {
  return handleRemoveDomainWithDependencies(job);
}

export async function handleRemoveDomainWithDependencies(
  job,
  {
    DomainModel = Domain,
    routeRemover = removeRoute,
    routeLock = withProjectRouteLock,
    workerEnv = env,
  } = {},
) {
  const data = job.data;
  const domain = await DomainModel.findById(data.domainId).lean();
  if (!domain || domain.status !== DomainStatus.REMOVING || !matchesOperation(domain, data)) {
    logger.info('RemoveDomain: stale removal attempt skipped', { domainId: data.domainId });
    return;
  }

  try {
    const removed = await routeLock(data.projectId, async () => {
      const freshDomain = await DomainModel.findById(data.domainId).lean();
      if (
        !freshDomain ||
        freshDomain.status !== DomainStatus.REMOVING ||
        !matchesOperation(freshDomain, data)
      ) {
        return false;
      }
      if (workerEnv.NGINX_ENABLED) {
        await routeRemover({ slug: customDomainRouteSlug(data.hostname) });
      }
      await DomainModel.updateOne(
        {
          _id: data.domainId,
          status: DomainStatus.REMOVING,
          lifecycleVersion: data.lifecycleVersion,
          operationId: data.operationId,
        },
        {
          $set: {
            status: DomainStatus.REMOVED,
            removedAt: new Date(),
            operationError: null,
            operationCompletedAt: new Date(),
          },
        },
      );
      return true;
    });
    if (!removed) {
      return;
    }
    await auditDomain('domain.removed', AuditOutcome.SUCCESS, data);
    logger.info('RemoveDomain: custom domain route removed', { hostname: data.hostname });
  } catch (err) {
    const finalAttempt = isFinalAttempt(job);
    await DomainModel.updateOne(
      {
        _id: data.domainId,
        lifecycleVersion: data.lifecycleVersion,
        operationId: data.operationId,
      },
      {
        $set: {
          status: finalAttempt
            ? data.previousStatus === DomainStatus.VERIFIED
              ? DomainStatus.VERIFIED
              : DomainStatus.ACTIVE
            : DomainStatus.REMOVING,
          operationError: finalAttempt ? REMOVAL_FAILED_COPY : 'Domain removal is retrying.',
          ...(finalAttempt ? { operationCompletedAt: new Date() } : {}),
        },
      },
    );
    if (finalAttempt) {
      await auditDomain('domain.removal_failed', AuditOutcome.FAILURE, data);
    }
    throw err;
  }
}

async function handleLegacyDomainJob(
  job,
  {
    DomainModel,
    ProjectModel,
    DeploymentModel,
    verifyDns,
    routeActivator,
    routeRemover,
    routeLock,
    workerEnv,
  },
) {
  const {
    domainId,
    projectId,
    hostname,
    activateRoute: shouldActivate,
    removeRoute: shouldRemove,
  } = job.data;
  const domain = await DomainModel.findById(domainId).lean();
  if (!domain) {
    return;
  }

  if (shouldRemove) {
    await routeLock(projectId, async () => {
      if (workerEnv.NGINX_ENABLED) {
        await routeRemover({ slug: customDomainRouteSlug(hostname) });
      }
    });
    return;
  }
  if (shouldActivate) {
    await routeLock(projectId, async () => {
      const freshDomain = await DomainModel.findById(domainId).lean();
      if (freshDomain?.status !== DomainStatus.PENDING_ADMIN_APPROVAL || !freshDomain.approvedAt) {
        return;
      }
      const project = await ProjectModel.findById(projectId).lean();
      const deployment = project?.activeDeploymentId
        ? await DeploymentModel.findById(project.activeDeploymentId).lean()
        : null;
      if (!workerEnv.NGINX_ENABLED || !deployment?.containerPort) {
        return;
      }
      await routeActivator({
        slug: customDomainRouteSlug(hostname),
        configContent: generateCustomDomainServerBlock({
          hostname,
          port: deployment.containerPort,
          deploymentId: deployment._id.toString(),
        }),
      });
      await DomainModel.updateOne(
        { _id: domainId },
        { $set: { status: DomainStatus.ACTIVE, activatedAt: new Date() } },
      );
    });
    return;
  }

  if (domain.status !== DomainStatus.PENDING_VERIFICATION || !domain.verificationTokenHash) {
    return;
  }
  if (await verifyDns(hostname, domain.verificationTokenHash)) {
    await DomainModel.updateOne(
      { _id: domainId },
      { $set: { status: DomainStatus.PENDING_ADMIN_APPROVAL, verifiedAt: new Date() } },
    );
  }
}

export { customDomainRouteSlug };
