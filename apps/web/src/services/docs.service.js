import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';

import { env } from '../config/env.js';
import { findDocsPage } from '../config/docs-pages.js';

const CONTENT_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'content',
  'docs',
);

// Rendering the same file on every request is wasted work, but a cache in
// development means edits do not show up until restart.
const cache = new Map();

marked.use({ gfm: true, breaks: false });

/**
 * Render a documentation page's markdown to HTML.
 *
 * Content is repo-authored, so it is trusted; nothing here renders anything a
 * visitor supplied. The rendered HTML carries no inline styles or scripts, so
 * it satisfies the Content Security Policy without exception.
 *
 * @param {string} slug
 * @returns {Promise<string|null>} HTML, or null when no such page exists.
 */
export async function renderDocsPage(slug) {
  const page = findDocsPage(slug);
  if (!page) {
    return null;
  }

  if (env.isProduction() && cache.has(slug)) {
    return cache.get(slug);
  }

  const source = await readFile(join(CONTENT_ROOT, page.file), 'utf8');
  const html = marked.parse(source);

  if (env.isProduction()) {
    cache.set(slug, html);
  }

  return html;
}
