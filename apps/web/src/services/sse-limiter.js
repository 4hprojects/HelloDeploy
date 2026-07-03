import { logger } from '@hellodeploy/observability';
import { getRedisConnection } from '../queue/client.js';

// Above the 6-minute max stream duration so a crashed process can never leak
// slots for longer than one TTL window.
const SLOT_TTL_SECONDS = 7 * 60;

// Per-process fallback when Redis is unavailable (limits become per-instance).
const memoryCounts = new Map();

function memoryAcquire(key, limit) {
  const current = memoryCounts.get(key) ?? 0;
  if (current >= limit) {
    return false;
  }
  memoryCounts.set(key, current + 1);
  return true;
}

function memoryRelease(key) {
  const current = memoryCounts.get(key) ?? 0;
  if (current <= 1) {
    memoryCounts.delete(key);
    return;
  }
  memoryCounts.set(key, current - 1);
}

const defaultDeps = { getRedisConnection };

/**
 * Reserve one concurrent-stream slot for `key` (e.g. `sse:user:<id>`).
 * Shared across instances via Redis; falls back to per-process counting when
 * Redis is absent or not ready (never await a command on a non-ready client —
 * with maxRetriesPerRequest:null it would queue forever).
 *
 * @returns {Promise<boolean>} true when a slot was acquired
 */
export async function acquireStreamSlot(key, limit, deps = defaultDeps) {
  const redis = deps.getRedisConnection();
  if (redis && redis.status === 'ready') {
    try {
      const count = await redis.incr(key);
      await redis.expire(key, SLOT_TTL_SECONDS);
      if (count > limit) {
        await redis.decr(key);
        return false;
      }
      return true;
    } catch (err) {
      logger.warn('SSE limiter Redis error, falling back to in-memory counting', {
        error: err.message,
      });
    }
  }
  return memoryAcquire(key, limit);
}

export async function releaseStreamSlot(key, deps = defaultDeps) {
  const redis = deps.getRedisConnection();
  if (redis && redis.status === 'ready') {
    try {
      const count = await redis.decr(key);
      if (count <= 0) {
        await redis.del(key);
      }
      return;
    } catch (err) {
      logger.warn('SSE limiter Redis error on release', { error: err.message });
    }
  }
  memoryRelease(key);
}
