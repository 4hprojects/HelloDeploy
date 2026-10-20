import mongoose from 'mongoose';
import { Project, Repository, Deployment, EnvironmentSecret } from '@hellodeploy/database';
import {
  DeploymentMode,
  DeploymentStatus,
  DeploymentTrigger,
  JobType,
  AuditOutcome,
  ProjectStatus,
  RepositorySourceType,
  PLATFORM_MANAGED_ENV_NAMES,
  BuildStrategy,
  RuntimeType,
  getBuildStrategyRuntime,
  isPythonBuildStrategy,
  validateApplicationModule,
  parseImageReference,
} from '@hellodeploy/contracts';
import { isActive, nextSequenceNumber } from '@hellodeploy/deployment-core';
import { writeAuditEvent } from '@hellodeploy/observability';
import { enqueueJob } from '@hellodeploy/queue';
import { getDeploymentQueue } from '../queue/client.js';
import { getLatestCommit, getPublicGithubLatestCommit } from './github.service.js';
import { recordProductEvent } from './product-analytics.service.js';
import { checkDeploymentQuota } from './quota.service.js';
import { env } from '../config/env.js';

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
  actorId,
  noCache = false,
  correlationId,
}) {
  return {
    version: 2,
    correlationId,
    actorId,
    actorRole: 'USER',
    projectId: project._id.toString(),
    deploymentId: deployment._id.toString(),
    noCache,
  };
}

/**
 * Check that a project's saved build strategy can be built. Returns an
 * owner-facing message, or null when the strategy is ready.
 *
 * @param {{ _id: unknown, runtimeType: string, buildStrategy?: string|null,
 *   buildConfiguration?: { applicationModule?: string|null } }} project
 * @param {(strategy: string|null|undefined, projectId: unknown) => boolean} isStrategyEnabledFor
 */
const PILOT_RUNTIMES = Object.freeze({
  [RuntimeType.PYTHON]: {
    label: 'Python',
    choice: 'Python framework',
    strategy: BuildStrategy.PYTHON_FLASK_V1,
  },
  [RuntimeType.PHP]: { label: 'PHP', choice: 'PHP app type', strategy: BuildStrategy.PHP_PLAIN_V1 },
  [RuntimeType.JAVA]: {
    label: 'Java',
    choice: 'Java build tool',
    strategy: BuildStrategy.JAVA_MAVEN_V1,
  },
});

export function validateBuildStrategyReadiness(project, isStrategyEnabledFor) {
  if (!isStrategyEnabledFor(project.buildStrategy, project._id)) {
    return 'The selected deployment mode is not enabled for this project.';
  }
  // The generated legacy images cover only the original Node-family runtimes,
  // so these runtimes need a saved strategy of their own.
  const pilotRuntime = PILOT_RUNTIMES[project.runtimeType];
  if (pilotRuntime && getBuildStrategyRuntime(project.buildStrategy) !== project.runtimeType) {
    return isStrategyEnabledFor(pilotRuntime.strategy, project._id)
      ? `Choose the ${pilotRuntime.choice} in the build settings and save them before deploying.`
      : `${pilotRuntime.label} apps are in a limited pilot that is not enabled for this project yet.`;
  }
  if (
    isPythonBuildStrategy(project.buildStrategy) &&
    validateApplicationModule(project.buildConfiguration?.applicationModule)
  ) {
    return 'Confirm the application module in the build settings before deploying.';
  }
  if (
    project.buildStrategy === BuildStrategy.OCI_IMAGE_V1 &&
    parseImageReference(project.buildConfiguration?.imageReference ?? '').error
  ) {
    return 'Enter a valid image reference in the build settings before deploying.';
  }
  return null;
}

export function createConfigurationSnapshot(project, commitSha) {
  const config = project.buildConfiguration ?? {};
  return {
    schemaVersion: 1,
    buildStrategy: project.buildStrategy ?? BuildStrategy.LEGACY_GENERATED,
    runtimeType: project.runtimeType,
    buildConfiguration: {
      buildCommand: config.buildCommand ?? null,
      startCommand: config.startCommand ?? null,
      outputDirectory: config.outputDirectory ?? null,
      applicationPort: config.applicationPort ?? null,
      healthCheckPath: config.healthCheckPath ?? '/',
      applicationRoot: config.applicationRoot ?? '.',
      applicationModule: config.applicationModule ?? null,
      dockerfilePath: config.dockerfilePath ?? null,
      imageReference: config.imageReference ?? null,
    },
    projectConfigurationVersion: project.configurationVersion,
    environmentVersion: project.environmentVersion ?? 1,
    sourceCommit: commitSha,
    sourceRepositoryId: project.repositoryId ?? null,
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

  if (
    targetDeployment.status !== DeploymentStatus.HEALTHY ||
    (!targetDeployment.imageRef && !targetDeployment.imageTag)
  ) {
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

const FULL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export const COMMIT_SHA_FORMAT_ERROR = 'Commit must be a full 40-character SHA (lowercase hex).';

/**
 * Create a new deployment record and enqueue the build job.
 * Enforces one-active-deployment-per-project invariant.
 *
 * `commitSha` optionally deploys a specific commit instead of the
 * repository's latest; the worker clones exact SHAs, so any commit
 * reachable in the repository is buildable.
 *
 * @param {{ projectId, actorId, triggerType?, noCache?, commitSha?, sourceIp?, correlationId? }} opts
 * @returns {{ success: boolean, deployment?: object, error?: string }}
 */
export async function createDeployment({
  projectId,
  actorId,
  triggerType = DeploymentTrigger.MANUAL,
  noCache = false,
  commitSha: commitShaOverride = null,
  sourceIp,
  correlationId,
}) {
  if (commitShaOverride !== null) {
    commitShaOverride = String(commitShaOverride).trim().toLowerCase();
    if (!FULL_COMMIT_SHA_PATTERN.test(commitShaOverride)) {
      return { success: false, error: COMMIT_SHA_FORMAT_ERROR, errorField: 'commitSha' };
    }
  }
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

  const strategyError = validateBuildStrategyReadiness(project, env.isStrategyEnabledFor);
  if (strategyError) {
    return { success: false, error: strategyError };
  }

  const quotaRefusal = await checkDeploymentQuota(project);
  if (quotaRefusal) {
    return { success: false, ...quotaRefusal };
  }

  // Detections stored before PORT became platform-managed still list it.
  const requiredNames = (project.detection?.requiredEnvironmentVariables ?? []).filter(
    (name) => !PLATFORM_MANAGED_ENV_NAMES.includes(name),
  );
  if (requiredNames.length > 0) {
    const configured = await EnvironmentSecret.find({ projectId }).distinct('name');
    const configuredNames = new Set(configured);
    const missing = requiredNames.filter((name) => !configuredNames.has(name));
    if (missing.length > 0) {
      return {
        success: false,
        error: `Set required environment variables before deploying: ${missing.join(', ')}.`,
      };
    }
  }

  const repo = await Repository.findById(project.repositoryId).lean();
  if (!repo || repo.accessStatus !== 'ACTIVE') {
    return { success: false, error: REPOSITORY_ACCESS_INACTIVE_COPY };
  }

  let targetCommitSha = commitShaOverride ?? repo.lastCommitSha;
  if (repo.sourceType === RepositorySourceType.PUBLIC_GIT) {
    try {
      const resolved = await getPublicGithubLatestCommit(
        repo,
        commitShaOverride ?? project.productionBranch ?? repo.defaultBranch,
      );
      targetCommitSha = resolved.sha;
      if (!commitShaOverride) {
        repo.lastCommitSha = resolved.sha;
        repo.lastCommitMessage = resolved.message;
        await Repository.updateOne(
          { _id: repo._id },
          {
            $set: {
              lastCommitSha: resolved.sha,
              lastCommitMessage: resolved.message,
              lastCommitAt: resolved.committedAt ?? new Date(),
              lastAccessCheckedAt: new Date(),
            },
          },
        );
      }
    } catch {
      return {
        success: false,
        error: 'The public repository commit could not be verified. Check access and try again.',
      };
    }
  }
  if (!targetCommitSha) {
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
    commitSha: targetCommitSha,
    // The commit message is only known for the tracked latest commit.
    commitMessage: commitShaOverride ? null : repo.lastCommitMessage,
    branch: project.productionBranch,
    configurationVersion: project.configurationVersion,
    configurationSnapshot: createConfigurationSnapshot(project, targetCommitSha),
    status: DeploymentStatus.QUEUED,
    startedAt: new Date(),
  });
  if (seqNum === 1) {
    await recordProductEvent({ name: 'first_deploy_started', userId: actorId, projectId });
  }

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

  await enqueueJob(
    queue,
    JobType.BUILD_DEPLOYMENT,
    buildDeploymentJobPayload({
      project,
      deployment,
      actorId,
      noCache,
      correlationId,
    }),
    { jobId: `deploy-${deployment._id.toString()}` }, // deduplication key
  );

  // A push or deploy hook runs on the owner's behalf, but nobody clicked deploy:
  // the audit log names the trigger, not the owner.
  const isUnattended =
    triggerType === DeploymentTrigger.AUTOMATIC || triggerType === DeploymentTrigger.SYSTEM;
  await writeAuditEvent({
    action: 'deployment.created',
    outcome: AuditOutcome.SUCCESS,
    actorId: isUnattended ? null : actorId,
    actorRole: isUnattended ? 'system' : null,
    targetType: 'deployment',
    targetId: deployment._id.toString(),
    sourceIp,
    correlationId,
    metadata: {
      projectId: projectId.toString(),
      sequenceNumber: seqNum,
      commitSha: targetCommitSha.slice(0, 7),
      triggerType,
    },
  });

  // A queued deployment supersedes any earlier high-risk-change pause — the
  // owner has now acted on (or past) whatever triggered the flag.
  await Project.updateOne({ _id: projectId }, { $set: { reviewFlag: { active: false } } });

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

  // A retry builds from the current settings, so it needs the same readiness
  // check as a new deployment.
  const strategyError = validateBuildStrategyReadiness(project, env.isStrategyEnabledFor);
  if (strategyError) {
    return { success: false, error: strategyError };
  }

  const repo = await Repository.findById(project.repositoryId).lean();
  if (!repo || repo.accessStatus !== 'ACTIVE') {
    return { success: false, error: REPOSITORY_ACCESS_INACTIVE_COPY };
  }

  const source = opts.source === 'latest' ? 'latest' : 'same';
  let commitSha = original.commitSha;
  let commitMessage = original.commitMessage;
  if (source === 'latest') {
    try {
      const latest =
        repo.sourceType === RepositorySourceType.PUBLIC_GIT
          ? await getPublicGithubLatestCommit(repo, project.productionBranch ?? repo.defaultBranch)
          : await getLatestCommit(
              repo.installationId,
              repo.fullName,
              project.productionBranch ?? repo.defaultBranch,
            );
      commitSha = latest.sha;
      commitMessage = latest.message;
      await Repository.updateOne(
        { _id: repo._id },
        {
          $set: {
            lastCommitSha: latest.sha,
            lastCommitMessage: latest.message,
            lastCommitAt: latest.committedAt ?? new Date(),
          },
        },
      );
    } catch {
      return { success: false, error: 'Could not resolve the latest production-branch commit.' };
    }
  }

  // One-active-deployment check
  const active = await findInFlightDeployment(original.projectId);
  if (active) {
    return { success: false, error: deploymentInProgressCopy(active.status) };
  }

  const seqNum = await nextSequenceNumber(Deployment, original.projectId);
  const deployment = await Deployment.create({
    projectId: original.projectId,
    sequenceNumber: seqNum,
    triggerType: DeploymentTrigger.MANUAL,
    requestedBy: actorId,
    commitSha,
    commitMessage,
    branch: project.productionBranch,
    configurationVersion: project.configurationVersion,
    configurationSnapshot: createConfigurationSnapshot(project, commitSha),
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
      commitSha: commitSha.slice(0, 7),
      source,
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

  // From the request body, so it may not be an id at all. An operator object
  // reaching findById would match an arbitrary deployment; the project check
  // below would catch a cross-project match, but the rollback should be refused
  // outright rather than relying on that.
  if (!mongoose.isValidObjectId(targetDeploymentId)) {
    return { success: false, error: 'Target deployment not found.' };
  }

  const targetDeployment = await Deployment.findById(targetDeploymentId).lean();
  if (!targetDeployment || targetDeployment.projectId.toString() !== projectId.toString()) {
    return { success: false, error: 'Target deployment not found.' };
  }

  if (targetDeployment.status !== DeploymentStatus.HEALTHY) {
    return { success: false, error: 'Can only roll back to a HEALTHY deployment.' };
  }

  if (!targetDeployment.imageRef && !targetDeployment.imageTag) {
    return { success: false, error: 'Target deployment image is no longer available.' };
  }

  // Cannot rollback to the currently active deployment
  if (!isRollbackTargetEligible(targetDeployment, projectId, project.activeDeploymentId)) {
    return { success: false, error: 'Target deployment is already active.' };
  }

  if (!env.isStrategyEnabledFor(targetDeployment.configurationSnapshot?.buildStrategy, projectId)) {
    return {
      success: false,
      error: 'That release uses a deployment mode that is not enabled for this project.',
    };
  }

  // Releases from before snapshots recorded nothing about how they were built,
  // so they can only roll back under the generated build they were made with.
  if (
    !targetDeployment.configurationSnapshot &&
    (project.buildStrategy ?? BuildStrategy.LEGACY_GENERATED) !== BuildStrategy.LEGACY_GENERATED
  ) {
    return {
      success: false,
      error:
        'This release was built before HelloDeploy recorded deployment settings, and the project now uses a different deployment mode. Deploy again instead of rolling back.',
    };
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
    branch: targetDeployment.branch ?? project.productionBranch,
    configurationVersion: project.configurationVersion,
    configurationSnapshot: targetDeployment.configurationSnapshot
      ? {
          ...targetDeployment.configurationSnapshot,
          environmentVersion: project.environmentVersion ?? 1,
        }
      : createConfigurationSnapshot(project, targetDeployment.commitSha),
    imageTag: targetDeployment.imageTag,
    imageRef: targetDeployment.imageRef,
    imageDigest: targetDeployment.imageDigest,
    status: DeploymentStatus.DEPLOYING,
    sourceDeploymentId: targetDeploymentId,
    replacedDeploymentId: project.activeDeploymentId ?? null,
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
      replacedDeploymentId: project.activeDeploymentId?.toString() ?? null,
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

export async function getDeploymentsPaginated(
  projectId,
  { page = 1, limit = 20, result = '', branch = '' } = {},
) {
  const safeLimit = Math.max(1, Number.parseInt(limit, 10) || 20);
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const query = { projectId };
  if (Object.values(DeploymentStatus).includes(result)) {
    query.status = result;
  }
  if (typeof branch === 'string' && branch.trim()) {
    query.branch = branch.trim().slice(0, 255);
  }
  const total = await Deployment.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  const safePage = Math.min(requestedPage, totalPages);
  const skip = (safePage - 1) * safeLimit;
  const deployments = await Deployment.find(query)
    .sort({ sequenceNumber: -1 })
    .skip(skip)
    .limit(safeLimit)
    .lean();

  return { deployments, total, page: safePage, limit: safeLimit, totalPages };
}

// Retention keeps only the last 3 HEALTHY releases' images; this cap is
// headroom above that, not a meaningful UX limit — a project's rollback
// history should never realistically need more candidates than this.
const MAX_ROLLBACK_TARGETS = 10;

export async function getRollbackTargets(projectId, activeDeploymentId) {
  return Deployment.find(buildRollbackTargetQuery(projectId, activeDeploymentId))
    .sort({ sequenceNumber: -1 })
    .limit(MAX_ROLLBACK_TARGETS)
    .lean();
}

export async function getDeployment(deploymentId) {
  return Deployment.findById(deploymentId).lean();
}
