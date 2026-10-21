import { logger } from '@hellodeploy/observability';

// A mismatched webhook secret rejects every GitHub delivery while the rest of
// the platform looks healthy, so push-to-deploy can be silently broken for
// months. This record lets the admin Server page show it.
const HEALTH_KEY = 'webhook:github:health';

/**
 * Record whether a GitHub delivery passed signature verification. Best effort:
 * it never throws and never waits on a Redis client that is not connected.
 *
 * @param {import('ioredis').Redis|null} redis
 * @param {'accepted'|'rejected'} outcome
 */
export async function recordWebhookOutcome(redis, outcome, now = new Date()) {
  // With maxRetriesPerRequest:null, a command on a disconnected client queues forever.
  if (!redis || redis.status !== 'ready') {
    return;
  }
  try {
    if (outcome === 'accepted') {
      await redis.hset(HEALTH_KEY, {
        lastAcceptedAt: now.toISOString(),
        rejectedSinceAccepted: '0',
      });
    } else {
      await redis.hset(HEALTH_KEY, 'lastRejectedAt', now.toISOString());
      await redis.hincrby(HEALTH_KEY, 'rejectedSinceAccepted', 1);
    }
  } catch (error) {
    logger.warn('Webhook health: could not record the delivery outcome', { error: error.message });
  }
}

/**
 * The GitHub webhook delivery record, or null when Redis is unavailable.
 * `isFailing` means the most recent deliveries were rejected, which is almost
 * always a secret that differs between the GitHub App and the server.
 */
export async function getWebhookHealth(redis) {
  if (!redis || redis.status !== 'ready') {
    return null;
  }
  let record;
  try {
    record = await redis.hgetall(HEALTH_KEY);
  } catch (error) {
    logger.warn('Webhook health: could not read the delivery record', { error: error.message });
    return null;
  }
  const lastAcceptedAt = record.lastAcceptedAt ?? null;
  const lastRejectedAt = record.lastRejectedAt ?? null;
  const rejectedSinceAccepted = Number(record.rejectedSinceAccepted ?? 0);
  return {
    lastAcceptedAt,
    lastRejectedAt,
    rejectedSinceAccepted,
    isFailing:
      rejectedSinceAccepted > 0 &&
      (!lastAcceptedAt || (lastRejectedAt !== null && lastRejectedAt > lastAcceptedAt)),
  };
}
