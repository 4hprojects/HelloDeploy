import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['blog', 'route', 'test', 'session', 'value'].join('-');
process.env.PLATFORM_DOMAIN = 'example.test';

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { createApp } = await import('../../apps/web/src/app.js');
const { createContentRepository } =
  await import('../../apps/web/src/services/learning-hub/content-repository.js');
const { articleFile } = await import('./fixtures.js');

const BODY = [
  '## Prepare the server',
  '',
  'Install <b>Node.js</b> first.',
  '',
  '```sh',
  'node --version',
  '```',
  '',
  '## Start the app',
  '',
  'Run the start command.',
  '',
].join('\n');

const repository = createContentRepository({
  now: new Date('2026-10-29T12:00:00Z'),
  redirects: { 'old-guide': 'sample-article' },
  readDirectory: () => [
    articleFile({ featured: true }, 'a.md', BODY),
    articleFile(
      {
        id: 'second',
        slug: 'second-guide',
        title: 'A second guide with a very long title that keeps going to test wrapping',
        publishedAt: '2026-10-12',
      },
      'b.md',
    ),
    articleFile({ id: 'draft', slug: 'draft-guide', status: 'draft' }, 'c.md'),
  ],
});

async function startServer(learningHub) {
  const server = createApp({ readinessCheck: async () => ({ ready: true }), learningHub }).listen(
    0,
  );
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

describe('Learning Hub routes', () => {
  let enabled;
  let disabled;
  before(async () => {
    await startTestDb();
    enabled = await startServer({ enabled: true, getRepository: () => repository });
    disabled = await startServer({ enabled: false, getRepository: () => repository });
  });
  after(async () => {
    enabled.server.close();
    disabled.server.close();
    await stopTestDb();
  });

  const get = (path, target = enabled) => fetch(`${target.baseUrl}${path}`, { redirect: 'manual' });

  it('serves the index', async () => {
    const res = await get('/blog');
    assert.equal(res.status, 200);
  });

  it('returns 404 for every blog route while the hub is disabled', async () => {
    const statuses = await Promise.all(
      ['/blog', '/blog/sample-article', '/blog/category/deployment-guides'].map(
        async (path) => (await get(path, disabled)).status,
      ),
    );
    assert.deepEqual(statuses, [404, 404, 404]);
  });

  it('leaves the nav without a blog link while disabled', async () => {
    const html = await (await get('/', disabled)).text();
    assert.doesNotMatch(html, /href="\/blog"/);
  });

  it('adds a blog link to the public nav while enabled', async () => {
    const html = await (await get('/how-it-works')).text();
    assert.match(html, /<a href="\/blog" >Blog<\/a>/);
  });

  it('renders exactly one H1 on an article', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.equal(html.match(/<h1\b/g)?.length, 1);
  });

  it('escapes raw HTML written in article Markdown', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.match(html, /Install &lt;b&gt;Node.js&lt;\/b&gt; first/);
  });

  it('builds a table of contents from the article headings', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.match(html, /<a href="#prepare-the-server">Prepare the server<\/a>/);
  });

  it('marks an article indexable with its own canonical URL', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.match(
      html,
      /<meta name="robots" content="index,follow" \/>\s*<link rel="canonical" href="https:\/\/example.test\/blog\/sample-article" \/>/,
    );
  });

  it('declares the article Open Graph type', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.match(html, /<meta property="og:type" content="article" \/>/);
  });

  it('loads the blog stylesheet only on blog pages', async () => {
    const html = await (await get('/how-it-works')).text();
    assert.doesNotMatch(html, /learning-hub/);
  });

  it('returns 404 for a draft', async () => {
    const res = await get('/blog/draft-guide');
    assert.equal(res.status, 404);
  });

  it('returns 404 for an unknown article', async () => {
    const res = await get('/blog/no-such-guide');
    assert.equal(res.status, 404);
  });

  it('redirects a renamed slug permanently', async () => {
    const res = await get('/blog/old-guide');
    assert.deepEqual([res.status, res.headers.get('location')], [301, '/blog/sample-article']);
  });

  it('serves a category with published articles', async () => {
    const res = await get('/blog/category/deployment-guides');
    assert.equal(res.status, 200);
  });

  it('returns 404 for a category with no published articles', async () => {
    const res = await get('/blog/category/web-security');
    assert.equal(res.status, 404);
  });

  it('returns 404 for a page number past the end', async () => {
    const res = await get('/blog?page=2');
    assert.equal(res.status, 404);
  });

  it('returns 404 for a non-numeric page', async () => {
    const res = await get('/blog?page=abc');
    assert.equal(res.status, 404);
  });

  it('marks search results noindex', async () => {
    const html = await (await get('/blog?q=start')).text();
    assert.match(html, /<meta name="robots" content="noindex,follow" \/>/);
  });

  it('escapes the search query when echoing it', async () => {
    const html = await (await get('/blog?q=%3Cscript%3Ex%3C%2Fscript%3E')).text();
    assert.doesNotMatch(html, /<script>x<\/script>/);
  });

  it('shows an empty state when a search matches nothing', async () => {
    const html = await (await get('/blog?q=kubernetes')).text();
    assert.match(html, /No published article matches that search/);
  });

  it('lists the featured article separately from the latest list', async () => {
    const html = await (await get('/blog')).text();
    assert.equal(html.match(/href="\/blog\/sample-article"/g)?.length, 1);
  });

  it('never lists a draft on the index', async () => {
    const html = await (await get('/blog')).text();
    assert.doesNotMatch(html, /draft-guide/);
  });
});
