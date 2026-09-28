import { asyncHandler } from '../utils/async-handler.js';
import {
  docsPages,
  docsSections,
  findDocsPage,
  getDocsNeighbours,
  getDocsSection,
} from '../config/docs-pages.js';
import { renderDocsPage } from '../services/docs.service.js';

const LAYOUT = 'layouts/public';

export function getDocsIndex(_req, res) {
  res.render('pages/docs/index', {
    title: 'Documentation',
    description:
      'How to configure, deploy, and manage a project on HelloDeploy — build settings, environment variables, deployments, domains, and troubleshooting.',
    docsSections,
    layout: LAYOUT,
  });
}

export const getDocsArticle = asyncHandler(async (req, res, next) => {
  const page = findDocsPage(req.params.slug);
  if (!page) {
    // Fall through to the 404 handler rather than rendering an empty article.
    return next();
  }

  const content = await renderDocsPage(page.slug);
  const { previous, next: nextPage } = getDocsNeighbours(page.slug);

  res.render('pages/docs/article', {
    title: page.title,
    description: page.description,
    canonical: `/docs/${page.slug}`,
    page,
    section: getDocsSection(page.slug),
    docsSections,
    content,
    previous,
    next: nextPage,
    layout: LAYOUT,
  });
});

/** Documentation paths for the sitemap. */
export const docsPaths = ['/docs', ...docsPages.map((page) => `/docs/${page.slug}`)];
