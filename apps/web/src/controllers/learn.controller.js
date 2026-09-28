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

export async function getLearnArticle(req, res, next) {
  const page = findLearnPage(req.params.slug);
  if (!page) {
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
    structuredData: JSON.stringify({
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
