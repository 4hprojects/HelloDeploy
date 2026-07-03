import { Repository, Project } from '@hellodeploy/database';
import { DeploymentMode, ProjectStatus, DeploymentTrigger } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { verifyWebhookSignature } from '../services/github.service.js';
import { createDeployment } from '../services/deployment.service.js';
import { getRedisConnection } from '../queue/client.js';
import { env } from '../config/env.js';

// ─── Delivery deduplication (Redis-backed, 1-hour window) ─────────────────────

const DELIVERY_TTL_SECONDS = 60 * 60; // 1 hour (matches GitHub retry window)
const DELIVERY_TTL_MS = DELIVERY_TTL_SECONDS * 1000;
const MAX_TRACKED_DELIVERIES = 2000;

// In-memory fallback for when Redis is unavailable (per-process only).
const recentDeliveries = new Map(); // deliveryId → expiresAt timestamp

function isDuplicateInMemory(deliveryId) {
  const expires = recentDeliveries.get(deliveryId);
  if (expires && Date.now() <= expires) {
    return true;
  }
  if (recentDeliveries.size >= MAX_TRACKED_DELIVERIES) {
    // Evict the oldest entry
    const oldest = recentDeliveries.keys().next().value;
    recentDeliveries.delete(oldest);
  }
  recentDeliveries.set(deliveryId, Date.now() + DELIVERY_TTL_MS);
  return false;
}

/**
 * Atomically records the delivery ID and reports whether it was already seen.
 * Fails open to per-process memory: dropping webhooks on a Redis outage would
 * lose real deployments, and dedup is best-effort idempotency, not auth.
 */
async function isDuplicateDelivery(deliveryId, redisClient) {
  // Memory is always consulted, not just as a fallback: deliveries handled
  // while the Redis client was still connecting exist only in memory, so
  // trusting Redis alone would let their replays through.
  const isMemoryDuplicate = isDuplicateInMemory(deliveryId);

  // status guard: with maxRetriesPerRequest:null, commands on a disconnected
  // client queue forever instead of rejecting — never await one.
  if (redisClient && redisClient.status === 'ready') {
    try {
      const reply = await redisClient.set(
        `webhook:delivery:${deliveryId}`,
        '1',
        'EX',
        DELIVERY_TTL_SECONDS,
        'NX',
      );
      return reply === null || isMemoryDuplicate;
    } catch (err) {
      const log = env.isProduction() ? logger.error : logger.warn;
      log('Webhook dedup Redis error, falling back to in-memory tracking', {
        error: err.message,
      });
    }
  }
  return isMemoryDuplicate;
}

// ─── High-risk file patterns ───────────────────────────────────────────────────

const HIGH_RISK_PATTERNS = [
  /^Dockerfile/i,
  /^docker-compose/i,
  /^\.dockerignore$/i,
  /^nginx\./i,
  /^\.github\/workflows\//,
  /^infrastructure\//,
  /^deploy\//,
  /^\.platform\//,
];

function collectChangedPaths(commits) {
  const paths = new Set();
  for (const commit of commits ?? []) {
    for (const f of [
      ...(commit.added ?? []),
      ...(commit.modified ?? []),
      ...(commit.removed ?? []),
    ]) {
      paths.add(f);
    }
  }
  return [...paths];
}

function hasHighRiskChanges(commits) {
  return collectChangedPaths(commits).some((f) => HIGH_RISK_PATTERNS.some((p) => p.test(f)));
}

// ─── Build filters (included/ignored paths) ────────────────────────────────────

/** Minimal glob matcher: `**` matches across path segments, `*` matches within one. */
function globToRegExp(glob) {
  const DOUBLE_STAR_MARKER = '\u0000';
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped
    .replace(/\*\*/g, DOUBLE_STAR_MARKER)
    .replace(/\*/g, '[^/]*')
    .split(DOUBLE_STAR_MARKER)
    .join('.*');
  return new RegExp(`^${pattern}$`);
}

function matchesAnyGlob(path, globs) {
  return globs.some((glob) => globToRegExp(glob).test(path));
}

/**
 * Determines whether a build should be skipped because none of the changed
 * paths are relevant, per the project's included/ignored path filters.
 * `includedPaths` (if non-empty) is an allowlist; `ignoredPaths` is a denylist
 * applied on top of it. If every changed path is filtered out, the build is skipped.
 */
function shouldSkipBuild(changedPaths, buildFilters) {
  const includedPaths = buildFilters?.includedPaths ?? [];
  const ignoredPaths = buildFilters?.ignoredPaths ?? [];

  if (changedPaths.length === 0 || (includedPaths.length === 0 && ignoredPaths.length === 0)) {
    return false;
  }

  const relevantPaths = changedPaths.filter((path) => {
    if (includedPaths.length > 0 && !matchesAnyGlob(path, includedPaths)) {
      return false;
    }
    if (ignoredPaths.length > 0 && matchesAnyGlob(path, ignoredPaths)) {
      return false;
    }
    return true;
  });

  return relevantPaths.length === 0;
}

// ─── Event handlers ───────────────────────────────────────────────────────────

const defaultPushDeps = {
  Repository,
  Project,
  createDeployment,
};

export async function handlePushEvent(payload, correlationId, deps = defaultPushDeps) {
  const { repository, ref, after: newSha, head_commit, commits, installation } = payload;
  const installationId = installation?.id;
  const repoFullName = repository?.full_name;
  const branch = ref?.replace('refs/heads/', '');

  if (!installationId || !repoFullName || !newSha || newSha === '0'.repeat(40)) {
    return; // Branch deletion push — ignore
  }

  const repoRecord = await deps.Repository.findOne({
    installationId,
    fullName: repoFullName,
    accessStatus: 'ACTIVE',
  });

  if (!repoRecord) {
    return;
  } // Not a tracked repository

  // Always update the latest commit info
  const commitMessage = head_commit?.message?.split('\n')[0]?.slice(0, 200) ?? null;
  repoRecord.lastCommitSha = newSha;
  repoRecord.lastCommitMessage = commitMessage;
  repoRecord.lastCommitAt = new Date();
  await repoRecord.save();

  const project = await deps.Project.findById(repoRecord.projectId);
  if (!project || project.status !== ProjectStatus.ACTIVE) {
    return;
  }

  // Only the production branch triggers deployment logic
  if (project.productionBranch !== branch) {
    return;
  }

  // Check for high-risk file changes — pause auto-deploy
  if (hasHighRiskChanges(commits)) {
    logger.info('Webhook: high-risk file change detected, auto-deploy paused', {
      projectId: project._id.toString(),
      repoFullName,
      branch,
    });
    // TODO Phase 8: notify owner and flag project for review
    return;
  }

  // Build filters — skip the build entirely if no changed path is relevant
  const changedPaths = collectChangedPaths(commits);
  if (shouldSkipBuild(changedPaths, project.buildFilters)) {
    logger.info('Webhook: build skipped — no changed paths match build filters', {
      projectId: project._id.toString(),
      repoFullName,
      branch,
      changedPaths,
    });
    return;
  }

  if (project.deploymentMode === DeploymentMode.AUTOMATIC) {
    const result = await deps.createDeployment({
      projectId: project._id,
      actorId: project.ownerId,
      triggerType: DeploymentTrigger.AUTOMATIC,
      correlationId,
    });

    if (!result.success) {
      logger.warn('Webhook: automatic deployment was not queued', {
        projectId: project._id.toString(),
        commitSha: newSha.slice(0, 7),
        error: result.error,
      });
      return;
    }

    logger.info('Webhook: automatic deployment queued', {
      projectId: project._id.toString(),
      commitSha: newSha.slice(0, 7),
      deploymentId: result.deployment?._id?.toString(),
    });
  }
  // MANUAL mode: commit indicator already updated via repoRecord.lastCommitSha
}

async function handleInstallationEvent(payload) {
  const { action, installation } = payload;
  const installationId = installation?.id;

  if (action === 'deleted' || action === 'suspended') {
    // Mark all repositories for this installation as REVOKED
    const result = await Repository.updateMany(
      { installationId, accessStatus: 'ACTIVE' },
      { $set: { accessStatus: 'REVOKED', revokedAt: new Date() } },
    );

    logger.info('Webhook: installation revoked', {
      installationId,
      reposRevoked: result.modifiedCount,
      action,
    });
  }
}

async function handleInstallationRepositoriesEvent(payload) {
  const { action, installation, repositories_removed } = payload;
  const installationId = installation?.id;

  if (action === 'removed' && repositories_removed?.length) {
    const removedNames = repositories_removed.map((r) => r.full_name);
    await Repository.updateMany(
      { installationId, fullName: { $in: removedNames } },
      { $set: { accessStatus: 'REVOKED', revokedAt: new Date() } },
    );

    logger.info('Webhook: repositories removed from installation', {
      installationId,
      removed: removedNames,
    });
  }
}

// ─── Main webhook handler ──────────────────────────────────────────────────────

const defaultWebhookDeps = {
  getRedisConnection,
};

export async function handleGithubWebhook(req, res, deps = defaultWebhookDeps) {
  const signature = req.headers['x-hub-signature-256'];
  const deliveryId = req.headers['x-github-delivery'];
  const event = req.headers['x-github-event'];
  const correlationId = req.correlationId;

  // req.body is a Buffer — raw bytes from express.raw()
  if (!verifyWebhookSignature(req.body, signature)) {
    logger.warn('Webhook: invalid signature rejected', { correlationId });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Replay prevention
  if (deliveryId && (await isDuplicateDelivery(deliveryId, deps.getRedisConnection()))) {
    return res.status(200).json({ ok: true, note: 'duplicate delivery' });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // Respond immediately — GitHub expects a fast response
  res.status(200).json({ ok: true });

  // Process asynchronously so we don't hold the response
  try {
    if (event === 'push') {
      await handlePushEvent(payload, correlationId);
    } else if (event === 'installation') {
      await handleInstallationEvent(payload);
    } else if (event === 'installation_repositories') {
      await handleInstallationRepositoriesEvent(payload);
    }
  } catch (err) {
    logger.error('Webhook: unhandled error during event processing', {
      event,
      deliveryId,
      error: err.message,
    });
  }
}
