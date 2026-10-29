import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createContentRepository } from '../../apps/web/src/services/learning-hub/content-repository.js';
import { articleFile } from './fixtures.js';

const NOW = new Date('2026-10-29T12:00:00Z');

function load(files, options = {}) {
  return createContentRepository({ readDirectory: () => files, now: NOW, ...options });
}

describe('Learning Hub content repository', () => {
  it('publishes a valid article', () => {
    const repo = load([articleFile()]);
    assert.equal(repo.findPublishedBySlug('sample-article')?.id, 'sample-1');
  });

  it('reports no errors for valid content', () => {
    const repo = load([articleFile()]);
    assert.deepEqual(repo.errors, []);
  });

  it('keeps drafts out of every public listing', () => {
    const repo = load([articleFile({ status: 'draft' })]);
    assert.deepEqual(
      [
        repo.listPublished().length,
        repo.findPublishedBySlug('sample-article'),
        repo.listByCategory('deployment-guides').length,
        repo.search('sample').length,
        repo.listActiveCategories().length,
      ],
      [0, null, 0, 0, 0],
    );
  });

  it('rejects malformed YAML', () => {
    const repo = load([{ file: 'bad.md', raw: '---\ntitle: [unclosed\n---\nBody' }]);
    assert.match(repo.errors[0], /malformed YAML/);
  });

  it('rejects a file without front matter', () => {
    const repo = load([{ file: 'bare.md', raw: '# Just markdown' }]);
    assert.match(repo.errors[0], /missing YAML front matter/);
  });

  it('rejects an unknown author', () => {
    const repo = load([articleFile({ authorId: 'nobody' })]);
    assert.match(repo.errors.join('\n'), /authorId "nobody" is not in the author registry/);
  });

  it('rejects an unknown category', () => {
    const repo = load([articleFile({ category: 'gossip' })]);
    assert.match(repo.errors.join('\n'), /category "gossip" is not in the category registry/);
  });

  it('rejects unknown front matter fields such as a canonical override', () => {
    const repo = load([articleFile({ canonical: 'https://elsewhere.example/post' })]);
    assert.match(repo.errors.join('\n'), /unknown front matter field "canonical"/);
  });

  it('serves neither article when two share a slug', () => {
    const repo = load([articleFile({ id: 'one' }, 'a.md'), articleFile({ id: 'two' }, 'b.md')]);
    assert.equal(repo.listPublished().length, 0);
  });

  it('reports a duplicate slug', () => {
    const repo = load([articleFile({ id: 'one' }, 'a.md'), articleFile({ id: 'two' }, 'b.md')]);
    assert.match(repo.errors.join('\n'), /slug "sample-article" duplicates a\.md/);
  });

  it('reports a duplicate id', () => {
    const repo = load([
      articleFile({ slug: 'first-slug' }, 'a.md'),
      articleFile({ slug: 'second-slug' }, 'b.md'),
    ]);
    assert.match(repo.errors.join('\n'), /id "sample-1" duplicates a\.md/);
  });

  it('rejects a published article dated in the future', () => {
    const repo = load([articleFile({ publishedAt: '2026-11-30' })]);
    assert.match(repo.errors.join('\n'), /publishedAt is in the future/);
  });

  it('rejects an impossible calendar date', () => {
    const repo = load([articleFile({ publishedAt: '2026-02-31' })]);
    assert.match(repo.errors.join('\n'), /publishedAt must be an ISO 8601 date/);
  });

  it('rejects updatedAt earlier than publishedAt', () => {
    const repo = load([articleFile({ publishedAt: '2026-10-20', updatedAt: '2026-10-01' })]);
    assert.match(repo.errors.join('\n'), /updatedAt is earlier than publishedAt/);
  });

  it('rejects a reserved slug', () => {
    const repo = load([articleFile({ slug: 'category' })]);
    assert.match(repo.errors.join('\n'), /slug "category" is reserved/);
  });

  it('rejects a level-1 heading in the body', () => {
    const repo = load([articleFile({}, 'a.md', '# Second title\n\nText.')]);
    assert.match(repo.errors.join('\n'), /Level-1 heading/);
  });

  it('rejects an image without alt text', () => {
    const repo = load([articleFile({}, 'a.md', '## Shot\n\n![](/assets/blog/x.png)')]);
    assert.match(repo.errors.join('\n'), /has no alt text/);
  });

  it('rejects an internal link to an article that does not exist', () => {
    const repo = load([articleFile({}, 'a.md', '## Next\n\nRead [this](/blog/missing-guide).')]);
    assert.match(repo.errors.join('\n'), /link \/blog\/missing-guide does not resolve/);
  });

  it('rejects an internal link to a draft', () => {
    const repo = load([
      articleFile({}, 'a.md', '## Next\n\nRead [this](/blog/draft-guide).'),
      articleFile({ id: 'draft-1', slug: 'draft-guide', status: 'draft' }, 'b.md'),
    ]);
    assert.match(repo.errors.join('\n'), /link \/blog\/draft-guide does not resolve/);
  });

  it('accepts a link to a published article and its category', () => {
    const repo = load([
      articleFile(
        {},
        'a.md',
        '## Next\n\n[Two](/blog/second-guide) and [all](/blog/category/deployment-guides).',
      ),
      articleFile({ id: 'two', slug: 'second-guide' }, 'b.md'),
    ]);
    assert.deepEqual(repo.errors, []);
  });

  it('rejects a redirect to a slug that is not published', () => {
    const repo = load([articleFile()], { redirects: { 'old-slug': 'nowhere' } });
    assert.match(repo.errors.join('\n'), /points at "nowhere"/);
  });

  it('resolves a renamed slug to the article that keeps its id', () => {
    const repo = load([articleFile()], { redirects: { 'old-slug': 'sample-article' } });
    assert.equal(repo.findRedirect('old-slug'), 'sample-article');
  });

  it('orders related articles by shared category and tags, then newest', () => {
    const repo = load([
      articleFile({}, 'a.md'),
      articleFile({ id: 'b', slug: 'b-guide', tags: ['other'], category: 'self-hosting' }, 'b.md'),
      articleFile({ id: 'c', slug: 'c-guide', publishedAt: '2026-10-01' }, 'c.md'),
      articleFile({ id: 'd', slug: 'd-guide', publishedAt: '2026-10-05' }, 'd.md'),
    ]);
    const article = repo.findPublishedBySlug('sample-article');
    assert.deepEqual(
      repo.getRelated(article).map((a) => a.id),
      ['d', 'c'],
    );
  });

  it('matches every search term against title, description, tags and body', () => {
    const repo = load([articleFile({}, 'a.md', '## Ports\n\nBind to process.env.PORT.')]);
    assert.equal(repo.search('PORT sample').length, 1);
  });

  it('returns an empty directory as zero articles', () => {
    const repo = createContentRepository({ directory: '/nonexistent/learning-hub', now: NOW });
    assert.deepEqual([repo.listPublished().length, repo.errors.length], [0, 0]);
  });
});
