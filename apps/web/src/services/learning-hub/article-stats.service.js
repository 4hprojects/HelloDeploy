import { createHmac } from 'node:crypto';

import { ArticleStat, SHARE_PLATFORMS } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';

import { env } from '../../config/env.js';
import { getRedisConnection } from '../../queue/client.js';

export const VIEW_DEDUP_SECONDS = 30 * 60;

// Best effort only: honest crawlers and monitors identify themselves, others
// do not. Counts are presented as approximate views, never unique visitors.
const AUTOMATED_AGENT =
  /bot|crawl|spider|slurp|preview|monitor|uptime|pingdom|lighthouse|headless|curl|wget|python-requests|httpclient|axios|node-fetch|go-http-client|facebookexternalhit|embedly|whatsapp|telegram|discord|slack/i;

export function isLikelyAutomatedAgent(userAgent) {
  return (
    typeof userAgent !== 'string' || userAgent.trim() === '' || AUTOMATED_AGENT.test(userAgent)
  );
}

/**
 * Count one view of a published article unless the same browser session
 * already counted it within the last 30 minutes. Never throws: reading must
 * not depend on the counter. When deduplication is unavailable the view is
 * not counted, so failures can only under-count.
 */
export async function recordArticleView(
  { articleId, sessionId, userAgent },
  { redis = getRedisConnection(), Stat = ArticleStat, secret = env.SESSION_SECRET } = {},
) {
  if (isLikelyAutomatedAgent(userAgent)) {
    return { counted: false, reason: 'automated_agent' };
  }
  if (!sessionId || !redis || redis.status !== 'ready') {
    return { counted: false, reason: 'dedup_unavailable' };
  }

  // The session id is hashed so Redis never holds a usable session identifier.
  const visitor = createHmac('sha256', secret).update(sessionId).digest('hex').slice(0, 32);
  const key = `lh:view:${articleId}:${visitor}`;

  let reserved;
  try {
    reserved = (await redis.set(key, '1', 'EX', VIEW_DEDUP_SECONDS, 'NX')) === 'OK';
  } catch (error) {
    logger.warn('[learning-hub] View dedup unavailable', { code: error.code ?? error.name });
    return { counted: false, reason: 'dedup_unavailable' };
  }
  if (!reserved) {
    return { counted: false, reason: 'duplicate' };
  }

  try {
    await Stat.updateOne({ articleId }, { $inc: { views: 1 } }, { upsert: true });
    return { counted: true, reason: 'counted' };
  } catch (error) {
    logger.warn('[learning-hub] View increment failed', { articleId, error: error.message });
    // Release the reservation so a later view in the window can still count.
    await redis.del(key).catch((releaseError) => {
      logger.warn('[learning-hub] View reservation not released', {
        code: releaseError.code ?? releaseError.name,
      });
    });
    return { counted: false, reason: 'store_unavailable' };
  }
}

/** Count a share-button click. A click is not a completed share. */
export async function recordShareClick({ articleId, platform }, { Stat = ArticleStat } = {}) {
  if (!SHARE_PLATFORMS.includes(platform)) {
    return { recorded: false, reason: 'unknown_platform' };
  }
  try {
    await Stat.updateOne(
      { articleId },
      { $inc: { [`shareClicks.${platform}`]: 1 } },
      { upsert: true },
    );
    return { recorded: true, reason: 'recorded' };
  } catch (error) {
    logger.warn('[learning-hub] Share click not recorded', { articleId, error: error.message });
    return { recorded: false, reason: 'store_unavailable' };
  }
}

const VIEW_COUNT_TIMEOUT_MS = 1500;

/**
 * The article's view total, or null when the store cannot answer quickly.
 * Mongoose queues queries while disconnected, so a timeout keeps a database
 * outage from stalling the article page.
 */
export async function getArticleViewCount(articleId, { Stat = ArticleStat } = {}) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ timedOut: true }), VIEW_COUNT_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([Stat.findOne({ articleId }, { views: 1 }).lean(), timeout]);
    if (result?.timedOut) {
      logger.warn('[learning-hub] View count timed out', { articleId });
      return null;
    }
    return result?.views ?? 0;
  } catch (error) {
    logger.warn('[learning-hub] View count unavailable', { articleId, error: error.message });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
