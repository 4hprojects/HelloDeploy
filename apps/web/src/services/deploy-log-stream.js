import { classifyRedisError, createRedisConnection } from '@hellodeploy/queue';
import { logger } from '@hellodeploy/observability';
import { env } from '../config/env.js';

export const DEPLOY_LOG_CHANNEL_PREFIX = 'deploy-logs:';

// A Redis connection in subscriber mode can't run normal commands, so the
// SSE log stream gets its own lazily created client, shared by all streams.
let _subscriber = null;
const channelHandlers = new Map(); // channel → Set<handler>

/**
 * Fan a raw pub/sub message out to every handler subscribed to its channel.
 * Exported standalone (pure aside from the handler registry) so the fanout,
 * error-isolation, and malformed-payload behavior can be unit tested without
 * a real Redis connection.
 */
export function dispatchDeployLogMessage(channel, raw, handlers = channelHandlers) {
  const channelSubscribers = handlers.get(channel);
  if (!channelSubscribers) {
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  for (const handler of channelSubscribers) {
    try {
      handler(payload);
    } catch {
      // one broken stream must not affect the others
    }
  }
}

function getSubscriber() {
  if (_subscriber) {
    return _subscriber;
  }
  try {
    _subscriber = createRedisConnection(env.REDIS_CONNECTION);
    _subscriber.on('error', (err) => {
      logger.warn('Deploy-log subscriber Redis error', { error: classifyRedisError(err) });
    });
    _subscriber.on('message', (channel, raw) => dispatchDeployLogMessage(channel, raw));
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
