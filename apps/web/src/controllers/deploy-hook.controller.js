import { asyncHandler } from '../utils/async-handler.js';
import {
  generateDeployHookToken,
  revokeDeployHookToken,
  verifyDeployHookToken,
} from '../services/project.service.js';
import { createDeployment } from '../services/deployment.service.js';
import { DeploymentTrigger } from '@hellodeploy/contracts';

export const getDeployHookSettings = asyncHandler(async (req, res) => {
  res.render('pages/projects/deploy-hook', {
    title: `Deploy Hook – ${req.project.name}`,
    project: req.project,
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

  const result = await createDeployment({
    projectId: project._id,
    actorId: project.ownerId.toString(),
    triggerType: DeploymentTrigger.SYSTEM,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    return res.status(422).json({ error: { code: 'DEPLOY_FAILED', message: result.error } });
  }

  res.status(202).json({
    deploymentId: result.deployment._id.toString(),
    sequenceNumber: result.deployment.sequenceNumber,
    status: result.deployment.status,
  });
});
