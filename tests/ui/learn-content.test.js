import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  findLearnPage,
  getLearnCategory,
  learnCategories,
  learnPages,
  learnPaths,
} from '../../apps/web/src/config/learn-pages.js';

const contentRoot = fileURLToPath(new URL('../../apps/web/content/learn/', import.meta.url));
const contentFiles = await readdir(contentRoot);

const sources = new Map();
for (const page of learnPages) {
  sources.set(page.slug, await readFile(contentRoot + page.file, 'utf8'));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('learn registry', () => {
  it('gives every article a content file that exists', () => {
    assert.deepEqual(
      learnPages.filter((page) => !contentFiles.includes(page.file)),
      [],
    );
  });

  it('leaves no content file unreferenced', () => {
    const referenced = new Set(learnPages.map((page) => page.file));

    assert.deepEqual(
      contentFiles.filter((file) => file.endsWith('.md') && !referenced.has(file)),
      [],
    );
  });

  it('gives every article a unique slug', () => {
    const slugs = learnPages.map((page) => page.slug);

    assert.equal(new Set(slugs).size, slugs.length);
  });

  it('gives every article a unique path', () => {
    const paths = learnPages.map((page) => page.path);

    assert.equal(new Set(paths).size, paths.length);
  });

  it('gives every article a description for its meta tag', () => {
    assert.deepEqual(
      learnPages.filter((page) => !page.description),
      [],
    );
  });

  it('gives every article an author, as editorial content requires', () => {
    assert.deepEqual(
      learnPages.filter((page) => !page.author),
      [],
    );
  });

  it('dates every article in a form structured data accepts', () => {
    assert.deepEqual(
      learnPages.filter((page) => !ISO_DATE.test(page.published) || !ISO_DATE.test(page.updated)),
      [],
    );
  });

  it('never dates an update before publication', () => {
    assert.deepEqual(
      learnPages.filter((page) => page.updated < page.published),
      [],
    );
  });

  it('puts every article in a category, for breadcrumbs', () => {
    assert.deepEqual(
      learnPages.filter((page) => !getLearnCategory(page.slug)),
      [],
    );
  });

  it('finds an article by slug', () => {
    assert.equal(findLearnPage(learnPages[0].slug).title, learnPages[0].title);
  });

  it('returns nothing for a slug that does not exist', () => {
    assert.equal(findLearnPage('no-such-article'), undefined);
  });

  it('lists the index and every article for the sitemap', () => {
    assert.deepEqual(learnPaths, ['/learn', ...learnPages.map((page) => page.path)]);
  });

  it('gives every category at least one article', () => {
    assert.deepEqual(
      learnCategories.filter((category) => category.pages.length === 0),
      [],
    );
  });
});

describe('learn routing', () => {
  it('distinguishes an article path from a troubleshooting path', () => {
    const articlePaths = learnPages.map((page) => page.path);
    const collisions = learnPages.filter((page) => {
      const other = page.path.startsWith('/learn/troubleshooting/')
        ? `/learn/${page.slug}`
        : `/learn/troubleshooting/${page.slug}`;
      return articlePaths.includes(other);
    });

    assert.deepEqual(collisions, []);
  });

  it('puts troubleshooting guides under the troubleshooting path', () => {
    const guides = learnCategories.find((category) => category.heading === 'Troubleshooting');

    assert.deepEqual(
      (guides?.pages ?? []).filter((page) => !page.path.startsWith('/learn/troubleshooting/')),
      [],
    );
  });

  it('keeps every other article directly under learn', () => {
    const others = learnCategories
      .filter((category) => category.heading !== 'Troubleshooting')
      .flatMap((category) => category.pages);

    assert.deepEqual(
      others.filter((page) => page.path !== `/learn/${page.slug}`),
      [],
    );
  });
});

describe('learn content', () => {
  it('links only to learn articles that exist', () => {
    const dangling = [];
    for (const [slug, source] of sources) {
      for (const match of source.matchAll(/\]\((\/learn\/[a-z0-9/-]+)\)/g)) {
        if (!learnPaths.includes(match[1])) {
          dangling.push(`${slug} -> ${match[1]}`);
        }
      }
    }

    assert.deepEqual(dangling, []);
  });

  it('starts each article below the H1, which the template renders', () => {
    assert.deepEqual(
      [...sources.entries()].filter(([, source]) => /^# /m.test(source)),
      [],
    );
  });
});
