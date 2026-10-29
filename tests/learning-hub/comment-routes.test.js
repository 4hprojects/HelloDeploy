import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['comment', 'route', 'test', 'session', 'value'].join('-');
process.env.PLATFORM_DOMAIN = 'example.test';

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { ArticleComment } = await import('@hellodeploy/database');
const { createApp } = await import('../../apps/web/src/app.js');
const { createContentRepository } =
  await import('../../apps/web/src/services/learning-hub/content-repository.js');
const { createCommentsRuntime } =
  await import('../../apps/web/src/services/learning-hub/comments-runtime.js');
const { createModerator } = await import('../../apps/web/src/services/learning-hub/moderation.js');
const { articleFile } = await import('./fixtures.js');
const { createFakeRedis } = await import('./fake-redis.js');

const repository = createContentRepository({
  now: new Date('2026-10-29T12:00:00Z'),
  readDirectory: () => [
    articleFile({ commentsEnabled: true }, 'a.md'),
    articleFile({ id: 'quiet', slug: 'quiet-guide', commentsEnabled: false }, 'b.md'),
  ],
});
const settings = { submissionsPaused: false, pausedArticleIds: [], readable: true };

function runtime(overrides = {}) {
  return createCommentsRuntime({
    featureEnabled: true,
    turnstileSiteKey: 'site-key',
    turnstileSecretKey: ['secret', 'placeholder'].join('-'),
    verifyTurnstile: async () => ({ valid: true, reason: 'valid' }),
    moderator: createModerator({
      provider: 'injected',
      classify: async () => ({ decision: 'safe', categories: [] }),
    }),
    getRedis: () => redis,
    getSettings: async () => settings,
    expectedHostname: 'example.test',
    ...overrides,
  });
}
const redis = createFakeRedis();

async function startServer(comments) {
  const app = createApp({
    readinessCheck: async () => ({ ready: true }),
    learningHub: { enabled: true, getRepository: () => repository, comments },
  });
  const server = app.listen(0);
  return { app, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

describe('Learning Hub comment routes', () => {
  let open;
  let unprotected;
  let disabled;
  before(async () => {
    await startTestDb();
    open = await startServer(runtime());
    unprotected = await startServer(runtime({ moderator: createModerator({ provider: 'none' }) }));
    disabled = await startServer(runtime({ featureEnabled: false }));
  });
  after(async () => {
    for (const target of [open, unprotected, disabled]) {
      target.server.close();
      await target.app.locals.drainSessionWrites?.();
    }
    await stopTestDb();
  });

  async function session(target) {
    const res = await fetch(`${target.baseUrl}/blog/sample-article`);
    const html = await res.text();
    return {
      cookie: res.headers.get('set-cookie').split(';')[0],
      csrf: /<meta name="csrf-token" content="([^"]+)"/.exec(html)[1],
      key: /name="submissionKey" value="([^"]+)"/.exec(html)?.[1] ?? 'missing-key-000000',
    };
  }

  async function postComment(target, fields, { withCsrf = true } = {}) {
    const reader = await session(target);
    const body = new URLSearchParams({
      _csrf: withCsrf ? reader.csrf : '',
      submissionKey: reader.key,
      displayName: 'Reader',
      body: 'This guide fixed my deployment.',
      'cf-turnstile-response': 'token',
      ...fields,
    });
    return fetch(`${target.baseUrl}/blog/sample-article/comments`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: reader.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
  }

  const page = async (target, path = '/blog/sample-article') =>
    (await fetch(`${target.baseUrl}${path}`)).text();

  it('refuses submissions when no moderation provider is configured', async () => {
    const res = await postComment(unprotected, {});
    assert.equal(res.status, 503);
  });

  it('stores nothing when submissions are refused', async () => {
    await postComment(unprotected, { body: 'Another attempt while protections are missing.' });
    assert.equal(await ArticleComment.countDocuments({ body: /Another attempt/ }), 0);
  });

  it('tells readers that new comments are closed when protections are missing', async () => {
    const html = await page(unprotected);
    assert.match(html, /New comments are closed on this article right now/);
  });

  it('hides the discussion entirely while the feature flag is off', async () => {
    const html = await page(disabled);
    assert.doesNotMatch(html, /id="comments"/);
  });

  it('refuses submissions while the feature flag is off', async () => {
    const res = await postComment(disabled, {});
    assert.equal(res.status, 503);
  });

  it('refuses submissions on an article with comments off', async () => {
    const reader = await session(open);
    const res = await fetch(`${open.baseUrl}/blog/quiet-guide/comments`, {
      method: 'POST',
      headers: {
        cookie: reader.cookie,
        accept: 'application/json',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ _csrf: reader.csrf }),
    });
    assert.equal(res.status, 503);
  });

  it('refuses a submission without a CSRF token', async () => {
    const res = await postComment(open, {}, { withCsrf: false });
    assert.equal(res.status, 403);
  });

  it('publishes a safe comment and links to it', async () => {
    const res = await postComment(open, {});
    assert.match(res.headers.get('location'), /^\/blog\/sample-article#comment-[a-f0-9]{24}$/);
  });

  it('publishes a reply under its thread', async () => {
    const root = await ArticleComment.findOne({ body: 'This guide fixed my deployment.' });
    const res = await postComment(open, {
      replyTo: String(root._id),
      body: 'Same here, thanks for sharing.',
    });
    assert.equal(res.status, 303);
  });

  it('keeps the writer text when asking for a revision', async () => {
    const res = await postComment(open, { body: 'See https://spam.example for answers.' });
    assert.match(await res.text(), /See https:\/\/spam.example for answers.<\/textarea>/);
  });

  it('rate-limits a fourth submission within ten minutes', async () => {
    const res = await postComment(open, { body: 'One more comment from the same address.' });
    assert.equal(res.status, 429);
  });

  it('renders comment text escaped, never as HTML', async () => {
    await ArticleComment.create({
      articleId: 'sample-1',
      displayName: '<b>Mallory</b>',
      body: '<img src=x onerror=alert(1)> in my logs',
      status: 'published',
    });
    const html = await page(open);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt; in my logs/);
  });

  it('shows a reply to a reply at the same level with its reply context', async () => {
    const root = await ArticleComment.create({
      articleId: 'sample-1',
      displayName: 'Root author',
      body: 'Root comment for nesting.',
      status: 'published',
    });
    const child = await ArticleComment.create({
      articleId: 'sample-1',
      parentId: root._id,
      replyToCommentId: root._id,
      displayName: 'Ana',
      body: 'First reply in the thread.',
      status: 'published',
    });
    await ArticleComment.create({
      articleId: 'sample-1',
      parentId: root._id,
      replyToCommentId: child._id,
      replyToDisplayName: 'Ana',
      displayName: 'Ben',
      body: 'Reply to the first reply.',
      status: 'published',
    });
    const html = await page(open);
    assert.match(html, /Replying to @Ana/);
  });

  it('never opens a deeper reply list for a reply to a reply', async () => {
    const html = await page(open);
    const between = html.slice(
      html.indexOf('First reply in the thread.'),
      html.indexOf('Reply to the first reply.'),
    );
    assert.doesNotMatch(between, /<ol/);
  });

  it('keeps published comments visible while submissions are paused', async () => {
    settings.submissionsPaused = true;
    const html = await page(open);
    settings.submissionsPaused = false;
    assert.match(html, /Root comment for nesting/);
  });

  it('refuses submissions while paused', async () => {
    settings.pausedArticleIds = ['sample-1'];
    const res = await postComment(open, {});
    settings.pausedArticleIds = [];
    assert.equal(res.status, 503);
  });

  it('accepts a report on a published comment', async () => {
    const target = await ArticleComment.findOne({ displayName: 'Root author' });
    const reader = await session(open);
    const res = await fetch(`${open.baseUrl}/blog/sample-article/comments/${target._id}/report`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: reader.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        _csrf: reader.csrf,
        reason: 'spam',
        'cf-turnstile-response': 'token',
      }),
    });
    assert.equal(res.status, 303);
  });

  it('keeps the article page indexable while comment pages are noindex', async () => {
    const html = await page(open, '/blog/sample-article?commentsPage=2');
    assert.match(html, /<meta name="robots" content="noindex,follow" \/>/);
  });

  it('sends anonymous visitors of the moderation page to sign in', async () => {
    const res = await fetch(`${open.baseUrl}/admin/learning-hub`, { redirect: 'manual' });
    assert.match(res.headers.get('location'), /^\/auth\/sign-in/);
  });

  it('refuses anonymous moderation actions', async () => {
    const target = await ArticleComment.findOne({ displayName: 'Root author' });
    const reader = await session(open);
    await fetch(`${open.baseUrl}/admin/learning-hub/comments/${target._id}/remove`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: reader.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: reader.csrf }),
    });
    assert.equal((await ArticleComment.findById(target._id)).status, 'published');
  });
});
