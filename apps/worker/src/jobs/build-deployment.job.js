import { join } from 'node:path';
import { Project, Repository, Deployment, resolveProjectQuota } from '@hellodeploy/database';
import {
  DeploymentStatus,
  JobType,
  RepositorySourceType,
  RuntimeType,
  BuildStrategy,
  isContainerBuildStrategy,
  isNextBuildStrategy,
  isJavaBuildStrategy,
  isPhpBuildStrategy,
  isPythonBuildStrategy,
  resolveJavaVersion,
  resolvePhpVersion,
  resolvePythonVersion,
  findDockerfilePolicyViolations,
  isBlockedRepository,
  parseImageReference,
} from '@hellodeploy/contracts';
import { enqueueJob } from '@hellodeploy/queue';
import { logger } from '@hellodeploy/observability';
import { buildImageTag } from '@hellodeploy/deployment-core';
import { env } from '../config/env.js';
import { getInstallationToken } from '../git/github-token.js';
import { cloneExactCommit, clonePublicExactCommit } from '../git/clone.js';
import {
  prepareBuildContext,
  resolveApplicationRoot,
  writePlatformDockerignore,
  listRootEnvFiles,
  readOptionalContextFile,
  readContainedFile,
  ownerIgnorePatterns,
} from '../deployment/build-context.js';
import {
  writeDockerfile,
  buildDockerImage,
  removeDockerImage,
  removableImageReference,
} from '../deployment/build.js';
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
import { resolveBuildStrategy, resolveRuntimeSpec } from '../deployment/build-strategy.js';
import { resolveImageDigest } from '../deployment/oci-image.js';
import { loadRegistryCredential, withDockerConfig } from '../deployment/registry-auth.js';
import { scanImage } from '../deployment/image-scan.js';
import { getRuntimePlatform } from '../deployment/container.js';
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
  readContainedFile,
  resolveBuildProfile,
  writeDockerfile,
  buildDockerImage,
  getProjectEnvVars,
  removeDockerImage,
  cleanupBuildWorkspace,
  enqueueActivateRelease,
  notifyDeploymentResult,
  deleteRegistryManifest,
  resolveImageDigest,
  loadRegistryCredential,
  withDockerConfig,
  scanImage,
  getRuntimePlatform,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// Owner Dockerfiles and ignore files are small; anything larger is refused.
const OWNER_BUILD_FILE_MAX_BYTES = 64 * 1024;

async function removeBuiltArtifact(builtImage, imageTag, deps) {
  if (builtImage?.imageRef?.includes('@sha256:') && deps.deleteRegistryManifest) {
    await deps.deleteRegistryManifest(builtImage.imageRef).catch((error) => {
      // The abandoned-image sweep retries it; operators still need to see it.
      logger.warn('BuildDeployment: failed to delete registry manifest', {
        imageRef: builtImage.imageRef,
        error: error.message,
      });
    });
  }
  await deps.removeDockerImage(
    removableImageReference({ imageRef: builtImage?.imageRef, imageTag }),
  );
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
  const repositoryId = legacyRepositoryId ?? snapshot?.sourceRepositoryId ?? project?.repositoryId;
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
  // Owner Dockerfiles run their own code during the build, so they never reach
  // the shared local daemon, whatever the flag validation allowed.
  if (buildStrategy === BuildStrategy.DOCKERFILE_V1 && env.BUILD_EXECUTOR !== 'remote-buildkit') {
    await failBuild({
      failureCode: 'BUILD_STRATEGY_DISABLED',
      failureSummary: 'Dockerfile builds run only on the isolated remote builder.',
      completedAt: new Date(),
    });
    return;
  }
  if (buildStrategy === BuildStrategy.OCI_IMAGE_V1) {
    return deployOwnerImage({
      job,
      deps,
      snapshot,
      project,
      projectId,
      deploymentId,
      correlationId,
      imageTag,
      buildConfiguration,
      workDir,
      failBuild,
    });
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
  let ownerDockerfile = null;
  let ownerIgnore = [];
  try {
    if (buildStrategy === BuildStrategy.DOCKERFILE_V1) {
      const ownerRoot = await deps.resolveApplicationRoot(
        workDir,
        buildConfiguration.applicationRoot ?? '.',
      );
      ownerDockerfile = await deps.readContainedFile(
        ownerRoot,
        buildConfiguration.dockerfilePath || 'Dockerfile',
        OWNER_BUILD_FILE_MAX_BYTES,
      );
      ownerIgnore = ownerIgnorePatterns(
        await deps.readContainedFile(ownerRoot, '.dockerignore', OWNER_BUILD_FILE_MAX_BYTES, {
          optional: true,
        }),
      );
    }
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
    // The repository pass already counted every file; this pass tightens
    // symlink containment to the application root and removes its forbidden files.
    if (contextDir !== workDir) {
      await deps.prepareBuildContext(contextDir, { countSize: false });
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

  if (ownerDockerfile !== null) {
    const violations = findDockerfilePolicyViolations(ownerDockerfile, {
      blockedRepositories: platformImageRepositories(),
    });
    if (violations.length > 0) {
      for (const violation of violations) {
        await logEvent(
          deploymentId,
          'VALIDATE',
          'ERROR',
          `Dockerfile line ${violation.line}: ${violation.message}`,
          correlationId,
        );
      }
      await failBuild({
        failureCode: 'DOCKERFILE_POLICY_VIOLATION',
        failureSummary: violations
          .map((violation) => `Line ${violation.line}: ${violation.message}`)
          .join(' ')
          .slice(0, 1000),
        completedAt: new Date(),
      });
      await deps.cleanupBuildWorkspace(workDir);
      return;
    }
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
      await deps.writePlatformDockerignore(contextDir, ownerIgnore);
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
    let javaVersion = null;
    if (isJavaBuildStrategy(buildStrategy)) {
      const buildFile =
        buildStrategy === BuildStrategy.JAVA_MAVEN_V1
          ? { pom: await deps.readOptionalContextFile(contextDir, 'pom.xml', 512 * 1024) }
          : {
              gradle:
                (await deps.readOptionalContextFile(contextDir, 'build.gradle', 512 * 1024)) ??
                (await deps.readOptionalContextFile(contextDir, 'build.gradle.kts', 512 * 1024)),
            };
      const resolved = resolveJavaVersion(buildFile);
      if (resolved.error) {
        throw new Error(resolved.error);
      }
      javaVersion = resolved.version;
    }
    buildSpec =
      ownerDockerfile !== null
        ? {
            strategyId: buildStrategy,
            dockerfileContent: ownerDockerfile,
            runtime: resolveRuntimeSpec({ buildStrategy, runtimeType, buildConfiguration }),
          }
        : resolveBuildStrategy({
            pythonVersion,
            phpVersion,
            javaVersion,
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
      // Owner Dockerfiles build without any registry credential.
      isolateRegistryCredentials: buildStrategy === BuildStrategy.DOCKERFILE_V1,
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
            : isJavaBuildStrategy(buildStrategy)
              ? `Java build failed: ${err.message}. Check that the wrapper builds one Spring Boot executable jar with the selected Java version; tests are skipped and multi-module builds are not supported.`
              : err.message
      ).slice(0, 1000),
      completedAt: new Date(),
    });
    await removeBuiltArtifact(builtImage, imageTag, deps);
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  if (
    isContainerBuildStrategy(buildStrategy) &&
    !(await enforceImageScan({
      imageRef: builtImage.imageRef,
      deps,
      deploymentId,
      correlationId,
      failBuild,
    }))
  ) {
    await removeBuiltArtifact(builtImage, imageTag, deps);
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  return finishBuild({
    job,
    deps,
    snapshot,
    projectId,
    deploymentId,
    correlationId,
    imageTag,
    builtImage,
    runtime: buildSpec.runtime,
    quota,
    workDir,
    failBuild,
  });
}

/**
 * Record a ready image and queue its activation. Shared by builds and by
 * prebuilt owner images, which skip cloning and building.
 */
async function finishBuild({
  job,
  deps,
  snapshot,
  projectId,
  deploymentId,
  correlationId,
  imageTag,
  builtImage,
  runtime,
  quota,
  workDir,
  failBuild,
  isPlatformImage = true,
}) {
  if (
    snapshot &&
    !(await Project.exists({
      _id: projectId,
      ...environmentVersionFilter(snapshot.environmentVersion ?? 1),
    }))
  ) {
    await failBuild({
      failureCode: 'CONFIGURATION_CHANGED',
      failureSummary: 'Environment variables changed while this deployment was building.',
      completedAt: new Date(),
    });
    if (isPlatformImage) {
      await removeBuiltArtifact(builtImage, imageTag, deps);
    }
    await deps.cleanupBuildWorkspace(workDir);
    return;
  }

  // ── Transition to DEPLOYING and enqueue ACTIVATE_RELEASE ───────────────────
  await updateStatus(deploymentId, DeploymentStatus.DEPLOYING, {
    imageTag,
    imageRef: builtImage.imageRef,
    imageDigest: builtImage.imageDigest,
    imageChildDigests: builtImage.childDigests ?? [],
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
        targetPort: runtime.appPort,
        runtimeSpec: runtime,
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
    if (isPlatformImage) {
      await removeBuiltArtifact(builtImage, imageTag, deps);
    }
    return;
  }

  logger.info('BuildDeployment: job complete', {
    deploymentId,
    imageTag,
    projectId,
  });
}

/**
 * Match a project at an environment version. Documents stored before versions
 * existed have no field and read as version 1, which a plain equality query
 * would never match.
 */
function environmentVersionFilter(version) {
  return version === 1
    ? { $or: [{ environmentVersion: 1 }, { environmentVersion: { $exists: false } }] }
    : { environmentVersion: version };
}

/**
 * Scan an owner image when a scanner is configured. Returns false after
 * failing the deployment, so the caller only cleans up.
 */
async function enforceImageScan({
  imageRef,
  dockerConfigDir,
  deps,
  deploymentId,
  correlationId,
  failBuild,
}) {
  if (env.IMAGE_SCANNER !== 'trivy') {
    return true;
  }
  let result;
  try {
    result = await deps.scanImage(imageRef, {
      dockerConfigDir,
      platform: await deps.getRuntimePlatform(),
    });
  } catch (error) {
    await failBuild({
      // A scanner outage is the platform's problem, not the owner's image.
      failureCode: error.code === 'IMAGE_SCAN_UNAVAILABLE' ? error.code : 'IMAGE_POLICY_FAILED',
      failureSummary: error.message.slice(0, 1000),
      completedAt: new Date(),
    });
    return false;
  }
  if (result.criticalCount > 0) {
    await failBuild({
      failureCode: 'IMAGE_POLICY_FAILED',
      failureSummary:
        `The image has ${result.criticalCount} fixable critical vulnerabilities (${result.ids.join(', ')}). Update the affected packages and deploy again.`.slice(
          0,
          1000,
        ),
      completedAt: new Date(),
    });
    return false;
  }
  await logEvent(
    deploymentId,
    'BUILD',
    'INFO',
    'Image scan found no fixable critical vulnerabilities.',
    correlationId,
  );
  return true;
}

/**
 * Deploy a prebuilt owner image: lock its reference to a digest, scan it, and
 * queue activation. Nothing is cloned or built.
 */
async function deployOwnerImage({
  job,
  deps,
  snapshot,
  project,
  projectId,
  deploymentId,
  correlationId,
  imageTag,
  buildConfiguration,
  workDir,
  failBuild,
}) {
  const reference = parseImageReference(buildConfiguration.imageReference);
  if (reference.error) {
    await failBuild({
      failureCode: 'IMAGE_RESOLUTION_FAILED',
      failureSummary: reference.error,
      completedAt: new Date(),
    });
    return;
  }
  // The platform's repository holds every tenant's builds; an owner reference
  // into it would run someone else's image and make it look platform-owned.
  if (isBlockedRepository(reference.name, platformImageRepositories())) {
    await failBuild({
      failureCode: 'IMAGE_RESOLUTION_FAILED',
      failureSummary:
        "Images in HelloDeploy's own image repository cannot be deployed as a prebuilt image.",
      completedAt: new Date(),
    });
    return;
  }
  await updateStatus(deploymentId, DeploymentStatus.BUILDING);
  await logEvent(
    deploymentId,
    'BUILD',
    'INFO',
    `Resolving prebuilt image ${reference.name}${reference.digest ? `@${reference.digest}` : `:${reference.tag}`}.`,
    correlationId,
  );

  let credential;
  try {
    credential = await deps.loadRegistryCredential(projectId, reference.registry);
  } catch (error) {
    logger.warn('BuildDeployment: failed to load the registry credential', {
      deploymentId,
      registry: reference.registry,
      error: error.message,
    });
    await failBuild({
      failureCode: 'SECRET_DECRYPTION_FAILED',
      failureSummary:
        'The saved registry credential could not be read. Try again, or save it again.',
      completedAt: new Date(),
    });
    return;
  }

  let digest = reference.digest;
  if (!digest) {
    try {
      digest = await deps.resolveImageDigest(reference, { credential });
    } catch (error) {
      await failBuild({
        failureCode: 'IMAGE_RESOLUTION_FAILED',
        failureSummary: error.message.slice(0, 1000),
        completedAt: new Date(),
      });
      return;
    }
  }
  const imageRef = `${reference.name}@${digest}`;
  await logEvent(deploymentId, 'BUILD', 'INFO', `Locked image to ${imageRef}.`, correlationId);

  const hasPassedScan = await deps.withDockerConfig(
    reference.registry,
    credential,
    (dockerConfigDir) =>
      enforceImageScan({ imageRef, dockerConfigDir, deps, deploymentId, correlationId, failBuild }),
  );
  if (!hasPassedScan) {
    return;
  }

  const quota = await resolveProjectQuota(project._id, project.ownerId);
  return finishBuild({
    job,
    deps,
    snapshot,
    projectId,
    deploymentId,
    correlationId,
    imageTag,
    builtImage: { imageRef, imageDigest: digest },
    runtime: resolveRuntimeSpec({
      buildStrategy: BuildStrategy.OCI_IMAGE_V1,
      runtimeType: RuntimeType.CONTAINER,
      buildConfiguration,
    }),
    quota,
    workDir,
    failBuild,
    isPlatformImage: false,
  });
}

/** The platform's own image repositories, which owner images may never use. */
function platformImageRepositories() {
  return [env.USER_IMAGE_REGISTRY].filter(Boolean);
}
