import { findDocsPage } from '../config/docs-pages.js';
import { renderContentFile } from './content.service.js';

/**
 * Render a documentation page's markdown to HTML.
 *
 * @param {string} slug
 * @returns {Promise<string|null>} HTML, or null when no such page exists.
 */
export async function renderDocsPage(slug) {
  const page = findDocsPage(slug);
  if (!page) {
    return null;
  }

  return renderContentFile('docs', page.file);
}
