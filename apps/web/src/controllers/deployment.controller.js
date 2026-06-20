import { DeploymentStatus, DeploymentTrigger } from '@hellodeploy/contracts';
import { isTerminal } from '@hellodeploy/deployment-core';
import { DeploymentEvent } from '@hellodeploy/database';
import {
  createDeployment,
  cancelDeployment,
  retryDeployment,
  rollbackDeployment,
  getDeployments,
  getDeployment,
  getDeploymentEvents,
} from '../services/deployment.service.js';

export async function getDeploymentList(req, res) {
  const project = req.project;
  const deployments = await getDeployments(project._id);

  // Identify HEALTHY deployments eligible for rollback (not the currently active one)
  const rollbackTargets = deployments.filter(
    (d) =>
      d.status === DeploymentStatus.HEALTHY &&
      d._id.toString() !== project.activeDeploymentId?.toString(),
  );

  res.render('pages/projects/deployments', {
    title: `Deployments – ${project.name}`,
    project,
    membership: req.membership,
    deployments,
    rollbackTargets,
  });
}

export async function getDeploymentDetail(req, res) {
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
}

export async function postCreateDeployment(req, res) {
  const project = req.project;
  const { noCache } = req.body;

  const result = await createDeployment({
    projectId: project._id,
    actorId: req.session.user.id,
    triggerType: DeploymentTrigger.MANUAL,
    noCache: noCache === 'true' || noCache === '1',
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}`);
  }

  req.flash('success', `Deployment #${result.deployment.sequenceNumber} queued.`);
  res.redirect(`/projects/${project.slug}/deployments/${result.deployment._id}`);
}

export async function postCancelDeployment(req, res) {
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
}

export async function postRetryDeployment(req, res) {
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
}

export async function postRollback(req, res) {
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
}

// ─── SSE: live deployment log stream ─────────────────────────────────────────

const SSE_MAX_DURATION_MS = 6 * 60 * 1000; // 6 minutes
const SSE_POLL_INTERVAL_MS = 1_500;

export async function sseDeploymentLogs(req, res) {
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
    if (poll) clearInterval(poll);
  });

  const sendEvent = (eventType, data) => {
    if (closed) return;
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
      }).sort({ _id: 1 }).limit(100).lean();

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

}
