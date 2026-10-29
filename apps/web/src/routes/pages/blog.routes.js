import { Router } from 'express';

import { createBlogController } from '../../controllers/blog.controller.js';

export function createBlogRouter({ getRepository }) {
  const router = Router();
  const blog = createBlogController({ getRepository });

  router.get('/', blog.getIndex);
  router.get('/category/:slug', blog.getCategory);
  router.get('/:slug', blog.getArticle);

  return router;
}
