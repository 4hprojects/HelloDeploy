import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  docsPages,
  docsSections,
  findDocsPage,
  getDocsNeighbours,
  getDocsSection,
} from '../../apps/web/src/config/docs-pages.js';

const contentRoot = fileURLToPath(new URL('../../apps/web/content/docs/', import.meta.url));
const contentFiles = await readdir(contentRoot);

const sources = new Map();
for (const page of docsPages) {
  sources.set(page.slug, await readFile(contentRoot + page.file, 'utf8'));
}

describe('documentation registry', () => {
  it('gives every page a content file that exists', () => {
    assert.deepEqual(
      docsPages.filter((page) => !contentFiles.includes(page.file)),
      [],
    );
  });

  it('leaves no content file unreferenced by the registry', () => {
    const referenced = new Set(docsPages.map((page) => page.file));

    assert.deepEqual(
      contentFiles.filter((file) => file.endsWith('.md') && !referenced.has(file)),
      [],
    );
  });

  it('gives every page a unique slug', () => {
    const slugs = docsPages.map((page) => page.slug);

    assert.equal(new Set(slugs).size, slugs.length);
  });

  it('gives every page a description for its meta tag', () => {
    assert.deepEqual(
      docsPages.filter((page) => !page.description),
      [],
    );
  });

  it('finds a page by slug', () => {
    assert.equal(findDocsPage(docsPages[0].slug).title, docsPages[0].title);
  });

  it('returns nothing for a slug that does not exist', () => {
    assert.equal(findDocsPage('no-such-page'), undefined);
  });

  it('places the first page with no previous link', () => {
    assert.equal(getDocsNeighbours(docsPages[0].slug).previous, null);
  });

  it('places the last page with no next link', () => {
    assert.equal(getDocsNeighbours(docsPages.at(-1).slug).next, null);
  });

  it('puts every page in a section, for breadcrumbs', () => {
    assert.deepEqual(
      docsPages.filter((page) => !getDocsSection(page.slug)),
      [],
    );
  });

  it('gives every section at least one page', () => {
    assert.deepEqual(
      docsSections.filter((section) => section.pages.length === 0),
      [],
    );
  });
});

describe('documentation content', () => {
  it('links only to documentation pages that exist', () => {
    const dangling = [];
    for (const [slug, source] of sources) {
      for (const match of source.matchAll(/\]\((\/docs\/[a-z0-9-]+)\)/g)) {
        const target = match[1].replace('/docs/', '');
        if (!findDocsPage(target)) {
          dangling.push(`${slug} -> ${match[1]}`);
        }
      }
    }

    assert.deepEqual(dangling, []);
  });

  it('starts each page below the H1, which the template renders', () => {
    const withH1 = [...sources.entries()].filter(([, source]) => /^# /m.test(source));

    assert.deepEqual(withH1, []);
  });

  it('never shows a real deploy hook token in an example', () => {
    const leaked = [...sources.entries()].filter(([, source]) =>
      /deploy-hooks\/[0-9a-f]{8,}/.test(source),
    );

    assert.deepEqual(leaked, []);
  });
});
