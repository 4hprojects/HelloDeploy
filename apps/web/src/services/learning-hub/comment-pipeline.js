import { ArticleComment, REJECTED_COMMENT_RETENTION_SECONDS } from '@hellodeploy/database';
import { logger } from '@hellodeploy/observability';

import { commentFingerprint, screenComment } from './comment-heuristics.js';
import { parseCommentInput } from './comment-input.js';
import { CommentThreadError, resolveReplyTarget } from './comment.service.js';
import { MODERATION_POLICY_VERSION } from './moderation.js';

const IDEMPOTENCY_SECONDS = 10 * 60;
const DUPLICATE_WINDOW_SECONDS = 24 * 60 * 60;
const REJECTION_ALERT_PER_HOUR = 30;

// Messages say what to change without revealing which rule matched.
const MESSAGES = Object.freeze({
  verification: 'Complete the verification check and submit again.',
  unavailable:
    'Comments cannot be checked right now, so nothing was posted. Your text is kept below; please try again later.',
  link: 'Links and web addresses cannot be posted in comments. Remove them and submit again.',
  personal_data:
    'Please remove email addresses, phone numbers, or other contact details and submit again.',
  name_contact: 'Display names cannot contain links or contact details.',
  flood: 'Please shorten repeated characters and submit again.',
  revise:
    'This comment could not be posted as written. Please rephrase it so it follows the community guidelines.',
  rejected: 'This comment was not posted because it does not meet the community guidelines.',
});

/**
 * The ordered, server-side gate for a new comment. The caller has already
 * confirmed the article accepts comments and applied the rate limits.
 * Every protection that cannot run blocks the submission; nothing publishes
 * unless all of them pass.
 */
export function createCommentPipeline({
  verifyTurnstile,
  moderator,
  getRedis,
  expectedHostname,
  Comment = ArticleComment,
  now = () => new Date(),
}) {
  async function submit({ article, body, turnstileToken, sourceIp, staffUser = null }) {
    const { value, errors } = parseCommentInput(body);
    if (Object.keys(errors).length > 0) {
      return { outcome: 'invalid', status: 400, errors };
    }

    if (!staffUser) {
      const verification = await verifyTurnstile({
        token: turnstileToken,
        sourceIp,
        expectedAction: 'blog-comment',
        expectedHostname,
      });
      if (!verification.valid) {
        return {
          outcome: verification.reason === 'unavailable' ? 'unavailable' : 'verification_failed',
          status: verification.reason === 'unavailable' ? 503 : 400,
          errors: {
            form:
              verification.reason === 'unavailable' ? MESSAGES.unavailable : MESSAGES.verification,
          },
        };
      }
    }

    const redis = getRedis();
    if (!redis || redis.status !== 'ready') {
      return unavailable('Redis not ready');
    }

    // Redis keys this submission reserved; released if the comment cannot be saved.
    const claims = [`lh:comment:submission:${value.idempotencyKey}`];
    let claimed;
    try {
      claimed = await redis.set(claims[0], '1', 'EX', IDEMPOTENCY_SECONDS, 'NX');
    } catch (error) {
      return unavailable(error.message);
    }
    if (claimed !== 'OK') {
      return replayOutcome(value.idempotencyKey);
    }

    let thread;
    try {
      thread = await resolveReplyTarget(
        { articleId: article.id, replyToCommentId: value.replyTo },
        { Comment },
      );
    } catch (error) {
      if (error instanceof CommentThreadError) {
        await release(redis, claims);
        return { outcome: 'invalid', status: 400, errors: { replyTo: error.message } };
      }
      throw error;
    }

    const fingerprint = commentFingerprint(value.body);
    const base = {
      articleId: article.id,
      ...thread,
      displayName: staffUser ? staffUser.name : value.displayName,
      body: value.body,
      authorType: staffUser ? 'staff' : 'guest',
      staffUserId: staffUser?.id ?? null,
      fingerprint,
      idempotencyKey: value.idempotencyKey,
    };

    if (staffUser) {
      // Staff are authenticated administrators; their replies skip the guest screens.
      return publish(base, { decision: 'staff', reasons: [], provider: 'staff' }, claims);
    }

    const screen = screenComment(value);
    if (screen.decision === 'reject') {
      return reject(
        base,
        { decision: 'rejected', reasons: [screen.reason], provider: 'rules' },
        claims,
      );
    }
    if (screen.decision === 'revise') {
      await recordRejection(redis);
      return {
        outcome: 'revise',
        status: 422,
        errors: { [screen.field]: MESSAGES[screen.reason] ?? MESSAGES.revise },
      };
    }

    const fingerprintKey = `lh:comment:fingerprint:${article.id}:${fingerprint}`;
    let isDuplicate;
    try {
      isDuplicate =
        (await redis.set(fingerprintKey, '1', 'EX', DUPLICATE_WINDOW_SECONDS, 'NX')) !== 'OK';
    } catch (error) {
      return unavailable(error.message);
    }
    if (isDuplicate) {
      return reject(
        base,
        { decision: 'rejected', reasons: ['duplicate'], provider: 'rules' },
        claims,
      );
    }
    claims.push(fingerprintKey);

    const moderation = await moderator.moderate(`${value.displayName}\n\n${value.body}`);
    const metadata = {
      decision: moderation.decision,
      reasons: moderation.categories,
      provider: moderator.provider,
    };
    if (moderation.decision === 'unavailable') {
      // Release the fingerprint so the writer can resubmit once checks recover.
      await release(redis, [fingerprintKey]);
      return unavailable('moderation unavailable');
    }
    if (moderation.decision === 'unsafe') {
      return reject(base, metadata, claims);
    }
    if (moderation.decision !== 'safe') {
      await recordRejection(redis);
      return { outcome: 'revise', status: 422, errors: { body: MESSAGES.revise } };
    }
    return publish(base, metadata, claims);
  }

  async function publish(base, moderation, claims) {
    const { comment, failure } = await save(
      {
        ...base,
        status: 'published',
        moderation: { ...moderation, policyVersion: MODERATION_POLICY_VERSION, checkedAt: now() },
      },
      claims,
    );
    return failure ?? { outcome: 'published', status: 201, comment };
  }

  async function reject(base, moderation, claims) {
    const checkedAt = now();
    const { failure } = await save(
      {
        ...base,
        status: 'rejected',
        moderation: { ...moderation, policyVersion: MODERATION_POLICY_VERSION, checkedAt },
        purgeAt: new Date(checkedAt.getTime() + REJECTED_COMMENT_RETENTION_SECONDS * 1000),
      },
      claims,
    );
    if (failure) {
      return failure;
    }
    await recordRejection(getRedis());
    return { outcome: 'rejected', status: 422, errors: { form: MESSAGES.rejected } };
  }

  // Returns `{ comment }`, or `{ failure }` with the outcome to answer: a
  // reused submission key replays the original result, and any other failure
  // releases this submission's reservations so the writer can simply retry.
  async function save(document, claims) {
    try {
      return { comment: await Comment.create(document) };
    } catch (error) {
      if (error.code === 11000) {
        return { failure: await replayOutcome(document.idempotencyKey) };
      }
      await release(getRedis(), claims);
      return { failure: unavailable(`comment not saved: ${error.message}`) };
    }
  }

  async function release(redis, keys) {
    if (!redis || redis.status !== 'ready') {
      return;
    }
    await Promise.all(
      keys.map((key) =>
        redis.del(key).catch((error) => {
          logger.warn('[learning-hub] Comment reservation not released', { error: error.message });
        }),
      ),
    );
  }

  // A retried submission returns the original result instead of posting twice.
  async function replayOutcome(idempotencyKey) {
    const existing = await Comment.findOne({ idempotencyKey }).lean();
    if (existing?.status === 'published') {
      return { outcome: 'published', status: 200, comment: existing, replayed: true };
    }
    return {
      outcome: 'duplicate_submission',
      status: 409,
      errors: { form: 'This form was already submitted. Refresh the page to write a new comment.' },
    };
  }

  function unavailable(detail) {
    logger.error('[learning-hub] Comment protections unavailable; submission refused', { detail });
    return { outcome: 'unavailable', status: 503, errors: { form: MESSAGES.unavailable } };
  }

  // A burst of rejections usually means an attack or a misbehaving check.
  async function recordRejection(redis) {
    if (!redis || redis.status !== 'ready') {
      return;
    }
    try {
      const key = `lh:comment:rejections:${now().toISOString().slice(0, 13)}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, 2 * 60 * 60);
      }
      if (count === REJECTION_ALERT_PER_HOUR) {
        logger.error('[learning-hub] Comment rejection spike', { perHour: count });
      }
    } catch (error) {
      logger.warn('[learning-hub] Rejection counter unavailable', { error: error.message });
    }
  }

  return { submit };
}
