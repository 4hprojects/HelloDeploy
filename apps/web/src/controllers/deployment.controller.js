import { asyncHandler } from '../utils/async-handler.js';
import { DeploymentTrigger } from '@hellodeploy/contracts';
import { isTerminal } from '@hellodeploy/deployment-core';
import { DeploymentEvent } from '@hellodeploy/database';
import {
  createDeployment,
  parseNoCacheFlag,
  cancelDeployment,
  retryDeployment,
  rollbackDeployment,
  getDeploymentsPaginated,
  getRollbackTargets,
  getDeployment,
  getDeploymentEvents,
} from '../services/deployment.service.js';

const DEPLOYMENTS_PER_PAGE = 20;

export const getDeploymentList = asyncHandler(async (req, res) => {
  const project = req.project;
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  const { deployments, total, totalPages } = await getDeploymentsPaginated(project._id, {
    page,
    limit: DEPLOYMENTS_PER_PAGE,
  });

  // Identify HEALTHY deployments eligible for rollback outside the paginated list.
  const rollbackTargets = await getRollbackTargets(project._id, project.activeDeploymentId);

  res.render('pages/projects/deployments', {
    title: `Deployments – ${project.name}`,
    project,
    membership: req.membership,
    deployments,
    rollbackTargets,
    page,
    totalPages,
    total,
  });
});

export const getDeploymentDetail = asyncHandler(async (req, res) => {
  const { deploymentId } = req.params;
  const project = req.project;

  const deployment = await getDeployment(deploymentId);
  if (!deployment || deployment.projectId.toString() !== project._id.toString()) {
    return res.status(404).render('pages/404', { title: 'Not Found' });
  }

  const events = await getDeploymentEvents(deploymentId);

  res.render('pages/projects/deployment-detail', {
    title: `Deployment #${deployment.sequenceNumber} – ${project.name}`,
    project,
    membership: req.membership,
    deployment,
    events,
  });
});

export const postCreateDeployment = asyncHandler(async (req, res) => {
  const project = req.project;
  const { noCache } = req.body;

  const result = await createDeployment({
    projectId: project._id,
    actorId: req.session.user.id,
    triggerType: DeploymentTrigger.MANUAL,
    noCache: parseNoCacheFlag(noCache),
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}`);
  }

  req.flash('success', `Deployment #${result.deployment.sequenceNumber} queued.`);
  res.redirect(`/projects/${project.slug}/deployments/${result.deployment._id}`);
});

export const postCancelDeployment = asyncHandler(async (req, res) => {
  const { deploymentId } = req.params;
  const project = req.project;

  const result = await cancelDeployment(deploymentId, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
  } else {
    req.flash('success', 'Deployment cancelled.');
  }

  res.redirect(`/projects/${project.slug}/deployments`);
});

export const postRetryDeployment = asyncHandler(async (req, res) => {
  const { deploymentId } = req.params;
  const project = req.project;

  const result = await retryDeployment(deploymentId, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}/deployments`);
  }

  req.flash('success', `Retry deployment #${result.deployment.sequenceNumber} queued.`);
  res.redirect(`/projects/${project.slug}/deployments/${result.deployment._id}`);
});

export const postRollback = asyncHandler(async (req, res) => {
  const { targetDeploymentId } = req.body;
  const project = req.project;

  if (!targetDeploymentId) {
    req.flash('error', 'No target deployment selected.');
    return res.redirect(`/projects/${project.slug}/deployments`);
  }

  const result = await rollbackDeployment(project._id, targetDeploymentId, req.session.user.id, {
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}/deployments`);
  }

  req.flash('success', 'Rollback initiated.');
  res.redirect(`/projects/${project.slug}/deployments/${result.deployment._id}`);
});

// ─── SSE: live deployment log stream ─────────────────────────────────────────

const SSE_MAX_DURATION_MS = 6 * 60 * 1000; // 6 minutes
const SSE_POLL_INTERVAL_MS = 1_500;

export const sseDeploymentLogs = asyncHandler(async (req, res) => {
  const { deploymentId } = req.params;
  const project = req.project;

  const deployment = await getDeployment(deploymentId);
  if (!deployment || deployment.projectId.toString() !== project._id.toString()) {
    return res.status(404).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  let lastId = null;
  let closed = false;
  let poll = null;

  req.on('close', () => {
    closed = true;
    if (poll) {
      clearInterval(poll);
    }
  });

  const sendEvent = (eventType, data) => {
    if (closed) {
      return;
    }
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send existing events first
  const existing = await getDeploymentEvents(deploymentId);
  for (const ev of existing) {
    sendEvent('log', {
      id: ev._id.toString(),
      stage: ev.stage,
      level: ev.level,
      message: ev.messageRedacted,
      timestamp: ev.createdAt,
    });
    lastId = ev._id;
  }

  // If already terminal, send status and close
  const currentDeployment = await getDeployment(deploymentId);
  if (isTerminal(currentDeployment?.status)) {
    sendEvent('status', { status: currentDeployment.status });
    res.end();
    return;
  }

  // Poll for new events
  const deadline = Date.now() + SSE_MAX_DURATION_MS;

  poll = setInterval(async () => {
    if (closed || Date.now() > deadline) {
      clearInterval(poll);
      if (!closed) {
        sendEvent('timeout', { message: 'Log stream timed out.' });
        res.end();
      }
      return;
    }

    try {
      const newEvents = await DeploymentEvent.find({
        deploymentId,
        ...(lastId ? { _id: { $gt: lastId } } : {}),
      })
        .sort({ _id: 1 })
        .limit(100)
        .lean();

      for (const ev of newEvents) {
        sendEvent('log', {
          id: ev._id.toString(),
          stage: ev.stage,
          level: ev.level,
          message: ev.messageRedacted,
          timestamp: ev.createdAt,
        });
        lastId = ev._id;
      }

      // Check if deployment reached terminal state
      const dep = await getDeployment(deploymentId);
      if (isTerminal(dep?.status)) {
        sendEvent('status', { status: dep.status });
        clearInterval(poll);
        res.end();
      }
    } catch {
      // Non-fatal — keep polling
    }
  }, SSE_POLL_INTERVAL_MS);
});
