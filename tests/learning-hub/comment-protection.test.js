import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';
import { createFakeRedis } from './fake-redis.js';

const { ArticleComment, ArticleCommentReport } = await import('@hellodeploy/database');
const { createCommentPipeline } =
  await import('../../apps/web/src/services/learning-hub/comment-pipeline.js');
const { createModerator } = await import('../../apps/web/src/services/learning-hub/moderation.js');
const { verifyTurnstileStrict } = await import('../../apps/web/src/services/turnstile.service.js');
const { reportComment, changeCommentStatus } =
  await import('../../apps/web/src/services/learning-hub/comment-moderation.service.js');
const { evaluateCommentAvailability, getCommentSettings, resetCommentSettingsCache } =
  await import('../../apps/web/src/services/learning-hub/comment-settings.service.js');
const { screenComment } =
  await import('../../apps/web/src/services/learning-hub/comment-heuristics.js');

const ARTICLE = { id: 'a1', slug: 'guide', commentsEnabled: true };
// Assembled so the placeholders never read as literal credentials.
const SITEVERIFY_KEY = ['turnstile', 'test', 'key'].join('-');
const HMAC_KEY = ['report', 'test', 'key'].join('-');

let keyCounter = 0;
function submissionKey() {
  keyCounter += 1;
  return `submission-key-${String(keyCounter).padStart(8, '0')}`;
}

const passTurnstile = async () => ({ valid: true, reason: 'valid' });
const safeModerator = createModerator({
  provider: 'injected',
  classify: async () => ({ decision: 'safe', categories: [] }),
});

function pipelineWith({
  verifyTurnstile = passTurnstile,
  moderator = safeModerator,
  redis = createFakeRedis(),
  Comment = ArticleComment,
} = {}) {
  return createCommentPipeline({
    verifyTurnstile,
    moderator,
    getRedis: () => redis,
    expectedHostname: 'hellodeploy.test',
    Comment,
  });
}

// ArticleComment with a create() that fails the first time, like a database blip.
function flakyComment() {
  let failures = 1;
  return new Proxy(ArticleComment, {
    get(target, property) {
      if (property === 'create') {
        return async (document) => {
          if (failures > 0) {
            failures -= 1;
            throw new Error('connection reset');
          }
          return target.create(document);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function submit(pipeline, body = {}, extra = {}) {
  return pipeline.submit({
    article: ARTICLE,
    body: {
      displayName: 'Reader',
      body: 'The steps worked on my server, thanks.',
      submissionKey: submissionKey(),
      ...body,
    },
    turnstileToken: 'token',
    sourceIp: '203.0.113.5',
    ...extra,
  });
}

const storedCount = () => ArticleComment.countDocuments({});
const publishedCount = () => ArticleComment.countDocuments({ status: 'published' });

function siteverify(result) {
  return async () => ({ json: async () => result });
}

describe('Turnstile strict verification', () => {
  const verify = (fetchImpl, overrides = {}) =>
    verifyTurnstileStrict({
      token: 'token',
      expectedAction: 'blog-comment',
      expectedHostname: 'hellodeploy.test',
      secretKey: SITEVERIFY_KEY,
      fetchImpl,
      ...overrides,
    });

  it('fails closed when no secret is configured', async () => {
    const result = await verify(siteverify({ success: true }), { secretKey: '' });
    assert.equal(result.reason, 'not_configured');
  });

  it('rejects a missing token without calling Cloudflare', async () => {
    let called = false;
    const result = await verify(
      async () => {
        called = true;
      },
      { token: '' },
    );
    assert.deepEqual([result.reason, called], ['missing_token', false]);
  });

  it('rejects a replayed or expired token', async () => {
    const result = await verify(
      siteverify({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
    );
    assert.equal(result.reason, 'expired_or_reused');
  });

  it('rejects a token issued for another action', async () => {
    const result = await verify(
      siteverify({ success: true, action: 'sign-in', hostname: 'hellodeploy.test' }),
    );
    assert.equal(result.reason, 'wrong_action');
  });

  it('rejects a token issued for another hostname', async () => {
    const result = await verify(
      siteverify({ success: true, action: 'blog-comment', hostname: 'evil.example' }),
    );
    assert.equal(result.reason, 'wrong_hostname');
  });

  it('fails closed when Cloudflare cannot be reached', async () => {
    const result = await verify(async () => {
      throw new Error('ENOTFOUND');
    });
    assert.equal(result.reason, 'unavailable');
  });

  it('accepts a token for the right action and hostname', async () => {
    const result = await verify(
      siteverify({ success: true, action: 'blog-comment', hostname: 'hellodeploy.test' }),
    );
    assert.equal(result.valid, true);
  });
});

describe('Comment pipeline', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('publishes a safe comment immediately', async () => {
    const result = await submit(pipelineWith());
    assert.equal(result.outcome, 'published');
  });

  it('records the moderation decision and policy version on a published comment', async () => {
    const { comment } = await submit(pipelineWith());
    assert.deepEqual(
      [comment.moderation.decision, comment.moderation.policyVersion],
      ['safe', 'lh-2026-10-29'],
    );
  });

  it('stores nothing when Turnstile fails', async () => {
    await submit(
      pipelineWith({ verifyTurnstile: async () => ({ valid: false, reason: 'rejected' }) }),
    );
    assert.equal(await storedCount(), 0);
  });

  it('answers 503 when Turnstile is unreachable', async () => {
    const result = await submit(
      pipelineWith({ verifyTurnstile: async () => ({ valid: false, reason: 'unavailable' }) }),
    );
    assert.equal(result.status, 503);
  });

  it('refuses to publish when Redis is not ready', async () => {
    const result = await submit(pipelineWith({ redis: { status: 'reconnecting' } }));
    assert.equal(result.outcome, 'unavailable');
  });

  it('refuses to publish when the moderation provider is unavailable', async () => {
    await submit(pipelineWith({ moderator: createModerator({ provider: 'none' }) }));
    assert.equal(await storedCount(), 0);
  });

  it('refuses to publish when the moderation provider times out', async () => {
    const slow = createModerator({
      provider: 'injected',
      timeoutMs: 20,
      classify: () => new Promise(() => {}),
    });
    const result = await submit(pipelineWith({ moderator: slow }));
    assert.equal(result.outcome, 'unavailable');
  });

  it('refuses to publish when the moderation provider throws', async () => {
    const broken = createModerator({
      provider: 'injected',
      classify: async () => {
        throw new Error('provider 500');
      },
    });
    const result = await submit(pipelineWith({ moderator: broken }));
    assert.equal(result.outcome, 'unavailable');
  });

  it('lets the writer resubmit after a moderation outage', async () => {
    const redis = createFakeRedis();
    await submit(pipelineWith({ redis, moderator: createModerator({ provider: 'none' }) }));
    const result = await submit(pipelineWith({ redis }));
    assert.equal(result.outcome, 'published');
  });

  it('rejects an unsafe comment and keeps it out of public view', async () => {
    const unsafe = createModerator({
      provider: 'injected',
      classify: async () => ({ decision: 'unsafe', categories: ['harassment'] }),
    });
    await submit(pipelineWith({ moderator: unsafe }));
    assert.equal(await publishedCount(), 0);
  });

  it('schedules a rejected submission for purging', async () => {
    const unsafe = createModerator({
      provider: 'injected',
      classify: async () => ({ decision: 'unsafe', categories: ['hate'] }),
    });
    await submit(pipelineWith({ moderator: unsafe }));
    const rejected = await ArticleComment.findOne({ status: 'rejected' }).lean();
    assert.ok(rejected.purgeAt > new Date());
  });

  it('asks for revision on an uncertain verdict and stores nothing', async () => {
    const unsure = createModerator({
      provider: 'injected',
      classify: async () => ({ decision: 'uncertain', categories: ['harassment'] }),
    });
    const result = await submit(pipelineWith({ moderator: unsure }));
    assert.deepEqual([result.outcome, await storedCount()], ['revise', 0]);
  });

  it('does not reveal which rule matched', async () => {
    const unsafe = createModerator({
      provider: 'injected',
      classify: async () => ({ decision: 'unsafe', categories: ['harassment'] }),
    });
    const result = await submit(pipelineWith({ moderator: unsafe }));
    assert.doesNotMatch(result.errors.form, /harassment/i);
  });

  it('publishes a retried submission only once', async () => {
    const pipeline = pipelineWith();
    const key = submissionKey();
    await submit(pipeline, { submissionKey: key });
    await submit(pipeline, { submissionKey: key });
    assert.equal(await storedCount(), 1);
  });

  it('returns the original comment to a retried submission', async () => {
    const pipeline = pipelineWith();
    const key = submissionKey();
    const first = await submit(pipeline, { submissionKey: key });
    const second = await submit(pipeline, { submissionKey: key });
    assert.equal(String(second.comment._id), String(first.comment._id));
  });

  it('publishes concurrent retries of one submission only once', async () => {
    const pipeline = pipelineWith();
    const key = submissionKey();
    await Promise.all(Array.from({ length: 5 }, () => submit(pipeline, { submissionKey: key })));
    assert.equal(await storedCount(), 1);
  });

  it('answers 503 instead of failing when the comment cannot be saved', async () => {
    const result = await submit(pipelineWith({ Comment: flakyComment() }));
    assert.equal(result.status, 503);
  });

  it('publishes a retry of the same text after a failed save', async () => {
    const redis = createFakeRedis();
    const pipeline = pipelineWith({ redis, Comment: flakyComment() });
    const body = 'Retrying after the database hiccup, thanks.';
    await submit(pipeline, { body });
    const result = await submit(pipeline, { body });
    assert.equal(result.outcome, 'published');
  });

  it('replays the original comment when an old submission key is reused after expiry', async () => {
    const key = submissionKey();
    await submit(pipelineWith(), { submissionKey: key });
    // A fresh Redis has forgotten the key; Mongo still holds it.
    const result = await submit(pipelineWith(), {
      submissionKey: key,
      body: 'Different text under the same old form.',
    });
    assert.deepEqual([result.outcome, await storedCount()], ['published', 1]);
  });

  it('rejects the same text posted again under a new submission', async () => {
    const pipeline = pipelineWith();
    await submit(pipeline);
    const result = await submit(pipeline, { body: 'The  steps worked on my SERVER, thanks!' });
    assert.equal(result.outcome, 'rejected');
  });

  it('refuses a reply to a comment on another article', async () => {
    const foreign = await ArticleComment.create({
      articleId: 'other',
      displayName: 'Elsewhere',
      body: 'A comment on a different article.',
      status: 'published',
    });
    const result = await submit(pipelineWith(), { replyTo: String(foreign._id) });
    assert.equal(result.errors.replyTo, 'The comment you are replying to is no longer available.');
  });

  it('lets an administrator reply without Turnstile and marks it as staff', async () => {
    const result = await submit(
      pipelineWith({ verifyTurnstile: async () => ({ valid: false, reason: 'rejected' }) }),
      {},
      { staffUser: { id: '0123456789abcdef01234567', name: 'Henson Sagorsor' } },
    );
    assert.equal(result.comment.authorType, 'staff');
  });

  for (const [label, body] of [
    ['a plain link', 'Check https://cheap-hosting.example for more.'],
    ['a bare domain', 'Visit cheaphosting.com for more help.'],
    ['a domain with "dot" spelled out', 'Visit cheaphosting (dot) com for help.'],
    ['a domain with Cyrillic lookalikes', 'Visit сhеарhosting.соm for help today.'],
    ['a domain split by zero-width spaces', 'Visit cheap​hosting.c​om today.'],
    ['an email address', 'Email me at reader@example.org for the fix.'],
    ['an obfuscated email address', 'Email me: reader (at) example (dot) org please.'],
    ['a Philippine mobile number', 'Text me at 0917 123 4567 for the config.'],
    ['an international phone number', 'Call +1 415 555 0100 if it breaks.'],
  ]) {
    it(`asks for revision of ${label}`, async () => {
      const result = await submit(pipelineWith(), { body });
      assert.equal(result.outcome, 'revise');
    });
  }

  it('rejects promotional spam outright', async () => {
    const result = await submit(pipelineWith(), {
      body: 'Buy cheap followers now, message me on telegram for promo.',
    });
    assert.equal(result.outcome, 'rejected');
  });

  it('rejects a link hidden in the display name', async () => {
    const result = await submit(pipelineWith(), { displayName: 'cheaphosting.com' });
    assert.ok(result.errors.displayName);
  });

  for (const [label, body] of [
    [
      'harsh technical criticism',
      'Honestly this guide is wrong. The PM2 config is terrible and it crashed my server twice.',
    ],
    [
      'a Filipino troubleshooting question',
      'Hindi gumana yung nginx config ko, 502 Bad Gateway pa rin. Ano po kaya mali?',
    ],
    [
      'an error log with a local address and numbers',
      'Error: connect ECONNREFUSED 127.0.0.1:5432 at 2026-10-29T01:22:33.123Z (pid 48213, port 3000)',
    ],
    ['a localhost URL', 'It works at http://localhost:3000 but not behind nginx.'],
    ['a file name that looks like a domain', 'My server.js and package.json match the guide.'],
    ['quoted HTML', 'I see <script> tags rendered literally in my EJS output.'],
  ]) {
    it(`publishes ${label}`, async () => {
      const result = await submit(pipelineWith(), { body });
      assert.equal(result.outcome, 'published');
    });
  }
});

describe('Rule-based screening', () => {
  it('passes ordinary technical text', () => {
    assert.equal(
      screenComment({ displayName: 'Dev', body: 'Run npm ci then pm2 reload all.' }).decision,
      'pass',
    );
  });
});

describe('OpenAI moderation adapter', () => {
  const adapter = (response) =>
    createModerator({
      provider: 'openai-moderation',
      apiKey: SITEVERIFY_KEY,
      fetchImpl: async () => response,
    });
  const reply = (result, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => result });

  it('is not configured without an API key', () => {
    assert.equal(
      createModerator({ provider: 'openai-moderation', apiKey: '' }).isConfigured,
      false,
    );
  });

  it('maps a flagged result to unsafe', async () => {
    const verdict = await adapter(
      reply({
        results: [{ flagged: true, categories: { harassment: true }, category_scores: {} }],
      }),
    ).moderate('text');
    assert.equal(verdict.decision, 'unsafe');
  });

  it('maps a borderline score to uncertain', async () => {
    const verdict = await adapter(
      reply({
        results: [{ flagged: false, categories: {}, category_scores: { harassment: 0.45 } }],
      }),
    ).moderate('text');
    assert.equal(verdict.decision, 'uncertain');
  });

  it('maps low scores to safe', async () => {
    const verdict = await adapter(
      reply({ results: [{ flagged: false, categories: {}, category_scores: { hate: 0.01 } }] }),
    ).moderate('text');
    assert.equal(verdict.decision, 'safe');
  });

  it('treats an HTTP error as unavailable', async () => {
    const verdict = await adapter(reply({}, false)).moderate('text');
    assert.equal(verdict.decision, 'unavailable');
  });

  it('treats a malformed response as unavailable', async () => {
    const verdict = await adapter(reply({ results: [] })).moderate('text');
    assert.equal(verdict.decision, 'unavailable');
  });
});

describe('Comment reports and administration', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  const published = () =>
    ArticleComment.create({
      articleId: 'a1',
      displayName: 'Reader',
      body: 'A perfectly fine comment.',
      status: 'published',
    });
  const report = (comment, sessionId, moderator = safeModerator) =>
    reportComment(
      { commentId: String(comment._id), articleId: 'a1', reason: 'spam', sessionId },
      { moderator, secret: HMAC_KEY },
    );
  const statusOf = async (comment) => (await ArticleComment.findById(comment._id).lean()).status;
  const admin = { id: '0123456789abcdef01234567', platformRole: 'ADMIN' };

  it('does not hide an innocent comment however many readers report it', async () => {
    const comment = await published();
    await Promise.all(Array.from({ length: 30 }, (_, i) => report(comment, `session-${i}`)));
    assert.equal(await statusOf(comment), 'published');
  });

  it('counts one report per reader', async () => {
    const comment = await published();
    await report(comment, 'same-session');
    await report(comment, 'same-session');
    assert.equal(await ArticleCommentReport.countDocuments({}), 1);
  });

  it('hides a reported comment when the re-check finds it unsafe', async () => {
    const comment = await published();
    const unsafe = createModerator({
      provider: 'injected',
      classify: async () => ({ decision: 'unsafe', categories: ['harassment'] }),
    });
    await report(comment, 's1', unsafe);
    assert.equal(await statusOf(comment), 'hidden');
  });

  it('does not accept reports for a hidden comment', async () => {
    const comment = await published();
    await ArticleComment.updateOne({ _id: comment._id }, { status: 'hidden' });
    const result = await report(comment, 's1');
    assert.equal(result.status, 404);
  });

  it('refuses an unknown report reason', async () => {
    const comment = await published();
    const result = await reportComment(
      { commentId: String(comment._id), articleId: 'a1', reason: 'boring', sessionId: 's1' },
      { moderator: safeModerator, secret: HMAC_KEY },
    );
    assert.equal(result.status, 400);
  });

  it('lets an administrator restore a hidden comment', async () => {
    const comment = await published();
    await ArticleComment.updateOne({ _id: comment._id }, { status: 'hidden' });
    await changeCommentStatus({ commentId: String(comment._id), action: 'restore', admin });
    assert.equal(await statusOf(comment), 'published');
  });

  it('lets an administrator remove a published comment', async () => {
    const comment = await published();
    await changeCommentStatus({ commentId: String(comment._id), action: 'remove', admin });
    assert.equal(await statusOf(comment), 'removed');
  });

  it('refuses to restore a rejected submission', async () => {
    const comment = await ArticleComment.create({
      articleId: 'a1',
      displayName: 'Spammer',
      body: 'Rejected promotional text.',
      status: 'rejected',
    });
    const result = await changeCommentStatus({
      commentId: String(comment._id),
      action: 'restore',
      admin,
    });
    assert.equal(result.reason, 'not_allowed');
  });
});

describe('Comment availability', () => {
  const open = {
    article: ARTICLE,
    featureEnabled: true,
    settings: { submissionsPaused: false, pausedArticleIds: [] },
    isTurnstileConfigured: true,
    isModerationConfigured: true,
  };

  it('accepts comments only when every safeguard is present', () => {
    assert.equal(evaluateCommentAvailability(open).accepting, true);
  });

  for (const [label, change] of [
    ['the feature flag is off', { featureEnabled: false }],
    ['the article has comments off', { article: { ...ARTICLE, commentsEnabled: false } }],
    ['submissions are paused', { settings: { submissionsPaused: true, pausedArticleIds: [] } }],
    [
      'this article is paused',
      { settings: { submissionsPaused: false, pausedArticleIds: ['a1'] } },
    ],
    ['Turnstile is not configured', { isTurnstileConfigured: false }],
    ['no moderation provider is configured', { isModerationConfigured: false }],
  ]) {
    it(`closes submissions when ${label}`, () => {
      assert.equal(evaluateCommentAvailability({ ...open, ...change }).accepting, false);
    });
  }

  it('keeps published comments readable while submissions are paused', () => {
    const paused = { ...open, settings: { submissionsPaused: true, pausedArticleIds: [] } };
    assert.equal(evaluateCommentAvailability(paused).visible, true);
  });

  it('treats unreadable settings as paused', async () => {
    const broken = {
      findOne: () => ({
        lean: async () => {
          throw new Error('db down');
        },
      }),
    };
    resetCommentSettingsCache();
    const settings = await getCommentSettings({ Setting: broken });
    resetCommentSettingsCache();
    assert.equal(settings.submissionsPaused, true);
  });
});
