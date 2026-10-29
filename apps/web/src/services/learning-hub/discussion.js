import { randomBytes } from 'node:crypto';

import { logger } from '@hellodeploy/observability';

import { evaluateCommentAvailability, getCommentSettings } from './comment-settings.service.js';
import { findPublishedComment, listCommentThreads } from './comment.service.js';

const OBJECT_ID = /^[a-f0-9]{24}$/;
// Mongoose queues queries while disconnected (10 s by default); the article
// must not wait that long for its discussion.
const STORE_TIMEOUT_MS = 2_000;
const PAUSED = Object.freeze({ submissionsPaused: true, pausedArticleIds: [], readable: false });

/**
 * Everything the article page needs for its discussion section, assembled so
 * a comment-store outage degrades to "discussion unavailable" instead of
 * breaking the article.
 */
export function createDiscussion({
  featureEnabled,
  turnstileSiteKey,
  isTurnstileConfigured,
  isModerationConfigured,
  getSettings = getCommentSettings,
  listThreads = listCommentThreads,
  findComment = findPublishedComment,
  timeoutMs = STORE_TIMEOUT_MS,
}) {
  async function getAvailability(article) {
    if (!featureEnabled || !article.commentsEnabled) {
      return { visible: false, accepting: false, reason: 'disabled' };
    }
    return evaluateCommentAvailability({
      article,
      featureEnabled,
      // An unanswered settings read counts as paused: it must never open comments.
      settings: await withTimeout(getSettings(), timeoutMs).catch(() => PAUSED),
      isTurnstileConfigured,
      isModerationConfigured,
    });
  }

  async function load(article, { page, thread, replyTo, form } = {}) {
    const availability = await getAvailability(article);
    if (!availability.visible) {
      return { availability };
    }
    try {
      const [listing, replyTarget] = await withTimeout(
        Promise.all([
          listThreads({
            articleId: article.id,
            page: parsePage(page),
            expandThreadId: OBJECT_ID.test(thread ?? '') ? thread : null,
          }),
          OBJECT_ID.test(replyTo ?? '')
            ? findComment({ articleId: article.id, id: replyTo })
            : null,
        ]),
        timeoutMs,
      );
      return {
        availability,
        ...listing,
        turnstileSiteKey,
        canReport: Boolean(isTurnstileConfigured),
        submissionKey: randomBytes(18).toString('base64url'),
        replyTarget: replyTarget ?? null,
        form: form ?? { displayName: '', body: '', errors: {} },
      };
    } catch (error) {
      logger.warn('[learning-hub] Discussion unavailable', {
        articleId: article.id,
        error: error.message,
      });
      return { availability: { ...availability, accepting: false }, unavailable: true };
    }
  }

  return { getAvailability, load, canAcceptReports: Boolean(isTurnstileConfigured) };
}

function parsePage(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('comment store timed out')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
