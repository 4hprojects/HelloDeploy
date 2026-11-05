import {
  MONITORING_SAMPLES_KEY,
  MONITORING_SNAPSHOT_KEY,
  MONITORING_SNAPSHOT_SCHEMA,
  MetricFreshness,
  getFreshness,
} from '@hellodeploy/contracts';
import { logger } from '@hellodeploy/observability';

import { getRedisConnection } from '../../queue/client.js';

// Every open dashboard polls; one Redis read per short window serves them all.
const READ_CACHE_MS = 2_000;
let cache = { at: 0, value: null };

/**
 * The latest snapshot the worker's collector published, with its freshness as
 * seen now. The web process only reads this sanitized copy; it never talks to
 * Docker or the host itself.
 */
export async function getMonitoringSnapshot({
  redis = getRedisConnection(),
  now = Date.now(),
} = {}) {
  if (cache.value && now - cache.at < READ_CACHE_MS) {
    return withFreshness(cache.value, now);
  }
  const value = await readSnapshot(redis);
  cache = { at: now, value };
  return withFreshness(value, now);
}

async function readSnapshot(redis) {
  if (!redis || redis.status !== 'ready') {
    return { snapshot: null, reason: 'Redis is not reachable from the web process' };
  }
  try {
    const raw = await redis.get(MONITORING_SNAPSHOT_KEY);
    if (!raw) {
      return { snapshot: null, reason: 'The worker has not published a snapshot recently' };
    }
    const snapshot = JSON.parse(raw);
    if (snapshot?.schema !== MONITORING_SNAPSHOT_SCHEMA) {
      return { snapshot: null, reason: 'The worker published an unrecognized snapshot version' };
    }
    return { snapshot, reason: null };
  } catch (error) {
    logger.warn('Overview: monitoring snapshot read failed', { error: error.message });
    return { snapshot: null, reason: 'The monitoring snapshot could not be read' };
  }
}

function withFreshness({ snapshot, reason }, now) {
  if (!snapshot) {
    return { snapshot: null, freshness: MetricFreshness.UNAVAILABLE, ageSeconds: null, reason };
  }
  const freshness = getFreshness(
    snapshot.collectedAt,
    snapshot.intervals?.resourceSeconds ?? 15,
    now,
  );
  return {
    snapshot,
    freshness,
    ageSeconds: Math.max(0, Math.round((now - Date.parse(snapshot.collectedAt)) / 1000)),
    reason:
      freshness === MetricFreshness.STALE
        ? 'The collector has not reported for over two intervals'
        : null,
  };
}

/** Raw 15 s samples, oldest first, for the 15-minute view and sparklines. */
export async function getRawSamples({ redis = getRedisConnection(), limit = 240 } = {}) {
  if (!redis || redis.status !== 'ready') {
    return [];
  }
  try {
    const rows = await redis.lrange(MONITORING_SAMPLES_KEY, 0, limit - 1);
    return rows
      .map((row) => {
        try {
          return JSON.parse(row);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch (error) {
    logger.warn('Overview: raw sample read failed', { error: error.message });
    return [];
  }
}

/** A metric value from the snapshot by key; null when absent or unavailable. */
export function metricValue(snapshot, key) {
  return snapshot?.metrics?.find((metric) => metric.key === key)?.value ?? null;
}

/** Test seam. */
export function clearSnapshotCache() {
  cache = { at: 0, value: null };
}
