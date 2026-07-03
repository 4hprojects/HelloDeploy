import { asyncHandler } from '../utils/async-handler.js';
import { DeploymentTrigger } from '@hellodeploy/contracts';
import { isTerminal } from '@hellodeploy/deployment-core';
import { DeploymentEvent } from '@hellodeploy/database';
import { acquireStreamSlot, releaseStreamSlot } from '../services/sse-limiter.js';
import { subscribeDeployLogs } from '../services/deploy-log-stream.js';
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

async function renderDeploymentList(req, res, extras = {}) {
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
    ...extras,
  });
}

export const getDeploymentList = asyncHandler((req, res) => renderDeploymentList(req, res));

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
  const { noCache, commitSha } = req.body;

  const result = await createDeployment({
    projectId: project._id,
    actorId: req.session.user.id,
    triggerType: DeploymentTrigger.MANUAL,
    noCache: parseNoCacheFlag(noCache),
    commitSha: commitSha?.trim() ? commitSha.trim() : null,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });

  if (!result.success) {
    if (result.errorField === 'commitSha') {
      return renderDeploymentList(req, res, {
        commitShaError: result.error,
        commitShaValue: commitSha ?? '',
      });
    }
    req.flash('error', result.error);
    return res.redirect(`/projects/${project.slug}`);
  }

  req.flash('success', `Deployment #${result.deployment.sequenceNumber} queued.`);
  res.redirect(`/projects/${project.slug}/deployments/${result.deployment._id}`);
});

export const postCancelDeployment = asyncHandler(async (req, res) => {
  const { deploymentId } = req.params;
  const project = req.project;

  const result = await cancelDeployment(deploymentId, project._id, req.session.user.id, {
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

  const result = await retryDeployment(deploymentId, project._id, req.session.user.id, {
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
// Fast cadence when polling is the only source; slow completeness sweep when
// live events arrive over Redis pub/sub.
const SSE_POLL_INTERVAL_MS = 1_500;
const SSE_SWEEP_INTERVAL_MS = 10_000;
const SSE_MAX_STREAMS_PER_USER = 3;
const SSE_MAX_STREAMS_PER_IP = 6;

export const sseDeploymentLogs = asyncHandler(async (req, res) => {
  const { deploymentId } = req.params;
  const project = req.project;

  const deployment = await getDeployment(deploymentId);
  if (!deployment || deployment.projectId.toString() !== project._id.toString()) {
    return res.status(404).end();
  }

  const userStreamKey = `sse:user:${req.session.user.id}`;
  const ipStreamKey = `sse:ip:${req.ip || 'unknown'}`;
  if (!(await acquireStreamSlot(userStreamKey, SSE_MAX_STREAMS_PER_USER))) {
    res.setHeader('Retry-After', '30');
    return res.status(429).end('Too many live log streams. Close another tab and try again.');
  }
  if (!(await acquireStreamSlot(ipStreamKey, SSE_MAX_STREAMS_PER_IP))) {
    await releaseStreamSlot(userStreamKey);
    res.setHeader('Retry-After', '30');
    return res.status(429).end('Too many live log streams from this network.');
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  let lastId = null;
  let closed = false;
  let poll = null;
  let unsubscribe = null;
  const sentEventIds = new Set(); // pub/sub + poll sweep may both deliver an event

  const closeStream = () => {
    if (closed) {
      return;
    }
    closed = true;
    if (poll) {
      clearInterval(poll);
    }
    if (unsubscribe) {
      unsubscribe();
    }
    releaseStreamSlot(userStreamKey).catch(() => {});
    releaseStreamSlot(ipStreamKey).catch(() => {});
  };

  req.on('close', closeStream);

  const sendEvent = (eventType, data) => {
    if (closed) {
      return;
    }
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const sendLogEvent = (payload) => {
    if (sentEventIds.has(payload.id)) {
      return;
    }
    sentEventIds.add(payload.id);
    sendEvent('log', payload);
    // ObjectId hex strings order lexicographically by creation time.
    if (!lastId || payload.id > String(lastId)) {
      lastId = payload.id;
    }
  };

  // Send existing events first
  try {
    const existing = await getDeploymentEvents(deploymentId);
    for (const ev of existing) {
      sendLogEvent({
        id: ev._id.toString(),
        stage: ev.stage,
        level: ev.level,
        message: ev.messageRedacted,
        timestamp: ev.createdAt,
      });
    }

    // If already terminal, send status and close
    const currentDeployment = await getDeployment(deploymentId);
    if (isTerminal(currentDeployment?.status)) {
      sendEvent('status', { status: currentDeployment.status });
      closeStream();
      res.end();
      return;
    }
  } catch (err) {
    closeStream();
    throw err;
  }

  // Live push over Redis pub/sub when available; the DB poll below becomes a
  // slow completeness sweep (and stays the sole source when Redis is down).
  unsubscribe = subscribeDeployLogs(deploymentId, (payload) => {
    if (payload.type === 'status') {
      sendEvent('status', { status: payload.status });
      closeStream();
      res.end();
      return;
    }
    if (payload.type === 'log') {
      const { id, stage, level, message, timestamp } = payload;
      sendLogEvent({ id, stage, level, message, timestamp });
    }
  });

  const deadline = Date.now() + SSE_MAX_DURATION_MS;
  const pollIntervalMs = unsubscribe ? SSE_SWEEP_INTERVAL_MS : SSE_POLL_INTERVAL_MS;

  poll = setInterval(async () => {
    if (closed || Date.now() > deadline) {
      clearInterval(poll);
      if (!closed) {
        sendEvent('timeout', { message: 'Log stream timed out.' });
        closeStream();
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
        sendLogEvent({
          id: ev._id.toString(),
          stage: ev.stage,
          level: ev.level,
          message: ev.messageRedacted,
          timestamp: ev.createdAt,
        });
      }

      // Check if deployment reached terminal state
      const dep = await getDeployment(deploymentId);
      if (isTerminal(dep?.status)) {
        sendEvent('status', { status: dep.status });
        closeStream();
        res.end();
      }
    } catch {
      // Non-fatal — keep polling
    }
  }, pollIntervalMs);
});
