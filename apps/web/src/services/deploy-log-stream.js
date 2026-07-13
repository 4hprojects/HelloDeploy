import { classifyRedisError, createRedisConnection } from '@hellodeploy/queue';
import { logger } from '@hellodeploy/observability';
import { env } from '../config/env.js';

export const DEPLOY_LOG_CHANNEL_PREFIX = 'deploy-logs:';

// A Redis connection in subscriber mode can't run normal commands, so the
// SSE log stream gets its own lazily created client, shared by all streams.
let _subscriber = null;
const channelHandlers = new Map(); // channel → Set<handler>

function getSubscriber() {
  if (_subscriber) {
    return _subscriber;
  }
  try {
    _subscriber = createRedisConnection(env.REDIS_CONNECTION);
    _subscriber.on('error', (err) => {
      logger.warn('Deploy-log subscriber Redis error', { error: classifyRedisError(err) });
    });
    _subscriber.on('message', (channel, raw) => {
      const handlers = channelHandlers.get(channel);
      if (!handlers) {
        return;
      }
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch {
          // one broken stream must not affect the others
        }
      }
    });
    return _subscriber;
  } catch (err) {
    logger.warn('Could not create deploy-log subscriber connection', {
      error: classifyRedisError(err),
    });
    return null;
  }
}

/**
 * Subscribe to live log events for one deployment.
 * Returns an unsubscribe function, or null when Redis is unavailable
 * (callers fall back to DB polling).
 */
export function subscribeDeployLogs(deploymentId, handler) {
  const subscriber = getSubscriber();
  if (!subscriber) {
    return null;
  }

  const channel = `${DEPLOY_LOG_CHANNEL_PREFIX}${deploymentId}`;
  let handlers = channelHandlers.get(channel);
  if (!handlers) {
    handlers = new Set();
    channelHandlers.set(channel, handlers);
    subscriber.subscribe(channel).catch((err) => {
      logger.warn('Deploy-log subscribe failed', {
        channel,
        error: classifyRedisError(err),
      });
    });
  }
  handlers.add(handler);

  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      channelHandlers.delete(channel);
      subscriber.unsubscribe(channel).catch(() => {});
    }
  };
}
