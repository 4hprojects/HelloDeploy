import { Router } from 'express';

import { createBlogController } from '../../controllers/blog.controller.js';
import { createBlogCommentsController } from '../../controllers/blog-comments.controller.js';
import {
  articleShareLimiter,
  articleViewLimiter,
  commentBurstLimiter,
  commentHourlyLimiter,
  commentReportLimiter,
} from '../../middleware/rate-limit.js';
import { createCommentsRuntime } from '../../services/learning-hub/comments-runtime.js';
import { asyncHandler } from '../../utils/async-handler.js';

export function createBlogRouter({
  getRepository,
  viewsEnabled,
  stats,
  comments = createCommentsRuntime(),
}) {
  const router = Router();
  const blog = createBlogController({
    getRepository,
    viewsEnabled,
    stats,
    discussion: comments.discussion,
  });
  const commentRoutes = createBlogCommentsController({
    getRepository,
    discussion: comments.discussion,
    pipeline: comments.pipeline,
    reportComment: comments.reportComment,
    renderArticle: blog.renderArticle,
  });

  router.post('/api/articles/:id/view', articleViewLimiter, asyncHandler(blog.postView));
  router.post('/api/articles/:id/share', articleShareLimiter, asyncHandler(blog.postShare));
  router.post(
    '/:slug/comments',
    asyncHandler(commentRoutes.requireOpen),
    commentBurstLimiter,
    commentHourlyLimiter,
    asyncHandler(commentRoutes.postComment),
  );
  router.post(
    '/:slug/comments/:commentId/report',
    asyncHandler(commentRoutes.requireReportable),
    commentReportLimiter,
    asyncHandler(commentRoutes.postReport),
  );

  router.get('/', blog.getIndex);
  router.get('/category/:slug', blog.getCategory);
  router.get('/:slug', asyncHandler(blog.getArticle));

  return router;
}
