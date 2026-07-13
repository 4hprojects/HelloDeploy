import {
  classifyRedisError,
  createRedisConnection,
  createDeploymentQueue,
} from '@hellodeploy/queue';
import { env } from '../config/env.js';
import { logger } from '@hellodeploy/observability';

let _redis = null;
let _queue = null;

/**
 * Returns the shared web Redis connection, creating it lazily on first call.
 * Returns null if Redis is not reachable (callers degrade gracefully).
 */
export function getRedisConnection() {
  if (_redis) {
    return _redis;
  }

  try {
    _redis = createRedisConnection(env.REDIS_CONNECTION);

    _redis.on('error', (err) => {
      logger.warn('Redis connection error', { error: classifyRedisError(err) });
    });

    return _redis;
  } catch (err) {
    logger.warn('Could not connect to Redis', { error: classifyRedisError(err) });
    return null;
  }
}

/**
 * Returns the shared deployment queue, creating it lazily on first call.
 * Returns null if Redis is not reachable (deployment features degrade gracefully).
 */
export function getDeploymentQueue() {
  if (_queue) {
    return _queue;
  }

  const redis = getRedisConnection();
  if (!redis) {
    return null;
  }

  try {
    _queue = createDeploymentQueue(redis);
    return _queue;
  } catch (err) {
    logger.warn('Could not initialize deployment queue', { error: classifyRedisError(err) });
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
