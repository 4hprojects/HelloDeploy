import { env } from '../config/env.js';
import { getContentRepository } from '../services/learning-hub/content-repository.js';
import {
  changeCommentStatus,
  listCommentsForAdmin,
} from '../services/learning-hub/comment-moderation.service.js';
import {
  getCommentSettings,
  setCommentSettings,
} from '../services/learning-hub/comment-settings.service.js';
import { asyncHandler } from '../utils/async-handler.js';

const STATUS_FILTERS = ['reported', 'published', 'hidden', 'removed', 'rejected'];
const ACTION_MESSAGES = {
  hide: 'Comment hidden.',
  remove: 'Comment removed.',
  restore: 'Comment restored.',
};

export const getAdminLearningHub = asyncHandler(async (req, res) => {
  const status = STATUS_FILTERS.includes(req.query.status) ? req.query.status : 'reported';
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const repository = getContentRepository();
  const [listing, settings] = await Promise.all([
    listCommentsForAdmin({ status, page }),
    getCommentSettings(),
  ]);
  res.render('pages/admin/learning-hub', {
    title: 'Learning Hub',
    pageStyles: ['css/learning-hub.css'],
    status,
    statusFilters: STATUS_FILTERS,
    listing,
    settings,
    articles: repository.listPublished(),
    articleTitle: (id) => repository.findPublishedById(id)?.title ?? id,
    commentsFeatureEnabled: env.LEARNING_HUB_COMMENTS_ENABLED,
    moderationProvider: env.LEARNING_HUB_MODERATION_PROVIDER,
    contentErrors: repository.errors,
  });
});

export const postAdminCommentAction = asyncHandler(async (req, res) => {
  const result = await changeCommentStatus({
    commentId: req.params.commentId,
    action: req.params.action,
    admin: req.session.user,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  req.flash(
    result.changed ? 'success' : 'error',
    result.changed ? ACTION_MESSAGES[req.params.action] : 'That change is not allowed.',
  );
  res.redirect(`/admin/learning-hub?status=${encodeURIComponent(req.body.returnStatus ?? '')}`);
});

export const postAdminCommentSettings = asyncHandler(async (req, res) => {
  const known = new Set(
    getContentRepository()
      .listPublished()
      .map((article) => article.id),
  );
  const paused = [req.body.pausedArticleIds ?? []].flat().filter((id) => known.has(id));
  await setCommentSettings({
    submissionsPaused: req.body.submissionsPaused === 'on',
    pausedArticleIds: paused,
    adminId: req.session.user.id,
    adminRole: req.session.user.platformRole,
    sourceIp: req.ip,
    correlationId: req.correlationId,
  });
  req.flash('success', 'Comment controls saved.');
  res.redirect('/admin/learning-hub');
});
