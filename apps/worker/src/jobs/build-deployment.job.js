import { join } from 'node:path';
import { Project, Repository, Deployment, resolveProjectQuota } from '@hellodeploy/database';
import {
  DeploymentStatus,
  JobType,
  RepositorySourceType,
  RuntimeType,
  BuildStrategy,
  isNextBuildStrategy,
  isPhpBuildStrategy,
  isPythonBuildStrategy,
  resolvePhpVersion,
  resolvePythonVersion,
} from '@hellodeploy/contracts';
import { enqueueJob } from '@hellodeploy/queue';
import { logger } from '@hellodeploy/observability';
import { env } from '../config/env.js';
import { getInstallationToken } from '../git/github-token.js';
import { cloneExactCommit, clonePublicExactCommit } from '../git/clone.js';
import {
  prepareBuildContext,
  resolveApplicationRoot,
  writePlatformDockerignore,
  listRootEnvFiles,
  readOptionalContextFile,
} from '../deployment/build-context.js';
import { writeDockerfile, buildDockerImage, removeDockerImage } from '../deployment/build.js';
import { getProjectEnvVars } from '../deployment/secrets.js';
import { selectPublicBuildEnv } from '../deployment/public-build-env.js';
import { notifyDeploymentResult } from '../notification/deployment-notification.js';
import { cleanupBuildWorkspace } from '../deployment/cleanup.js';
import {
  ImageTemplateVersion,
  resolveImageTemplateVersion,
} from '../deployment/template-policy.js';
import { resolveBuildProfile } from '../deployment/build-profile.js';
import { logEvent, updateStatus, toResourceLimits } from '../deployment/pipeline.js';
import { buildImageTag } from '@hellodeploy/deployment-core';
import { resolveBuildStrategy } from '../deployment/build-strategy.js';
import { createBuildExecutor } from '../deployment/build-executor.js';
import { deleteRegistryManifest } from '../deployment/registry.js';

// ─── Job handler ───────────────────────────────────────────────────────────────

// Retries only the clone step, and only for errors that look like a transient
// network stall rather than a deterministic failure (bad SHA, revoked repo,
// oversized archive). WHY: this host has shown real, evidenced connectivity
// blips to GitHub specifically (CLONE_FAILED incidents 2026-08-14/15/16) that
// clear within seconds — a short retry avoids turning one blip into a failed
// deployment that needs a manual re-trigger.
const CLONE_RETRY_ATTEMPTS = 3;
const CLONE_RETRY_BACKOFF_MS = [3000, 9000];

function isRetryableCloneError(err) {
  return (
    err.name === 'TimeoutError' ||
    err.name === 'AbortError' ||
    err.message === 'git operation timed out' ||
    err.message === 'fetch failed'
  );
}

// WHY: a workspace the worker can't write to (wrong owner on BUILD_WORKSPACE_ROOT,
// full disk) surfaces from the clone step, but blaming GitHub sends the owner
// checking their repository for a fault that lives on this host.
const LOCAL_FS_ERROR_CODES = new Set(['EACCES', 'EPERM', 'ENOSPC', 'EROFS']);

async function cloneWithRetry(cloneFn, sleep, onRetry) {
  for (let attempt = 1; attempt <= CLONE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await cloneFn();
    } catch (err) {
      if (attempt === CLONE_RETRY_ATTEMPTS || !isRetryableCloneError(err)) {
        throw err;
      }
      await onRetry(attempt, err);
      await sleep(CLONE_RETRY_BACKOFF_MS[attempt - 1]);
    }
  }
  return undefined; // unreachable — loop always returns or throws
}

async function enqueueActivateRelease(payload, jobId) {
  // Import lazily to avoid circular dependency with worker.js
  const { getWorkerQueue } = await import('../queue/worker-queue.js');
  const queue = getWorkerQueue();
  if (!queue) {
    // Silently skipping here would strand the deployment in DEPLOYING forever
    // while the build reports success — the caller must mark it FAILED.
    throw new Error('Worker queue is not initialized — cannot enqueue release activation.');
  }
  await enqueueJob(queue, JobType.ACTIVATE_RELEASE, payload, { jobId });
}

const defaultDeps = {
  getInstallationToken,
  cloneExactCommit,
  clonePublicExactCommit,
  prepareBuildContext,
  resolveApplicationRoot,
  writePlatformDockerignore,
  listRootEnvFiles,
  readOptionalContextFile,
  resolveBuildProfile,
  writeDockerfile,
  buildDockerImage,
  getProjectEnvVars,
  removeDockerImage,
  cleanupBuildWorkspace,
  enqueueActivateRelease,
  notifyDeploymentResult,
  deleteRegistryManifest,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

async function removeBuiltArtifact(builtImage, imageTag, deps) {
  if (builtImage?.imageRef?.includes('@sha256:') && deps.deleteRegistryManifest) {
    await deps.deleteRegistryManifest(builtImage.imageRef).catch(() => {});
  }
  await deps.removeDockerImage(builtImage?.imageRef ?? imageTag);
}

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
    commitSha: legacyCommitSha,
    repositoryId: legacyRepositoryId,
    runtimeType: legacyRuntimeType,
    imageTag: legacyImageTag,
    noCache,
    correlationId,
  } = job.data;

  const workDir = join(env.BUILD_WORKSPACE_ROOT, deploymentId);
  const requestedTemplateVersion = resolveImageTemplateVersion({
    defaultVersion: env.USER_IMAGE_TEMPLATE_VERSION,
    optimizedProjectIds: env.USER_IMAGE_OPTIMIZED_PROJECT_IDS,
    projectId,
  });

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
  const snapshot =
    job.data.version >= 2
      ? (deployment.configurationSnapshot?.toObject?.() ?? deployment.configurationSnapshot)
      : null;
  const commitSha = snapshot?.sourceCommit ?? legacyCommitSha;
  const runtimeType = snapshot?.runtimeType ?? legacyRuntimeType;
  const buildStrategy = snapshot?.buildStrategy ?? BuildStrategy.LEGACY_GENERATED;
  const buildConfiguration = snapshot?.buildConfiguration ?? project?.buildConfiguration;
  const repositoryId = legacyRepositoryId ?? project?.repositoryId;
  const imageTag =
    legacyImageTag ??
    (project && commitSha
      ? buildImageTag(project.slug, commitSha, deployment.sequenceNumber)
      : null);
  const repo = repositoryId ? await Repository.findById(repositoryId) : null;
  const failBuild = (extra) =>
    updateStatus(deploymentId, DeploymentStatus.FAILED, extra, { project, deps });

  if (!project || !repo) {
    await failBuild({
      failureCode: 'PROJECT_NOT_FOUND',
      failureSummary: 'Project or repository record not found.',
      completedAt: new Date(),
    });
    return;
  }

  if (!/^[0-9a-f]{40}$/.test(commitSha ?? '') || !runtimeType || !imageTag || !buildConfiguration) {
    await failBuild({
      failureCode: 'DEPLOYMENT_SNAPSHOT_INVALID',
      failureSummary: 'Deployment configuration snapshot is incomplete.',
      completedAt: new Date(),
    });
    return;
  }
  if (snapshot && (project.environmentVersion ?? 1) !== (snapshot.environmentVersion ?? 1)) {
    await failBuild({
      failureCode: 'CONFIGURATION_CHANGED',
      failureSummary: 'Environment variables changed after this deployment was queued.',
      completedAt: new Date(),
    });
    return;
  }
  if (!env.isStrategyEnabledFor(buildStrategy, projectId)) {
    await failBuild({
      failureCode: 'BUILD_STRATEGY_DISABLED',
      failureSummary: `The selected ${buildStrategy} build strategy is not enabled for this project.`,
      completedAt: new Date(),
    });
    return;
  }

  if (repo.accessStatus !== 'ACTIVE') {
    await failBuild({
      failureCode: 'REPO_ACCESS_REVOKED',
      failureSummary: 'Repository access has been revoked.',
      completedAt: new Date(),
    });
    return;
  }

  // ── Clone ───────────────────────────────────────────────────────────────────
  try {
    const onRetry = (attempt, err) =>
      logEvent(
        deploymentId,
        'VALIDATE',
        'WARN',
        `Clone attempt ${attempt} failed transiently (${err.message}); retrying.`,
        correlationId,
      );

    if (repo.sourceType === RepositorySourceType.PUBLIC_GIT) {
      await cloneWithRetry(
        () =>
          deps.clonePublicExactCommit({
            ownerLogin: repo.ownerLogin,
            repoName: repo.name,
            commitSha,
            workDir,
          }),
        deps.sleep,
        onRetry,
      );
    } else {
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
        await failBuild({
          failureCode: 'GITHUB_TOKEN_FAILED',
          failureSummary: 'Could not obtain GitHub installation token.',
          completedAt: new Date(),
        });
        return;
      }
      await cloneWithRetry(
        () =>
          deps.cloneExactCommit({
            installationToken,
            ownerLogin: repo.ownerLogin,
            repoName: repo.name,
            commitSha,
            workDir,
          }),
        deps.sleep,
        onRetry,
      );
    }
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
    await failBuild({
      failureCode: LOCAL_FS_ERROR_CODES.has(err.code) ? 'BUILD_WORKSPACE_FAILED' : 'CLONE_FAILED',
      failureSummary: `Repository clone failed: ${err.message}`.slice(0, 1000),
      completedAt: new Date(),
    });
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  // ── Prepare build context ───────────────────────────────────────────────────
  let contextDir = workDir;
  try {
    await deps.prepareBuildContext(workDir);
    // V1 jobs predate application roots and must retain their exact repository-
    // root behavior during the rolling upgrade. V2 jobs consume the immutable
    // snapshot and resolve its explicitly captured root.
    if (snapshot) {
      contextDir = await deps.resolveApplicationRoot(
        workDir,
        buildConfiguration.applicationRoot ?? '.',
      );
    }
    if (contextDir !== workDir) {
      await deps.prepareBuildContext(contextDir);
    }
    await logEvent(deploymentId, 'VALIDATE', 'INFO', 'Build context validated.', correlationId);
  } catch (err) {
    await logEvent(
      deploymentId,
      'VALIDATE',
      'ERROR',
      `Build context error: ${err.message}`,
      correlationId,
    );
    await failBuild({
      failureCode: 'BUILD_CONTEXT_INVALID',
      failureSummary: err.message.slice(0, 1000),
      completedAt: new Date(),
    });
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  let buildProfile;
  try {
    buildProfile = await deps.resolveBuildProfile({
      contextDir,
      runtimeType,
      requestedTemplateVersion:
        buildStrategy === BuildStrategy.LEGACY_GENERATED
          ? requestedTemplateVersion
          : ImageTemplateVersion.LEGACY,
    });
    // Static images serve the whole context from the web root, so the platform
    // exclusions apply to every static build: legacy included, since nothing in a
    // static site reads `.env` and anything left in would be publicly downloadable.
    const shouldExcludeContextFiles =
      buildProfile.templateVersion === ImageTemplateVersion.OPTIMIZED_V1 ||
      runtimeType === RuntimeType.STATIC ||
      buildStrategy !== BuildStrategy.LEGACY_GENERATED;
    const rootEnvFiles = await deps.listRootEnvFiles(contextDir);
    if (shouldExcludeContextFiles) {
      await deps.writePlatformDockerignore(contextDir);
      if (rootEnvFiles.length > 0) {
        await logEvent(
          deploymentId,
          'VALIDATE',
          'WARN',
          `Committed environment files are excluded from the image: ${rootEnvFiles.join(', ')}. Set these values as HelloDeploy environment variables instead.`,
          correlationId,
        );
      }
    } else if (
      [RuntimeType.EXPRESS, RuntimeType.NODEJS].includes(runtimeType) &&
      rootEnvFiles.length > 0
    ) {
      // Legacy Node images copy the whole source, and the app may load these at
      // runtime, so they stay in — but the owner should know they ship.
      await logEvent(
        deploymentId,
        'VALIDATE',
        'WARN',
        `Committed environment files are included in the image: ${rootEnvFiles.join(', ')}. Move these values to HelloDeploy environment variables and remove the files from the repository.`,
        correlationId,
      );
    }
    if (buildProfile.fallbackReason) {
      await logEvent(
        deploymentId,
        'VALIDATE',
        'WARN',
        `Using legacy image template: ${buildProfile.fallbackReason}.`,
        correlationId,
      );
    }
  } catch (err) {
    await logEvent(
      deploymentId,
      'VALIDATE',
      'ERROR',
      `Build profile error: ${err.message}`,
      correlationId,
    );
    await failBuild({
      failureCode: 'BUILD_CONTEXT_INVALID',
      failureSummary: err.message.slice(0, 1000),
      completedAt: new Date(),
    });
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  // ── Generate Dockerfile ─────────────────────────────────────────────────────
  // Frontend frameworks compile their public configuration into the bundle at
  // build time, so those values have to be present now — at container start is
  // too late, and the app ships with `undefined` in place of them. Only the
  // public subset is eligible; the rest is injected when the container starts.
  let publicBuildEnv = {};
  try {
    publicBuildEnv = selectPublicBuildEnv(await deps.getProjectEnvVars(project._id));
  } catch (err) {
    await logEvent(
      deploymentId,
      'VALIDATE',
      'ERROR',
      `Could not read project environment: ${err.message}`,
      correlationId,
    );
    await failBuild({
      failureCode: 'BUILD_FAILED',
      failureSummary: 'Could not read project environment.',
      completedAt: new Date(),
    });
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  let buildSpec;
  try {
    // Versions come from the cloned commit so a rebuild of the same commit
    // always selects the same interpreter.
    let pythonVersion = null;
    let phpVersion = null;
    if (isPythonBuildStrategy(buildStrategy)) {
      const resolved = resolvePythonVersion(
        await deps.readOptionalContextFile(contextDir, '.python-version', 1024),
      );
      if (resolved.error) {
        throw new Error(resolved.error);
      }
      pythonVersion = resolved.version;
    }
    if (isPhpBuildStrategy(buildStrategy)) {
      const resolved = resolvePhpVersion(
        await deps.readOptionalContextFile(contextDir, 'composer.json', 256 * 1024),
      );
      if (resolved.error) {
        throw new Error(resolved.error);
      }
      phpVersion = resolved.version;
    }
    buildSpec = resolveBuildStrategy({
      pythonVersion,
      phpVersion,
      snapshot: {
        buildStrategy,
        runtimeType,
        buildConfiguration,
      },
      buildArgNames: Object.keys(publicBuildEnv),
      templateVersion: buildProfile.templateVersion,
    });
    await deps.writeDockerfile(contextDir, buildSpec.dockerfileContent);
    await logEvent(
      deploymentId,
      'VALIDATE',
      'INFO',
      `Generated ${buildSpec.strategyId} Dockerfile for ${runtimeType}.`,
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
    await failBuild({
      failureCode: 'DOCKERFILE_GENERATION_FAILED',
      failureSummary: err.message.slice(0, 1000),
      completedAt: new Date(),
    });
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  // ── BUILD stage ─────────────────────────────────────────────────────────────
  const quota = await resolveProjectQuota(project._id, project.ownerId);
  // BUILD_TIMEOUT_MS stays a host-wide ceiling over any per-project quota.
  const buildTimeoutMs = Math.min(quota.buildTimeoutSeconds * 1000, env.BUILD_TIMEOUT_MS);
  await updateStatus(deploymentId, DeploymentStatus.BUILDING);
  await logEvent(
    deploymentId,
    'BUILD',
    'INFO',
    `Starting docker build. Image: ${imageTag}`,
    correlationId,
  );

  let builtImage;
  try {
    const buildOptions = {
      contextDir,
      localImageTag: imageTag,
      registryTag: `${project.slug}-${deployment._id.toString()}`,
      buildTimeoutMs,
      buildMemoryMb: env.BUILD_MEMORY_MB,
      noCache: noCache === true,
      buildArgs: publicBuildEnv,
      onLogLine: async (line, stream) => {
        await logEvent(
          deploymentId,
          'BUILD',
          stream === 'stderr' ? 'WARN' : 'INFO',
          line,
          correlationId,
        ).catch(() => {}); // non-fatal if log write fails
      },
    };
    if (snapshot) {
      const executor =
        deps.buildExecutor ??
        createBuildExecutor({
          mode: env.BUILD_EXECUTOR,
          builderName: env.BUILD_BUILDER_NAME,
          registryPrefix: env.USER_IMAGE_REGISTRY,
          deps,
        });
      builtImage = await executor.build(buildOptions);
    } else {
      await deps.buildDockerImage({
        ...buildOptions,
        imageTag,
        builderName: env.BUILD_BUILDER_NAME,
      });
      builtImage = { imageRef: imageTag, imageDigest: null };
    }
    await logEvent(
      deploymentId,
      'BUILD',
      'INFO',
      `Build succeeded. Image: ${imageTag}`,
      correlationId,
    );
  } catch (err) {
    await logEvent(deploymentId, 'BUILD', 'ERROR', `Build failed: ${err.message}`, correlationId);
    await failBuild({
      failureCode: 'BUILD_FAILED',
      failureSummary: (isNextBuildStrategy(buildStrategy)
        ? `Next.js build failed: ${err.message}. Private server secrets during next build are not supported; only NEXT_PUBLIC_* values are available at build time.`
        : isPythonBuildStrategy(buildStrategy)
          ? `Python build failed: ${err.message}. Check that requirements.txt installs on Linux with the selected Python version; packages without prebuilt wheels cannot be compiled in this image.`
          : isPhpBuildStrategy(buildStrategy)
            ? `PHP build failed: ${err.message}. Check that composer.lock is committed and installs with the selected PHP version; only the pdo_mysql extension is added to the official image.`
            : err.message
      ).slice(0, 1000),
      completedAt: new Date(),
    });
    await removeBuiltArtifact(builtImage, imageTag, deps);
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  if (
    snapshot &&
    !(await Project.exists({
      _id: projectId,
      environmentVersion: snapshot.environmentVersion ?? 1,
    }))
  ) {
    await failBuild({
      failureCode: 'CONFIGURATION_CHANGED',
      failureSummary: 'Environment variables changed while this deployment was building.',
      completedAt: new Date(),
    });
    await removeBuiltArtifact(builtImage, imageTag, deps);
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  // ── Transition to DEPLOYING and enqueue ACTIVATE_RELEASE ───────────────────
  await updateStatus(deploymentId, DeploymentStatus.DEPLOYING, {
    imageTag,
    imageRef: builtImage.imageRef,
    imageDigest: builtImage.imageDigest,
  });
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
  try {
    await deps.enqueueActivateRelease(
      {
        version: snapshot ? 2 : 1,
        correlationId,
        actorId: job.data.actorId,
        actorRole: job.data.actorRole,
        projectId,
        deploymentId,
        imageId: builtImage.imageRef,
        imageDigest: builtImage.imageDigest,
        targetPort: buildSpec.runtime.appPort,
        runtimeSpec: buildSpec.runtime,
        environmentVersion: snapshot?.environmentVersion,
        resourceLimits: toResourceLimits(quota),
      },
      `activate-${deploymentId}`,
    );
  } catch (err) {
    await logEvent(
      deploymentId,
      'DEPLOY',
      'ERROR',
      `Failed to queue activation: ${err.message}`,
      correlationId,
    );
    await failBuild({
      failureCode: 'ACTIVATION_ENQUEUE_FAILED',
      failureSummary: `Could not enqueue release activation: ${err.message}`.slice(0, 1000),
      completedAt: new Date(),
    });
    await removeBuiltArtifact(builtImage, imageTag, deps);
    return;
  }

  logger.info('BuildDeployment: job complete', {
    deploymentId,
    imageTag,
    projectId,
  });
}
