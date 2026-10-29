import { Router } from 'express';

import { createBlogController } from '../../controllers/blog.controller.js';
import { articleShareLimiter, articleViewLimiter } from '../../middleware/rate-limit.js';
import { asyncHandler } from '../../utils/async-handler.js';

export function createBlogRouter({ getRepository, viewsEnabled, stats }) {
  const router = Router();
  const blog = createBlogController({ getRepository, viewsEnabled, stats });

  router.post('/api/articles/:id/view', articleViewLimiter, asyncHandler(blog.postView));
  router.post('/api/articles/:id/share', articleShareLimiter, asyncHandler(blog.postShare));

  router.get('/', blog.getIndex);
  router.get('/category/:slug', blog.getCategory);
  router.get('/:slug', asyncHandler(blog.getArticle));

  return router;
}
