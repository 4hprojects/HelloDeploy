import { Repository, Project } from '@hellodeploy/database';
import { DeploymentMode, ProjectStatus } from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';
import { verifyWebhookSignature } from '../services/github.service.js';

// ─── Delivery deduplication (in-memory, 1-hour window) ────────────────────────
// Replaced with Redis-backed set in Phase 5.

const recentDeliveries = new Map(); // deliveryId → expiresAt timestamp

const DELIVERY_TTL_MS = 60 * 60 * 1000; // 1 hour (matches GitHub retry window)
const MAX_TRACKED_DELIVERIES = 2000;

function isRecentDelivery(deliveryId) {
  const expires = recentDeliveries.get(deliveryId);
  if (!expires) {
    return false;
  }
  if (Date.now() > expires) {
    recentDeliveries.delete(deliveryId);
    return false;
  }
  return true;
}

function markDelivery(deliveryId) {
  if (recentDeliveries.size >= MAX_TRACKED_DELIVERIES) {
    // Evict the oldest entry
    const oldest = recentDeliveries.keys().next().value;
    recentDeliveries.delete(oldest);
  }
  recentDeliveries.set(deliveryId, Date.now() + DELIVERY_TTL_MS);
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

function hasHighRiskChanges(commits) {
  return (commits ?? []).some((commit) =>
    [...(commit.added ?? []), ...(commit.modified ?? []), ...(commit.removed ?? [])].some((f) =>
      HIGH_RISK_PATTERNS.some((p) => p.test(f)),
    ),
  );
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handlePushEvent(payload, _correlationId) {
  const { repository, ref, after: newSha, head_commit, commits, installation } = payload;
  const installationId = installation?.id;
  const repoFullName = repository?.full_name;
  const branch = ref?.replace('refs/heads/', '');

  if (!installationId || !repoFullName || !newSha || newSha === '0'.repeat(40)) {
    return; // Branch deletion push — ignore
  }

  const repoRecord = await Repository.findOne({
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

  const project = await Project.findById(repoRecord.projectId);
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

  if (project.deploymentMode === DeploymentMode.AUTOMATIC) {
    // TODO Phase 5: enqueue VALIDATE_PROJECT + BUILD_DEPLOYMENT jobs
    logger.info('Webhook: automatic deployment would be queued here', {
      projectId: project._id.toString(),
      commitSha: newSha.slice(0, 7),
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

export async function handleGithubWebhook(req, res) {
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
  if (deliveryId && isRecentDelivery(deliveryId)) {
    return res.status(200).json({ ok: true, note: 'duplicate delivery' });
  }
  if (deliveryId) {
    markDelivery(deliveryId);
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
