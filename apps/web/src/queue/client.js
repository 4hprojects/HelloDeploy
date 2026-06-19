import { createRedisConnection, createDeploymentQueue } from '@hellodeploy/queue';
import { env } from '../config/env.js';
import { logger } from '@hellodeploy/observability';

let _redis = null;
let _queue = null;

/**
 * Returns the shared deployment queue, creating it lazily on first call.
 * Returns null if Redis is not reachable (deployment features degrade gracefully).
 */
export function getDeploymentQueue() {
  if (_queue) return _queue;

  try {
    _redis = createRedisConnection({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
    });

    _redis.on('error', (err) => {
      logger.warn('Redis connection error', { error: err.message });
    });

    _queue = createDeploymentQueue(_redis);
    return _queue;
  } catch (err) {
    logger.warn('Could not initialize deployment queue', { error: err.message });
    return null;
  }
}

/**
 * Gracefully close the queue and Redis connection on shutdown.
 */
export async function closeDeploymentQueue() {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}
