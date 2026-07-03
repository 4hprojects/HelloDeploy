import { join } from 'node:path';
import { Project, Repository, Deployment } from '@hellodeploy/database';
import { DeploymentStatus, JobType } from '@hellodeploy/contracts';
import { enqueueJob } from '@hellodeploy/queue';
import { logger } from '@hellodeploy/observability';
import { env } from '../config/env.js';
import { getInstallationToken } from '../git/github-token.js';
import { cloneExactCommit } from '../git/clone.js';
import { prepareBuildContext } from '../deployment/build-context.js';
import { generateDockerfile } from '../deployment/dockerfile-generator.js';
import { writeDockerfile, buildDockerImage, removeDockerImage } from '../deployment/build.js';
import { cleanupBuildWorkspace } from '../deployment/cleanup.js';
import { logEvent, updateStatus } from '../deployment/pipeline.js';

// ─── Job handler ───────────────────────────────────────────────────────────────

async function enqueueActivateRelease(payload, jobId) {
  // Import lazily to avoid circular dependency with worker.js
  const { getWorkerQueue } = await import('../queue/worker-queue.js');
  const queue = getWorkerQueue();
  if (queue) {
    await enqueueJob(queue, JobType.ACTIVATE_RELEASE, payload, { jobId });
  }
}

const defaultDeps = {
  getInstallationToken,
  cloneExactCommit,
  prepareBuildContext,
  writeDockerfile,
  buildDockerImage,
  removeDockerImage,
  cleanupBuildWorkspace,
  enqueueActivateRelease,
};

/**
 * BUILD_DEPLOYMENT job handler.
 *
 * Payload: BuildDeploymentPayload
 * Steps:
 *   1. Re-validate project state (idempotency / lock check)
 *   2. Transition to VALIDATING
 *   3. Clone exact commit SHA
 *   4. Prepare build context (path safety, size, remove user Dockerfiles)
 *   5. Generate safe Dockerfile
 *   6. Transition to BUILDING
 *   7. docker build with timeout + resource limits
 *   8. Transition to DEPLOYING (Phase 6 will start the container)
 *   9. Cleanup workspace
 *
 * On any failure: mark FAILED, cleanup workspace, remove partial image.
 */
export async function handleBuildDeployment(job, deps = defaultDeps) {
  const {
    projectId,
    deploymentId,
    commitSha,
    repositoryId,
    runtimeType,
    imageTag,
    noCache,
    correlationId,
  } = job.data;

  const workDir = join(env.BUILD_WORKSPACE_ROOT, deploymentId);

  // ── Load deployment record ──────────────────────────────────────────────────
  const deployment = await Deployment.findById(deploymentId);
  if (!deployment) {
    logger.error('BuildDeployment: deployment record not found', { deploymentId });
    return;
  }

  // Guard: if already in a terminal state (e.g., cancelled while in queue), stop
  if (![DeploymentStatus.QUEUED].includes(deployment.status)) {
    logger.info('BuildDeployment: skipping non-QUEUED deployment', {
      deploymentId,
      status: deployment.status,
    });
    return;
  }

  // ── VALIDATE stage ──────────────────────────────────────────────────────────
  await updateStatus(deploymentId, DeploymentStatus.VALIDATING);
  await logEvent(deploymentId, 'VALIDATE', 'INFO', 'Deployment validation started.', correlationId);

  const project = await Project.findById(projectId);
  const repo = await Repository.findById(repositoryId);

  if (!project || !repo) {
    await updateStatus(deploymentId, DeploymentStatus.FAILED, {
      failureCode: 'PROJECT_NOT_FOUND',
      failureSummary: 'Project or repository record not found.',
      completedAt: new Date(),
    });
    return;
  }

  if (repo.accessStatus !== 'ACTIVE') {
    await updateStatus(deploymentId, DeploymentStatus.FAILED, {
      failureCode: 'REPO_ACCESS_REVOKED',
      failureSummary: 'Repository access has been revoked.',
      completedAt: new Date(),
    });
    return;
  }

  // ── Clone ───────────────────────────────────────────────────────────────────
  let installationToken;
  try {
    installationToken = await deps.getInstallationToken(repo.installationId);
  } catch {
    await logEvent(
      deploymentId,
      'VALIDATE',
      'ERROR',
      'Failed to obtain GitHub token.',
      correlationId,
    );
    await updateStatus(deploymentId, DeploymentStatus.FAILED, {
      failureCode: 'GITHUB_TOKEN_FAILED',
      failureSummary: 'Could not obtain GitHub installation token.',
      completedAt: new Date(),
    });
    return;
  }

  try {
    await deps.cloneExactCommit({
      installationToken,
      ownerLogin: repo.ownerLogin,
      repoName: repo.name,
      commitSha,
      workDir,
    });
    await logEvent(
      deploymentId,
      'VALIDATE',
      'INFO',
      `Cloned commit ${commitSha.slice(0, 7)}.`,
      correlationId,
    );
  } catch (err) {
    await logEvent(
      deploymentId,
      'VALIDATE',
      'ERROR',
      `Clone failed: ${err.message}`,
      correlationId,
    );
    await updateStatus(deploymentId, DeploymentStatus.FAILED, {
      failureCode: 'CLONE_FAILED',
      failureSummary: `Repository clone failed: ${err.message}`.slice(0, 1000),
      completedAt: new Date(),
    });
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  // ── Prepare build context ───────────────────────────────────────────────────
  try {
    await deps.prepareBuildContext(workDir);
    await logEvent(deploymentId, 'VALIDATE', 'INFO', 'Build context validated.', correlationId);
  } catch (err) {
    await logEvent(
      deploymentId,
      'VALIDATE',
      'ERROR',
      `Build context error: ${err.message}`,
      correlationId,
    );
    await updateStatus(deploymentId, DeploymentStatus.FAILED, {
      failureCode: 'BUILD_CONTEXT_INVALID',
      failureSummary: err.message.slice(0, 1000),
      completedAt: new Date(),
    });
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  // ── Generate Dockerfile ─────────────────────────────────────────────────────
  let dockerfileContent;
  try {
    dockerfileContent = generateDockerfile({
      runtimeType,
      buildCommand: project.buildConfiguration?.buildCommand ?? null,
      startCommand: project.buildConfiguration?.startCommand ?? null,
      outputDirectory: project.buildConfiguration?.outputDirectory ?? null,
      applicationPort: project.buildConfiguration?.applicationPort ?? null,
    });
    await deps.writeDockerfile(workDir, dockerfileContent);
    await logEvent(
      deploymentId,
      'VALIDATE',
      'INFO',
      `Generated Dockerfile for ${runtimeType}.`,
      correlationId,
    );
  } catch (err) {
    await logEvent(
      deploymentId,
      'VALIDATE',
      'ERROR',
      `Dockerfile generation failed: ${err.message}`,
      correlationId,
    );
    await updateStatus(deploymentId, DeploymentStatus.FAILED, {
      failureCode: 'DOCKERFILE_GENERATION_FAILED',
      failureSummary: err.message.slice(0, 1000),
      completedAt: new Date(),
    });
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  // ── BUILD stage ─────────────────────────────────────────────────────────────
  await updateStatus(deploymentId, DeploymentStatus.BUILDING);
  await logEvent(
    deploymentId,
    'BUILD',
    'INFO',
    `Starting docker build. Image: ${imageTag}`,
    correlationId,
  );

  try {
    await deps.buildDockerImage({
      contextDir: workDir,
      imageTag,
      buildTimeoutMs: env.BUILD_TIMEOUT_MS,
      noCache: noCache === true,
      onLogLine: async (line, stream) => {
        await logEvent(
          deploymentId,
          'BUILD',
          stream === 'stderr' ? 'WARN' : 'INFO',
          line,
          correlationId,
        ).catch(() => {}); // non-fatal if log write fails
      },
    });
    await logEvent(
      deploymentId,
      'BUILD',
      'INFO',
      `Build succeeded. Image: ${imageTag}`,
      correlationId,
    );
  } catch (err) {
    await logEvent(deploymentId, 'BUILD', 'ERROR', `Build failed: ${err.message}`, correlationId);
    await updateStatus(deploymentId, DeploymentStatus.FAILED, {
      failureCode: 'BUILD_FAILED',
      failureSummary: err.message.slice(0, 1000),
      completedAt: new Date(),
    });
    await deps.removeDockerImage(imageTag);
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  // ── Transition to DEPLOYING and enqueue ACTIVATE_RELEASE ───────────────────
  await updateStatus(deploymentId, DeploymentStatus.DEPLOYING, { imageTag });
  await logEvent(
    deploymentId,
    'BUILD',
    'INFO',
    `Image ready. Queuing container activation.`,
    correlationId,
  );

  // Cleanup build workspace before activation — image is in the Docker daemon
  await deps.cleanupBuildWorkspace(workDir);

  // Enqueue the ACTIVATE_RELEASE job — worker picks it up next
  await deps.enqueueActivateRelease(
    {
      version: 1,
      correlationId,
      actorId: job.data.actorId,
      actorRole: job.data.actorRole,
      projectId,
      deploymentId,
      imageId: imageTag,
      targetPort: project.buildConfiguration?.applicationPort ?? 3000,
      resourceLimits: { memoryMb: 256, cpuShares: 256, pidsLimit: 100 },
    },
    `activate-${deploymentId}`,
  );

  logger.info('BuildDeployment: job complete', {
    deploymentId,
    imageTag,
    projectId,
  });
}
