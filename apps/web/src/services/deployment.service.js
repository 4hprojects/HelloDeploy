import { Project, Repository, Deployment } from '@hellodeploy/database';
import {
  DeploymentMode,
  DeploymentStatus,
  DeploymentTrigger,
  JobType,
  AuditOutcome,
  ProjectStatus,
} from '@hellodeploy/contracts';
import { isActive, nextSequenceNumber, buildImageTag } from '@hellodeploy/deployment-core';
import { writeAuditEvent } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { getDeploymentQueue } from '../queue/client.js';

const DEPLOYMENT_QUEUE_UNAVAILABLE_COPY =
  'Deployment queue is unavailable. Ask an administrator to check Redis and worker health, then try again.';

// A project may only have one deployment in flight at a time.
const IN_FLIGHT_STATUSES = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.VALIDATING,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
];

function findInFlightDeployment(projectId) {
  return Deployment.findOne({ projectId, status: { $in: IN_FLIGHT_STATUSES } }).lean();
}
const REPOSITORY_ACCESS_INACTIVE_COPY =
  'Repository access is inactive. Reconnect the GitHub App or update installation access, then retry.';

function deploymentInProgressCopy(status) {
  const suffix = status ? ` (${status.toLowerCase()})` : '';
  return `A deployment is already in progress${suffix}. Wait for it to finish, or cancel it from Deployments before starting another.`;
}

// ─── Create deployment ─────────────────────────────────────────────────────────

export function validateProjectDeploymentEligibility(project) {
  if (project.status !== ProjectStatus.ACTIVE) {
    return 'Project must be approved and active before deployment.';
  }

  if (project.deploymentMode === DeploymentMode.APPROVAL_REQUIRED) {
    return 'This project requires admin approval before deployments can run.';
  }

  return null;
}

export function buildDeploymentJobPayload({
  project,
  deployment,
  commitSha,
  repositoryId,
  runtimeType,
  imageTag,
  actorId,
  noCache = false,
  correlationId,
}) {
  return {
    version: 1,
    correlationId,
    actorId,
    actorRole: 'USER',
    projectId: project._id.toString(),
    deploymentId: deployment._id.toString(),
    commitSha,
    repositoryId: repositoryId.toString(),
    runtimeType,
    imageTag,
    noCache,
  };
}

export function parseNoCacheFlag(value) {
  return value === 'true' || value === '1';
}

export function isRetryableDeploymentStatus(status) {
  return [DeploymentStatus.FAILED, DeploymentStatus.CANCELLED].includes(status);
}

export function isRollbackTargetEligible(targetDeployment, projectId, activeDeploymentId) {
  if (!targetDeployment || targetDeployment.projectId.toString() !== projectId.toString()) {
    return false;
  }

  if (targetDeployment.status !== DeploymentStatus.HEALTHY || !targetDeployment.imageTag) {
    return false;
  }

  return activeDeploymentId?.toString() !== targetDeployment._id.toString();
}

export function buildRollbackReleaseJobPayload({
  projectId,
  deployment,
  targetDeploymentId,
  actorId,
  correlationId,
}) {
  return {
    version: 1,
    correlationId,
    actorId,
    actorRole: 'USER',
    projectId: projectId.toString(),
    deploymentId: deployment._id.toString(),
    sourceDeploymentId: targetDeploymentId.toString(),
  };
}

export function buildRollbackTargetQuery(projectId, activeDeploymentId) {
  const query = {
    projectId,
    status: DeploymentStatus.HEALTHY,
  };

  if (activeDeploymentId) {
    query._id = { $ne: activeDeploymentId };
  }

  return query;
}

/**
 * Create a new deployment record and enqueue the build job.
 * Enforces one-active-deployment-per-project invariant.
 *
 * @param {{ projectId, actorId, triggerType?, noCache?, sourceIp?, correlationId? }} opts
 * @returns {{ success: boolean, deployment?: object, error?: string }}
 */
export async function createDeployment({
  projectId,
  actorId,
  triggerType = DeploymentTrigger.MANUAL,
  noCache = false,
  sourceIp,
  correlationId,
}) {
  const project = await Project.findById(projectId).lean();
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  const eligibilityError = validateProjectDeploymentEligibility(project);
  if (eligibilityError) {
    return { success: false, error: eligibilityError };
  }

  if (!project.repositoryId) {
    return { success: false, error: 'No repository connected to this project.' };
  }

  if (!project.runtimeType) {
    return { success: false, error: 'Run project detection before deploying.' };
  }

  const repo = await Repository.findById(project.repositoryId).lean();
  if (!repo || repo.accessStatus !== 'ACTIVE') {
    return { success: false, error: REPOSITORY_ACCESS_INACTIVE_COPY };
  }

  if (!repo.lastCommitSha) {
    return {
      success: false,
      error: 'No commit SHA available. Push a commit to the production branch first.',
    };
  }

  // ── One-active-deployment-per-project check ─────────────────────────────────
  const active = await findInFlightDeployment(projectId);

  if (active) {
    return {
      success: false,
      error: deploymentInProgressCopy(active.status),
    };
  }

  // ── Create deployment record ────────────────────────────────────────────────
  const seqNum = await nextSequenceNumber(Deployment, projectId);

  const deployment = await Deployment.create({
    projectId,
    sequenceNumber: seqNum,
    triggerType,
    requestedBy: actorId,
    commitSha: repo.lastCommitSha,
    commitMessage: repo.lastCommitMessage,
    configurationVersion: project.configurationVersion,
    status: DeploymentStatus.QUEUED,
    startedAt: new Date(),
  });

  // ── Enqueue job ─────────────────────────────────────────────────────────────
  const queue = getDeploymentQueue();
  if (!queue) {
    // Redis unavailable — mark deployment failed immediately
    await Deployment.updateOne(
      { _id: deployment._id },
      {
        $set: {
          status: DeploymentStatus.FAILED,
          failureCode: 'QUEUE_UNAVAILABLE',
          failureSummary: 'Deployment queue is not available.',
          completedAt: new Date(),
        },
      },
    );
    return { success: false, error: DEPLOYMENT_QUEUE_UNAVAILABLE_COPY };
  }

  const imageTag = buildImageTag(project.slug, repo.lastCommitSha, seqNum);

  await enqueueJob(
    queue,
    JobType.BUILD_DEPLOYMENT,
    buildDeploymentJobPayload({
      project,
      deployment,
      commitSha: repo.lastCommitSha,
      repositoryId: project.repositoryId,
      runtimeType: project.runtimeType,
      imageTag,
      actorId,
      noCache,
      correlationId,
    }),
    { jobId: `deploy-${deployment._id.toString()}` }, // deduplication key
  );

  await writeAuditEvent({
    action: 'deployment.created',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'deployment',
    targetId: deployment._id.toString(),
    sourceIp,
    correlationId,
    metadata: {
      projectId: projectId.toString(),
      sequenceNumber: seqNum,
      commitSha: repo.lastCommitSha.slice(0, 7),
      triggerType,
    },
  });

  return { success: true, deployment };
}

// ─── Cancel deployment ──────────────────────────────────────────────────────────

/**
 * Cancel a deployment that is in a cancellable state (QUEUED or BUILDING).
 */
export async function cancelDeployment(deploymentId, projectId, actorId, opts = {}) {
  const deployment = await Deployment.findOne({ _id: deploymentId, projectId });
  if (!deployment) {
    return { success: false, error: 'Deployment not found.' };
  }

  if (!isActive(deployment.status)) {
    return {
      success: false,
      error: `Cannot cancel a deployment with status ${deployment.status}.`,
    };
  }

  await Deployment.updateOne(
    { _id: deploymentId },
    { $set: { status: DeploymentStatus.CANCELLED, completedAt: new Date() } },
  );

  await writeAuditEvent({
    action: 'deployment.cancelled',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'deployment',
    targetId: deploymentId.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: { projectId: deployment.projectId.toString() },
  });

  return { success: true };
}

// ─── Retry deployment ───────────────────────────────────────────────────────────

/**
 * Retry a failed/cancelled deployment using the exact same commit SHA.
 */
export async function retryDeployment(deploymentId, projectId, actorId, opts = {}) {
  const original = await Deployment.findOne({ _id: deploymentId, projectId }).lean();
  if (!original) {
    return { success: false, error: 'Deployment not found.' };
  }

  const project = await Project.findById(original.projectId).lean();
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  // Only allow retry on terminal non-HEALTHY states
  if (!isRetryableDeploymentStatus(original.status)) {
    return { success: false, error: `Cannot retry a deployment with status ${original.status}.` };
  }

  const repo = await Repository.findById(project.repositoryId).lean();
  if (!repo || repo.accessStatus !== 'ACTIVE') {
    return { success: false, error: REPOSITORY_ACCESS_INACTIVE_COPY };
  }

  // One-active-deployment check
  const active = await findInFlightDeployment(original.projectId);
  if (active) {
    return { success: false, error: deploymentInProgressCopy(active.status) };
  }

  const seqNum = await nextSequenceNumber(Deployment, original.projectId);
  const imageTag = buildImageTag(project.slug, original.commitSha, seqNum);

  const deployment = await Deployment.create({
    projectId: original.projectId,
    sequenceNumber: seqNum,
    triggerType: DeploymentTrigger.MANUAL,
    requestedBy: actorId,
    commitSha: original.commitSha,
    commitMessage: original.commitMessage,
    configurationVersion: project.configurationVersion,
    status: DeploymentStatus.QUEUED,
    startedAt: new Date(),
  });

  const queue = getDeploymentQueue();
  if (!queue) {
    await Deployment.updateOne(
      { _id: deployment._id },
      {
        $set: {
          status: DeploymentStatus.FAILED,
          failureCode: 'QUEUE_UNAVAILABLE',
          completedAt: new Date(),
        },
      },
    );
    return { success: false, error: DEPLOYMENT_QUEUE_UNAVAILABLE_COPY };
  }

  await enqueueJob(
    queue,
    JobType.BUILD_DEPLOYMENT,
    buildDeploymentJobPayload({
      project: { ...project, _id: original.projectId },
      deployment,
      commitSha: original.commitSha,
      repositoryId: project.repositoryId,
      runtimeType: project.runtimeType,
      imageTag,
      actorId,
      noCache: false,
      correlationId: opts.correlationId,
    }),
    { jobId: `deploy-${deployment._id.toString()}` },
  );

  await writeAuditEvent({
    action: 'deployment.retried',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'deployment',
    targetId: deployment._id.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: {
      projectId: original.projectId.toString(),
      originalDeploymentId: deploymentId.toString(),
      commitSha: original.commitSha.slice(0, 7),
    },
  });

  return { success: true, deployment };
}

// ─── Rollback ───────────────────────────────────────────────────────────────────

/**
 * Roll back a project to a specific past HEALTHY deployment.
 * Creates a new ROLLBACK deployment record and enqueues the job.
 */
export async function rollbackDeployment(projectId, targetDeploymentId, actorId, opts = {}) {
  const project = await Project.findById(projectId).lean();
  if (!project) {
    return { success: false, error: 'Project not found.' };
  }

  const targetDeployment = await Deployment.findById(targetDeploymentId).lean();
  if (!targetDeployment || targetDeployment.projectId.toString() !== projectId.toString()) {
    return { success: false, error: 'Target deployment not found.' };
  }

  if (targetDeployment.status !== DeploymentStatus.HEALTHY) {
    return { success: false, error: 'Can only roll back to a HEALTHY deployment.' };
  }

  if (!targetDeployment.imageTag) {
    return { success: false, error: 'Target deployment image is no longer available.' };
  }

  // Cannot rollback to the currently active deployment
  if (!isRollbackTargetEligible(targetDeployment, projectId, project.activeDeploymentId)) {
    return { success: false, error: 'Target deployment is already active.' };
  }

  // One-active-deployment check
  const active = await findInFlightDeployment(projectId);
  if (active) {
    return { success: false, error: deploymentInProgressCopy(active.status) };
  }

  const seqNum = await nextSequenceNumber(Deployment, projectId);

  const deployment = await Deployment.create({
    projectId,
    sequenceNumber: seqNum,
    triggerType: DeploymentTrigger.ROLLBACK,
    requestedBy: actorId,
    commitSha: targetDeployment.commitSha,
    commitMessage: targetDeployment.commitMessage,
    configurationVersion: project.configurationVersion,
    status: DeploymentStatus.DEPLOYING,
    sourceDeploymentId: targetDeploymentId,
    startedAt: new Date(),
  });

  const queue = getDeploymentQueue();
  if (!queue) {
    await Deployment.updateOne(
      { _id: deployment._id },
      {
        $set: {
          status: DeploymentStatus.FAILED,
          failureCode: 'QUEUE_UNAVAILABLE',
          completedAt: new Date(),
        },
      },
    );
    return { success: false, error: DEPLOYMENT_QUEUE_UNAVAILABLE_COPY };
  }

  await enqueueJob(
    queue,
    JobType.ROLLBACK_RELEASE,
    buildRollbackReleaseJobPayload({
      projectId,
      deployment,
      targetDeploymentId,
      actorId,
      correlationId: opts.correlationId,
    }),
    { jobId: `rollback-${deployment._id.toString()}` },
  );

  await writeAuditEvent({
    action: 'deployment.rollback_requested',
    outcome: AuditOutcome.SUCCESS,
    actorId,
    targetType: 'deployment',
    targetId: deployment._id.toString(),
    sourceIp: opts.sourceIp,
    correlationId: opts.correlationId,
    metadata: {
      projectId: projectId.toString(),
      targetDeploymentId: targetDeploymentId.toString(),
      targetSequenceNumber: targetDeployment.sequenceNumber,
    },
  });

  return { success: true, deployment };
}

// ─── Deployment events ──────────────────────────────────────────────────────────

export async function getDeploymentEvents(deploymentId, opts = {}) {
  const { afterId, limit = 500 } = opts;
  const { DeploymentEvent } = await import('@hellodeploy/database');

  const query = { deploymentId };
  if (afterId) {
    query._id = { $gt: afterId };
  }

  return DeploymentEvent.find(query).sort({ _id: 1 }).limit(limit).lean();
}

// ─── Query helpers ──────────────────────────────────────────────────────────────

export async function getDeployments(projectId, limit = 20) {
  return Deployment.find({ projectId }).sort({ sequenceNumber: -1 }).limit(limit).lean();
}

export async function getDeploymentsPaginated(projectId, { page = 1, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 20);
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const total = await Deployment.countDocuments({ projectId });
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const safePage = Math.min(requestedPage, totalPages);
  const skip = (safePage - 1) * safeLimit;
  const deployments = await Deployment.find({ projectId })
    .sort({ sequenceNumber: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  return { deployments, total, page: safePage, limit: safeLimit, totalPages };
}

export async function getRollbackTargets(projectId, activeDeploymentId) {
  return Deployment.find(buildRollbackTargetQuery(projectId, activeDeploymentId))
    .sort({ sequenceNumber: -1 })
    .lean();
}

export async function getDeployment(deploymentId) {
  return Deployment.findById(deploymentId).lean();
}
