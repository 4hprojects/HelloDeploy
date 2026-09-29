import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';

import { env } from '../config/env.js';

const CONTENT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'content');

// Rendering the same file on every request is wasted work, but a cache in
// development means edits do not show up until restart.
const cache = new Map();

marked.use({ gfm: true, breaks: false });

/**
 * Render a markdown content file to HTML.
 *
 * Content is repo-authored, so it is trusted; nothing here renders anything a
 * visitor supplied. The rendered HTML carries no inline styles or scripts, so
 * it satisfies the Content Security Policy without exception.
 *
 * @param {string} collection Directory under `apps/web/content`, such as 'docs'.
 * @param {string} file File name within that directory.
 * @returns {Promise<string>} Rendered HTML.
 */
export async function renderContentFile(collection, file) {
  const cacheKey = `${collection}/${file}`;

  if (env.isProduction() && cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const source = await readFile(join(CONTENT_ROOT, collection, file), 'utf8');
  const html = marked.parse(source);

  if (env.isProduction()) {
    cache.set(cacheKey, html);
  }

  return html;
}
