import { snapshotPublicEnvironment } from '../services/public-build-config.service.js';
import { publicConfigurationFingerprint } from '@hellodeploy/deployment-core';
import { isValidObjectId } from 'mongoose';
import { Deployment, Repository } from '@hellodeploy/database';
import { isCommitOnBranch } from '../services/github.service.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  generateDeployHookToken,
  revokeDeployHookToken,
  verifyDeployHookToken,
} from '../services/project.service.js';
import { createDeployment } from '../services/deployment.service.js';
import { DeploymentTrigger, RepositorySourceType } from '@hellodeploy/contracts';

export const getDeployHookSettings = asyncHandler(async (req, res) => {
  res.render('pages/projects/deploy-hook', {
    title: `Deploy Hook – ${req.project.name}`,
    // Mask the stored hash — the view only needs to know whether a hook exists
    project: {
      ...req.project,
      deployHookTokenHash: req.project.deployHookTokenHash ? 'configured' : null,
    },
    membership: req.membership,
    revealedUrl: null,
  });
});

export const postGenerateDeployHook = asyncHandler(async (req, res) => {
  const project = req.project;
  const result = await generateDeployHookToken({
    projectId: project._id,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}/deploy-hook`);
  }

  const revealedUrl = `${req.protocol}://${req.get('host')}/api/deploy-hooks/${project._id}/${result.rawToken}`;

  res.render('pages/projects/deploy-hook', {
    title: `Deploy Hook – ${project.name}`,
    project: { ...project, deployHookTokenHash: 'configured' },
    membership: req.membership,
    revealedUrl,
  });
});

export const postRevokeDeployHook = asyncHandler(async (req, res) => {
  const project = req.project;
  const result = await revokeDeployHookToken({
    projectId: project._id,
    actorId: req.session.user.id,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Deploy hook revoked. The previous URL will no longer trigger deploys.');
  }

  res.redirect(`/projects/${project.slug}/deploy-hook`);
});

// ─── Public trigger (unauthenticated, token-gated) ──────────────────────────────

export const postTriggerDeployHook = asyncHandler(async (req, res) => {
  const { projectId, token } = req.params;

  const project = await verifyDeployHookToken(projectId, token);
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invalid deploy hook.' } });
  }

  const commitSha = req.body?.commitSha;
  if (commitSha !== undefined) {
    if (typeof commitSha !== 'string' || !/^[0-9a-f]{40}$/.test(commitSha)) {
      return res.status(400).json({
        error: { code: 'INVALID_SHA', message: 'A full lowercase commit SHA is required.' },
      });
    }
    const repository = await Repository.findById(project.repositoryId).lean();
    try {
      if (
        !repository ||
        !(await isCommitOnBranch(
          repository.sourceType === RepositorySourceType.PUBLIC_GIT
            ? null
            : repository.installationId,
          repository.fullName,
          project.productionBranch || repository.defaultBranch,
          commitSha,
        ))
      ) {
        return res.status(422).json({
          error: {
            code: 'UNAPPROVED_COMMIT',
            message: 'Commit is not on the configured deployment branch.',
          },
        });
      }
    } catch {
      return res.status(503).json({
        error: { code: 'REPOSITORY_UNAVAILABLE', message: 'Could not verify release commit.' },
      });
    }
  }
  let result;
  try {
    result = await createDeployment({
      projectId: project._id,
      actorId: project.ownerId.toString(),
      triggerType: DeploymentTrigger.SYSTEM,
      commitSha: commitSha ?? null,
      correlationId: req.correlationId,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: {
          code: 'DEPLOYMENT_IN_PROGRESS',
          message: 'A deployment is already in progress.',
        },
      });
    }
    throw error;
  }

  if (!result.success) {
    return res.status(422).json({ error: { code: 'DEPLOY_FAILED', message: result.error } });
  }

  res.status(202).json({
    deploymentId: result.deployment._id.toString(),
    sequenceNumber: result.deployment.sequenceNumber,
    status: result.deployment.status,
  });
});

export const getHookDeploymentStatus = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '')?.[1];
  const project = token ? await verifyDeployHookToken(req.params.projectId, token) : null;
  if (!project || !isValidObjectId(req.params.deploymentId)) {
    return res.status(404).json({ error: { code: 'NOT_FOUND' } });
  }
  const deployment = await Deployment.findOne({
    _id: req.params.deploymentId,
    projectId: project._id,
  }).lean();
  if (!deployment) {
    return res.status(404).json({ error: { code: 'NOT_FOUND' } });
  }
  return res.json({
    deploymentId: deployment._id.toString(),
    commitSha: deployment.commitSha,
    status: deployment.status,
    active: project.activeDeploymentId?.toString() === deployment._id.toString(),
    configurationFingerprint: deployment.configurationFingerprint,
    failure:
      deployment.status === 'FAILED'
        ? {
            code: 'DEPLOYMENT_FAILED',
            message: 'Deployment failed. Inspect the authenticated dashboard.',
          }
        : null,
  });
});

export const getHookCapabilities = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '')?.[1];
  const project = token ? await verifyDeployHookToken(req.params.projectId, token) : null;
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND' } });
  }
  const publicValues = await snapshotPublicEnvironment(project._id);
  const indexes = await Deployment.collection.indexes();
  return res.json({
    protocolVersion: 1,
    pinnedCommits: true,
    publicBuildSnapshots: true,
    concurrentDeploymentGuard: indexes.some(
      (index) => index.name === 'one_inflight_per_project' && index.unique === true,
    ),
    deploymentMode: project.deploymentMode,
    runtimeType: project.runtimeType,
    appUrl: publicValues.NEXT_PUBLIC_APP_URL,
    supabaseUrl: publicValues.NEXT_PUBLIC_SUPABASE_URL,
    configurationFingerprint: publicConfigurationFingerprint(publicValues),
    clientConfigurationFingerprint: publicConfigurationFingerprint(
      Object.fromEntries(
        Object.entries(publicValues).filter(([key]) =>
          [
            'NEXT_PUBLIC_APP_URL',
            'NEXT_PUBLIC_SUPABASE_ANON_KEY',
            'NEXT_PUBLIC_SUPABASE_URL',
          ].includes(key),
        ),
      ),
    ),
  });
});
