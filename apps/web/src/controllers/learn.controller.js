import { asyncHandler } from '../utils/async-handler.js';
import { findLearnPage, getLearnCategory, learnCategories } from '../config/learn-pages.js';
import { renderContentFile } from '../services/content.service.js';

const LAYOUT = 'layouts/public';

export function getLearnIndex(_req, res) {
  res.render('pages/learn/index', {
    title: 'Learn',
    description:
      'Plain explanations of deployment, hosting, domains, DNS, servers and security — the concepts behind getting a website online.',
    learnCategories,
    layout: LAYOUT,
  });
}

export const getLearnArticle = asyncHandler(async (req, res, next) => {
  return renderArticle(req, res, next);
});

/** Troubleshooting guides live one level deeper, at /learn/troubleshooting/. */
export const getTroubleshootingArticle = asyncHandler(async (req, res, next) => {
  return renderArticle(req, res, next);
});

async function renderArticle(req, res, next) {
  const page = findLearnPage(req.params.slug);

  // A slug alone does not identify a page: guides live under /learn/troubleshooting/
  // and articles directly under /learn/. Serving either from the other's route would
  // put every page at two addresses.
  if (!page || page.path !== req.path) {
    // Fall through to the 404 handler rather than rendering an empty article.
    return next();
  }

  const content = await renderContentFile('learn', page.file);
  const category = getLearnCategory(page.slug);

  res.render('pages/learn/article', {
    title: page.title,
    description: page.description,
    canonical: page.path,
    page,
    category,
    content,
    // Editorial articles carry Article structured data, as the content spec requires.
    // Escaped so a '<' in a title can never close the script tag it sits inside.
    structuredData: toJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.title,
      description: page.description,
      author: { '@type': 'Person', name: page.author },
      datePublished: page.published,
      dateModified: page.updated,
      mainEntityOfPage: `${res.locals.siteUrl}${page.path}`,
    }),
    layout: LAYOUT,
  });
}

/** Serialise structured data for embedding in a <script> tag. */
function toJsonLd(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}
