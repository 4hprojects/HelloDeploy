import { env } from '../../config/env.js';
import { getRedisConnection } from '../../queue/client.js';
import { verifyTurnstileStrict } from '../turnstile.service.js';
import { createCommentPipeline } from './comment-pipeline.js';
import { reportComment } from './comment-moderation.service.js';
import { createDiscussion } from './discussion.js';
import { createModerator } from './moderation.js';

/**
 * Assemble the comment system from configuration. Tests pass their own
 * Turnstile verifier, moderator, and Redis; production uses the real ones.
 */
export function createCommentsRuntime({
  featureEnabled = env.LEARNING_HUB_COMMENTS_ENABLED,
  turnstileSiteKey = env.TURNSTILE_SITE_KEY,
  turnstileSecretKey = env.TURNSTILE_SECRET_KEY,
  verifyTurnstile = verifyTurnstileStrict,
  moderator = createModerator({
    provider: env.LEARNING_HUB_MODERATION_PROVIDER,
    apiKey: env.OPENAI_MODERATION_API_KEY,
  }),
  getRedis = getRedisConnection,
  getSettings,
  expectedHostname = env.PLATFORM_DOMAIN.split(':')[0],
} = {}) {
  const isTurnstileConfigured = Boolean(turnstileSiteKey && turnstileSecretKey);
  const discussion = createDiscussion({
    featureEnabled,
    turnstileSiteKey,
    isTurnstileConfigured,
    isModerationConfigured: moderator.isConfigured,
    ...(getSettings ? { getSettings } : {}),
  });
  const pipeline = createCommentPipeline({
    verifyTurnstile,
    moderator,
    getRedis,
    expectedHostname,
  });

  async function report({ turnstileToken, sourceIp, ...input }) {
    const verification = await verifyTurnstile({
      token: turnstileToken,
      sourceIp,
      expectedAction: 'blog-report',
      expectedHostname,
    });
    if (!verification.valid) {
      return verification.reason === 'unavailable'
        ? { outcome: 'unavailable', status: 503 }
        : { outcome: 'verification_failed', status: 400 };
    }
    return reportComment(input, { moderator });
  }

  return { discussion, pipeline, reportComment: report };
}
