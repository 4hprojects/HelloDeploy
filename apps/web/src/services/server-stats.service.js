import { cpus, totalmem, freemem, loadavg, uptime } from 'node:os';
import { statfs } from 'node:fs/promises';
import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { getDeploymentQueue } from '../queue/client.js';
import { env } from '../config/env.js';

/**
 * Collect host and platform statistics for the admin server dashboard.
 * All stats are best-effort — any individual failure returns nulls for that section.
 *
 * @returns {Promise<object>}
 */
export async function collectServerStats() {
  const [memory, disk, queue, running] = await Promise.all([
    getMemoryStats(),
    getDiskStats(),
    getQueueStats(),
    getRunningContainerCount(),
  ]);

  const load = loadavg();
  const uptimeSecs = Math.floor(uptime());

  return {
    memory,
    disk,
    queue,
    running,
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
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
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

async function getQueueStats() {
  try {
    const queue = getDeploymentQueue();
    if (!queue) return null;
    const counts = await queue.getJobCounts(
      'waiting', 'active', 'completed', 'failed', 'delayed', 'paused',
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
