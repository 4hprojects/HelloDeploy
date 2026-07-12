import { mongoose } from '@hellodeploy/database';
import { getDeploymentQueue, getRedisConnection } from '../queue/client.js';

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
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const checks = {
    mongodb: database?.readyState === 1,
    redis: redis?.status === 'ready',
    queue: false,
  };

  if (checks.redis && queue) {
    try {
      await withTimeout(queue.getJobCounts('waiting', 'active', 'delayed'), timeoutMs);
      checks.queue = true;
    } catch {
      checks.queue = false;
    }
  }

  return { ready: Object.values(checks).every(Boolean), checks };
}
