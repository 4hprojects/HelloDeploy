import { createHmac } from 'node:crypto';

import {
  ArticleComment,
  ArticleCommentReport,
  COMMENT_REPORT_REASONS,
} from '@hellodeploy/database';
import { AuditOutcome } from '@hellodeploy/contracts';
import { logger, writeAuditEvent } from '@hellodeploy/observability';

import { env } from '../../config/env.js';
import { MODERATION_POLICY_VERSION } from './moderation.js';

const OBJECT_ID = /^[a-f0-9]{24}$/;
const ADMIN_TRANSITIONS = Object.freeze({
  hide: { from: ['published'], to: 'hidden' },
  remove: { from: ['published', 'hidden'], to: 'removed' },
  restore: { from: ['hidden', 'removed'], to: 'published' },
});

/**
 * Record a reader's report and re-screen the comment. A report never hides a
 * comment by itself, however many arrive: only the moderation provider's
 * `unsafe` verdict on the re-check does, and an administrator can restore it.
 */
export async function reportComment(
  { commentId, articleId, reason, sessionId },
  {
    moderator,
    Comment = ArticleComment,
    Report = ArticleCommentReport,
    secret = env.SESSION_SECRET,
  },
) {
  if (!OBJECT_ID.test(commentId ?? '') || !COMMENT_REPORT_REASONS.includes(reason)) {
    return { outcome: 'invalid', status: 400 };
  }
  const comment = await Comment.findById(commentId).lean();
  if (!comment || comment.articleId !== articleId || comment.status !== 'published') {
    return { outcome: 'not_found', status: 404 };
  }

  const reporterHash = createHmac('sha256', secret).update(sessionId).digest('hex').slice(0, 32);
  try {
    await Report.create({ commentId: comment._id, articleId, reporterHash, reason });
  } catch (error) {
    if (error.code === 11000) {
      return { outcome: 'already_reported', status: 200 };
    }
    throw error;
  }
  await Comment.updateOne(
    { _id: comment._id },
    { $inc: { 'reports.count': 1 }, $set: { 'reports.lastReportedAt': new Date() } },
  );

  const verdict = await moderator.moderate(`${comment.displayName}\n\n${comment.body}`);
  if (verdict.decision !== 'unsafe') {
    return { outcome: 'reported', status: 202 };
  }

  const hidden = await Comment.updateOne(
    { _id: comment._id, status: 'published' },
    {
      $set: {
        status: 'hidden',
        statusChangedAt: new Date(),
        statusChangedBy: null,
        moderation: {
          decision: 'unsafe',
          reasons: verdict.categories,
          provider: moderator.provider,
          policyVersion: MODERATION_POLICY_VERSION,
          checkedAt: new Date(),
        },
      },
    },
  );
  if (hidden.modifiedCount === 1) {
    await writeAuditEvent({
      action: 'learning_hub.comment_auto_hidden',
      outcome: AuditOutcome.SUCCESS,
      actorRole: 'system',
      targetType: 'article_comment',
      targetId: String(comment._id),
      metadata: { articleId, categories: verdict.categories, trigger: 'report_rescreen' },
    });
  }
  return { outcome: 'reported', status: 202 };
}

/** Administrator hide, remove, or restore of a comment, always audited. */
export async function changeCommentStatus(
  { commentId, action, admin, sourceIp, correlationId },
  { Comment = ArticleComment } = {},
) {
  const transition = ADMIN_TRANSITIONS[action];
  if (!transition || !OBJECT_ID.test(commentId ?? '')) {
    return { changed: false, reason: 'invalid' };
  }
  const update = {
    status: transition.to,
    statusChangedAt: new Date(),
    statusChangedBy: admin.id,
  };
  const result = await Comment.findOneAndUpdate(
    { _id: commentId, status: { $in: transition.from } },
    { $set: update },
    { new: true },
  ).lean();
  if (!result) {
    return { changed: false, reason: 'not_allowed' };
  }
  await writeAuditEvent({
    action: `admin.learning_hub_comment_${action}`,
    outcome: AuditOutcome.SUCCESS,
    actorId: admin.id,
    actorRole: admin.platformRole,
    targetType: 'article_comment',
    targetId: commentId,
    sourceIp,
    correlationId,
    metadata: { articleId: result.articleId, status: transition.to },
  });
  logger.info('[learning-hub] Comment status changed', { commentId, status: transition.to });
  return { changed: true, comment: result };
}

/** Comments for the admin page, reported ones first. */
export async function listCommentsForAdmin(
  { status = 'published', page = 1, perPage = 25 },
  { Comment = ArticleComment } = {},
) {
  const filter = status === 'reported' ? { 'reports.count': { $gt: 0 } } : { status };
  const [comments, total] = await Promise.all([
    Comment.find(filter)
      .sort({ 'reports.count': -1, createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean(),
    Comment.countDocuments(filter),
  ]);
  return { comments, total, page, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}
