import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { logger } from '@hellodeploy/observability';

import { AUTHORS, CATEGORIES, SLUG_REDIRECTS } from '../../config/learning-hub.js';
import { parseArticleFile } from './article-schema.js';

export const DEFAULT_CONTENT_DIRECTORY = fileURLToPath(
  new URL('../../../../../content/blog/articles', import.meta.url),
);

const MAX_SEARCH_LENGTH = 100;

/**
 * Load, validate, and index every article in a directory. Errors are
 * returned rather than thrown: a broken article is left out, never served,
 * and the rest of the site keeps working. `npm run content:check` turns the
 * same errors into a failing exit code.
 */
export function createContentRepository({
  directory = DEFAULT_CONTENT_DIRECTORY,
  categories = CATEGORIES,
  authors = AUTHORS,
  redirects = SLUG_REDIRECTS,
  now = new Date(),
  readDirectory = defaultReadDirectory,
} = {}) {
  const errors = [];
  const parsed = [];

  for (const { file, raw } of readDirectory(directory)) {
    const result = parseArticleFile(raw, { file, categories, authors, now });
    errors.push(...result.errors);
    if (result.article) {
      parsed.push(result.article);
    }
  }

  const accepted = rejectDuplicates(parsed, errors);
  const published = accepted.filter((article) => article.status === 'published').sort(byNewest);
  const publishedSlugs = new Set(published.map((article) => article.slug));
  const usedCategories = new Set(published.map((article) => article.category));

  for (const article of published) {
    for (const href of article.links) {
      const problem = checkInternalLink(href, publishedSlugs, usedCategories);
      if (problem) {
        errors.push(`${article.file}: ${problem}`);
      }
    }
  }
  for (const [from, to] of Object.entries(redirects)) {
    if (!publishedSlugs.has(to)) {
      errors.push(`Slug redirect "${from}" points at "${to}", which is not a published article.`);
    }
    if (accepted.some((article) => article.slug === from)) {
      errors.push(`Slug redirect "${from}" shadows an existing article slug.`);
    }
  }

  const bySlug = new Map(published.map((article) => [article.slug, article]));
  const byId = new Map(published.map((article) => [article.id, article]));

  return Object.freeze({
    errors: Object.freeze(errors),
    categories,
    authors,
    listPublished: () => published,
    findPublishedBySlug: (slug) => bySlug.get(slug) ?? null,
    findPublishedById: (id) => byId.get(id) ?? null,
    findRedirect: (slug) => (Object.hasOwn(redirects, slug) ? redirects[slug] : null),
    listByCategory: (categorySlug) =>
      published.filter((article) => article.category === categorySlug),
    listByAuthor: (authorId) => published.filter((article) => article.authorId === authorId),
    listActiveCategories: () => categories.filter((category) => usedCategories.has(category.slug)),
    findCategory: (slug) => categories.find((category) => category.slug === slug) ?? null,
    findAuthor: (id) => authors.find((author) => author.id === id) ?? null,
    getFeatured: () => published.find((article) => article.featured) ?? published[0] ?? null,
    getRelated: (article, limit = 3) => related(published, article, limit),
    search: (query) => search(published, query),
  });
}

let defaultRepository = null;

/** The process-wide repository, loaded on first use from `content/blog/articles`. */
export function getContentRepository() {
  if (!defaultRepository) {
    defaultRepository = createContentRepository();
    for (const error of defaultRepository.errors) {
      logger.error({ error }, 'Learning Hub article rejected');
    }
  }
  return defaultRepository;
}

export function normalizeSearchQuery(query) {
  return typeof query === 'string' ? query.trim().slice(0, MAX_SEARCH_LENGTH) : '';
}

function defaultReadDirectory(directory) {
  let names;
  try {
    names = readdirSync(directory);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
  return names
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => ({ file: name, raw: readFileSync(join(directory, name), 'utf8') }));
}

function rejectDuplicates(articles, errors) {
  const seenIds = new Map();
  const seenSlugs = new Map();
  const duplicates = new Set();
  for (const article of articles) {
    if (seenIds.has(article.id)) {
      errors.push(
        `${article.file}: id "${article.id}" duplicates ${seenIds.get(article.id).file}.`,
      );
      duplicates.add(article).add(seenIds.get(article.id));
    }
    if (seenSlugs.has(article.slug)) {
      errors.push(
        `${article.file}: slug "${article.slug}" duplicates ${seenSlugs.get(article.slug).file}.`,
      );
      duplicates.add(article).add(seenSlugs.get(article.slug));
    }
    seenIds.set(article.id, article);
    seenSlugs.set(article.slug, article);
  }
  // Neither copy is served: picking one would silently hide the other.
  return articles.filter((article) => !duplicates.has(article));
}

function checkInternalLink(href, publishedSlugs, usedCategories) {
  if (!href.startsWith('/blog')) {
    return null;
  }
  const path = href.split(/[?#]/)[0].replace(/\/$/, '');
  if (path === '/blog') {
    return null;
  }
  const categoryMatch = /^\/blog\/category\/([a-z0-9-]+)$/.exec(path);
  if (categoryMatch) {
    return usedCategories.has(categoryMatch[1])
      ? null
      : `link ${href} points at a category with no published articles.`;
  }
  const articleMatch = /^\/blog\/([a-z0-9-]+)$/.exec(path);
  if (articleMatch && publishedSlugs.has(articleMatch[1])) {
    return null;
  }
  return `link ${href} does not resolve to a published article.`;
}

function byNewest(a, b) {
  return b.publishedAt - a.publishedAt || a.id.localeCompare(b.id);
}

function related(published, article, limit) {
  return published
    .filter((candidate) => candidate.id !== article.id)
    .map((candidate) => ({
      candidate,
      score:
        (candidate.category === article.category ? 2 : 0) +
        candidate.tags.filter((tag) => article.tags.includes(tag)).length,
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || byNewest(a.candidate, b.candidate))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

function search(published, query) {
  const terms = normalizeSearchQuery(query).toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return [];
  }
  return published.filter((article) => terms.every((term) => article.searchText.includes(term)));
}
