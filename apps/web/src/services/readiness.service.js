import { mongoose } from '@hellodeploy/database';
import { getDeploymentQueue, getNotificationQueue, getRedisConnection } from '../queue/client.js';
import { env } from '../config/env.js';

const DEFAULT_TIMEOUT_MS = 2_000;

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('readiness check timed out')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

export async function checkWebReadiness({
  database = mongoose.connection,
  redis = getRedisConnection(),
  queue = getDeploymentQueue(),
  notificationQueue = getNotificationQueue(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const checks = {
    mongodb: database?.readyState === 1,
    redis: redis?.status === 'ready',
    queue: false,
    email: !env.isEmailConfigured(),
  };

  if (checks.redis && queue) {
    try {
      await withTimeout(queue.getJobCounts('waiting', 'active', 'delayed'), timeoutMs);
      checks.queue = true;
    } catch {
      checks.queue = false;
    }
  }
  if (checks.redis && notificationQueue && env.isEmailConfigured()) {
    try {
      const [, workers] = await Promise.all([
        withTimeout(notificationQueue.getJobCounts('waiting', 'active', 'delayed'), timeoutMs),
        withTimeout(notificationQueue.getWorkers(), timeoutMs),
      ]);
      checks.email = workers.length > 0;
    } catch {
      checks.email = false;
    }
  }

  return { ready: Object.values(checks).every(Boolean), checks };
}
