import { randomBytes } from 'node:crypto';

import { logger } from '@hellodeploy/observability';

import { evaluateCommentAvailability, getCommentSettings } from './comment-settings.service.js';
import { listCommentThreads } from './comment.service.js';

const OBJECT_ID = /^[a-f0-9]{24}$/;

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
}) {
  async function getAvailability(article) {
    if (!featureEnabled || !article.commentsEnabled) {
      return { visible: false, accepting: false, reason: 'disabled' };
    }
    return evaluateCommentAvailability({
      article,
      featureEnabled,
      settings: await getSettings(),
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
      const listing = await listThreads({
        articleId: article.id,
        page: parsePage(page),
        expandThreadId: OBJECT_ID.test(thread ?? '') ? thread : null,
      });
      const replyTarget = findComment(listing.threads, replyTo);
      return {
        availability,
        ...listing,
        turnstileSiteKey,
        canReport: Boolean(isTurnstileConfigured),
        submissionKey: randomBytes(18).toString('base64url'),
        replyTarget,
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

function findComment(threads, id) {
  if (!OBJECT_ID.test(id ?? '')) {
    return null;
  }
  for (const thread of threads) {
    if (thread.comment.id === id) {
      return thread.comment;
    }
    const reply = thread.replies.find((item) => item.id === id);
    if (reply) {
      return reply;
    }
  }
  return null;
}
