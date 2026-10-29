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
  const app = createApp({ readinessCheck: async () => ({ ready: true }), learningHub });
  const server = app.listen(0);
  return { app, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

async function stopServer({ app, server }) {
  server.close();
  await app.locals.drainSessionWrites?.();
}

describe('Learning Hub routes', () => {
  let enabled;
  let disabled;
  let disabledViews;
  before(async () => {
    await startTestDb();
    enabled = await startServer({
      enabled: true,
      viewsEnabled: true,
      getRepository: () => repository,
    });
    disabled = await startServer({ enabled: false, getRepository: () => repository });
    disabledViews = await startServer({ enabled: true, getRepository: () => repository });
  });
  after(async () => {
    await Promise.all([enabled, disabled, disabledViews].map(stopServer));
    await stopTestDb();
  });

  const get = (path, target = enabled) => fetch(`${target.baseUrl}${path}`, { redirect: 'manual' });

  // A reader's session: the cookie and CSRF token issued with an article page.
  async function readerSession(target = enabled) {
    const res = await get('/blog/sample-article', target);
    const html = await res.text();
    return {
      cookie: res.headers.get('set-cookie').split(';')[0],
      token: /<meta name="csrf-token" content="([^"]+)"/.exec(html)[1],
    };
  }

  async function post(path, body, session) {
    return fetch(`${enabled.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(session ? { cookie: session.cookie, 'x-csrf-token': session.token } : {}),
      },
      body: JSON.stringify(body),
    });
  }

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

  it('shares the encoded canonical URL on Facebook', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.match(
      html,
      /href="https:\/\/www.facebook.com\/sharer\/sharer.php\?u=https%3A%2F%2Fexample.test%2Fblog%2Fsample-article"/,
    );
  });

  it('opens every social share link without passing the opener or referrer', async () => {
    const html = await (await get('/blog/sample-article')).text();
    const links = html.match(/<a [^>]*data-share-platform="(?:facebook|linkedin|x|reddit)"/g);
    assert.deepEqual(
      links.filter((link) => !link.includes('target="_blank" rel="noopener noreferrer"')),
      [],
    );
  });

  it('places each social share link at the top and the end of the article', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.equal(
      html.match(/target="_blank" rel="noopener noreferrer" data-share-platform/g)?.length,
      8,
    );
  });

  it('shares the encoded title and URL on Reddit', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.match(
      html,
      /href="https:\/\/www.reddit.com\/submit\?url=https%3A%2F%2Fexample.test%2Fblog%2Fsample-article&amp;title=/,
    );
  });

  it('puts the article URL in the body of the email share', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.match(
      html,
      /href="mailto:\?subject=[^"]+%0A%0Ahttps%3A%2F%2Fexample.test%2Fblog%2Fsample-article"/,
    );
  });

  it('opens the email share in the mail app, not a new tab', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.doesNotMatch(html, /<a [^>]*href="mailto:[^"]*"[^>]*target="_blank"/);
  });

  it('shows the approximate view total when views are enabled', async () => {
    const html = await (await get('/blog/sample-article')).text();
    assert.match(html, /title="Approximate page views, not unique visitors">0 views</);
  });

  it('omits the view beacon while views are disabled', async () => {
    const html = await (await get('/blog/sample-article', disabledViews)).text();
    assert.doesNotMatch(html, /data-view-endpoint/);
  });

  it('rejects a view beacon without a CSRF token', async () => {
    const res = await post('/blog/api/articles/sample-1/view', {});
    assert.deepEqual([res.status, (await res.json()).error.code], [403, 'CSRF_INVALID']);
  });

  it('accepts a view beacon for a published article', async () => {
    const res = await post('/blog/api/articles/sample-1/view', {}, await readerSession());
    assert.equal(res.status, 202);
  });

  it('refuses a view beacon for a draft', async () => {
    const res = await post('/blog/api/articles/draft/view', {}, await readerSession());
    assert.equal(res.status, 404);
  });

  it('refuses a view beacon for an unknown article id', async () => {
    const res = await post('/blog/api/articles/forged-id/view', {}, await readerSession());
    assert.equal(res.status, 404);
  });

  it('records a share click for a known platform', async () => {
    const res = await post(
      '/blog/api/articles/sample-1/share',
      { platform: 'x' },
      await readerSession(),
    );
    assert.equal(res.status, 202);
  });

  it('rejects a share click for an unknown platform', async () => {
    const res = await post(
      '/blog/api/articles/sample-1/share',
      { platform: 'myspace' },
      await readerSession(),
    );
    assert.equal(res.status, 400);
  });
});
