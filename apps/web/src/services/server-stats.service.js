import { cpus, totalmem, freemem, loadavg, uptime } from 'node:os';
import { statfs } from 'node:fs/promises';
import { Deployment, EmailDelivery, EmailDeliveryOutcome, mongoose } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { getDeploymentQueue } from '../queue/client.js';
import { env } from '../config/env.js';
import { checkWorkerReadiness } from './worker-readiness.service.js';

// Docker daemon connectivity is intentionally not checked here: the web
// process has no Docker socket access by design (privilege isolation from
// the worker), so it cannot query Docker directly without violating that
// boundary. Worker connectivity (below) is the closest available proxy.
async function getMongoStats() {
  const readyState = mongoose.connection.readyState; // 1 = connected
  if (readyState !== 1) {
    return { connected: false };
  }
  try {
    await mongoose.connection.db.admin().ping();
    return { connected: true };
  } catch {
    return { connected: false };
  }
}

/**
 * Recent email delivery health.
 *
 * A send that fails, or is skipped because no provider key is configured,
 * previously left no operator-visible trace - which is how a broken signup
 * path went unnoticed.
 */
async function getEmailStats() {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [sent, failed, skipped, lastFailure] = await Promise.all([
      EmailDelivery.countDocuments({
        outcome: EmailDeliveryOutcome.SENT,
        createdAt: { $gte: since },
      }),
      EmailDelivery.countDocuments({
        outcome: EmailDeliveryOutcome.FAILED,
        createdAt: { $gte: since },
      }),
      EmailDelivery.countDocuments({
        outcome: EmailDeliveryOutcome.SKIPPED,
        createdAt: { $gte: since },
      }),
      EmailDelivery.findOne({ outcome: { $ne: EmailDeliveryOutcome.SENT } })
        .sort({ createdAt: -1 })
        .select('template outcome error createdAt')
        .lean(),
    ]);
    return { sent, failed, skipped, healthy: failed === 0 && skipped === 0, lastFailure };
  } catch {
    return { sent: null, failed: null, skipped: null, healthy: null, lastFailure: null };
  }
}

/**
 * Collect host and platform statistics for the admin server dashboard.
 * All stats are best-effort — any individual failure returns nulls for that section.
 *
 * @returns {Promise<object>}
 */
export async function collectServerStats(deps = {}) {
  const queueClient =
    deps.queue === undefined ? (deps.getDeploymentQueue ?? getDeploymentQueue)() : deps.queue;
  const [memory, disk, queue, worker, running, mongo, email] = await Promise.all([
    getMemoryStats(),
    getDiskStats(),
    getQueueStats(queueClient),
    checkWorkerReadiness(queueClient),
    getRunningContainerCount(),
    getMongoStats(),
    getEmailStats(),
  ]);

  const load = loadavg();
  const uptimeSecs = Math.floor(uptime());

  return {
    memory,
    disk,
    queue,
    worker,
    running,
    mongo,
    email,
    cpu: {
      cores: cpus().length,
      load1: load[0].toFixed(2),
      load5: load[1].toFixed(2),
      load15: load[2].toFixed(2),
    },
    uptime: {
      seconds: uptimeSecs,
      human: formatUptime(uptimeSecs),
    },
    collectedAt: new Date().toISOString(),
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) {
    return `${d}d ${h}h ${m}m`;
  }
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m`;
}

async function getMemoryStats() {
  try {
    const total = totalmem();
    const free = freemem();
    const used = total - free;
    return {
      totalMb: Math.round(total / 1024 / 1024),
      usedMb: Math.round(used / 1024 / 1024),
      freeMb: Math.round(free / 1024 / 1024),
      usedPercent: Math.round((used / total) * 100),
    };
  } catch {
    return null;
  }
}

async function getDiskStats() {
  try {
    // Stat the platform data directory (or / as fallback)
    const path = env.BUILD_WORKSPACE_ROOT ?? '/';
    const stats = await statfs(path);
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    const used = total - free;
    return {
      totalGb: (total / 1024 / 1024 / 1024).toFixed(1),
      usedGb: (used / 1024 / 1024 / 1024).toFixed(1),
      freeGb: (free / 1024 / 1024 / 1024).toFixed(1),
      usedPercent: Math.round((used / total) * 100),
    };
  } catch {
    return null;
  }
}

async function getQueueStats(queue) {
  try {
    if (!queue) {
      return null;
    }
    const counts = await queue.getJobCounts(
      'waiting',
      'active',
      'completed',
      'failed',
      'delayed',
      'paused',
    );
    const isPaused = await queue.isPaused();
    return { ...counts, paused: isPaused };
  } catch {
    return null;
  }
}

async function getRunningContainerCount() {
  try {
    return Deployment.countDocuments({
      status: DeploymentStatus.HEALTHY,
      activeContainerId: { $ne: null },
    });
  } catch {
    return null;
  }
}
