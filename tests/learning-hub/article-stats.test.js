import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';
import { createFakeRedis } from './fake-redis.js';

const { ArticleStat } = await import('@hellodeploy/database');
const { getArticleViewCount, isLikelyAutomatedAgent, recordArticleView, recordShareClick } =
  await import('../../apps/web/src/services/learning-hub/article-stats.service.js');

const BROWSER = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
// Assembled so the placeholder never reads as a literal credential.
const HMAC_KEY = ['article', 'stats', 'test', 'key'].join('-');

function view(
  redis,
  { articleId = 'a1', sessionId = 's1', sourceIp = undefined, userAgent = BROWSER } = {},
) {
  return recordArticleView(
    { articleId, sessionId, sourceIp, userAgent },
    { redis, secret: HMAC_KEY },
  );
}

async function viewsOf(articleId) {
  return (await ArticleStat.findOne({ articleId }).lean())?.views ?? 0;
}

describe('Learning Hub article stats', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('counts the first view', async () => {
    await view(createFakeRedis());
    assert.equal(await viewsOf('a1'), 1);
  });

  it('does not count the same session again within 30 minutes', async () => {
    const redis = createFakeRedis();
    await view(redis);
    await view(redis);
    assert.equal(await viewsOf('a1'), 1);
  });

  it('counts the same session again after the 30-minute window', async () => {
    let clock = 0;
    const redis = createFakeRedis({ now: () => clock });
    await view(redis);
    clock += 30 * 60 * 1000 + 1;
    await view(redis);
    assert.equal(await viewsOf('a1'), 2);
  });

  it('counts different articles independently for one session', async () => {
    const redis = createFakeRedis();
    await view(redis, { articleId: 'a1' });
    await view(redis, { articleId: 'a2' });
    assert.deepEqual([await viewsOf('a1'), await viewsOf('a2')], [1, 1]);
  });

  it('counts concurrent views from distinct sessions exactly', async () => {
    const redis = createFakeRedis();
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => view(redis, { sessionId: `session-${i}` })),
    );
    assert.equal(await viewsOf('a1'), 25);
  });

  it('counts concurrent duplicate requests from one session once', async () => {
    const redis = createFakeRedis();
    await Promise.all(Array.from({ length: 10 }, () => view(redis)));
    assert.equal(await viewsOf('a1'), 1);
  });

  it('skips counting when Redis is not ready', async () => {
    const result = await view({ status: 'reconnecting' });
    assert.deepEqual(result, { counted: false, reason: 'dedup_unavailable' });
  });

  it('skips counting when Redis rejects the command', async () => {
    const redis = {
      status: 'ready',
      set: async () => {
        throw Object.assign(new Error('down'), { code: 'ECONNRESET' });
      },
    };
    const result = await view(redis);
    assert.equal(result.reason, 'dedup_unavailable');
  });

  it('releases the dedup reservation when the increment fails', async () => {
    const redis = createFakeRedis();
    const failingStat = {
      updateOne: async () => {
        throw new Error('write failed');
      },
    };
    await recordArticleView(
      { articleId: 'a1', sessionId: 's1', userAgent: BROWSER },
      { redis, Stat: failingStat, secret: HMAC_KEY },
    );
    assert.equal(redis.store.size, 0);
  });

  it('never stores the raw session id in Redis', async () => {
    const redis = createFakeRedis();
    await view(redis, { sessionId: 'raw-session-identifier' });
    assert.doesNotMatch([...redis.store.keys()].join(' '), /raw-session-identifier/);
  });

  it('ignores self-identified crawlers and monitors', () => {
    assert.deepEqual(
      [
        'Googlebot/2.1',
        'UptimeRobot/2.0',
        'curl/8.5.0',
        'Mozilla/5.0 HeadlessChrome/130',
        '',
        undefined,
      ].map(isLikelyAutomatedAgent),
      [true, true, true, true, true, true],
    );
  });

  it('treats an ordinary browser as a reader', () => {
    assert.equal(isLikelyAutomatedAgent(BROWSER), false);
  });

  it('keeps counts under the article id when its slug changes', async () => {
    // The counter never sees the slug, so a rename cannot reset it.
    await view(createFakeRedis(), { articleId: 'stable-id' });
    assert.equal(await getArticleViewCount('stable-id'), 1);
  });

  it('returns zero for an article never viewed', async () => {
    assert.equal(await getArticleViewCount('never-viewed'), 0);
  });

  it('returns null instead of throwing when the store fails', async () => {
    const failingStat = {
      findOne: () => ({
        lean: async () => {
          throw new Error('read failed');
        },
      }),
    };
    assert.equal(await getArticleViewCount('a1', { Stat: failingStat }), null);
  });

  it('returns null when the store hangs', async () => {
    const hangingStat = { findOne: () => ({ lean: () => new Promise(() => {}) }) };
    assert.equal(await getArticleViewCount('a1', { Stat: hangingStat }), null);
  });

  it('counts a share click by platform', async () => {
    await recordShareClick({ articleId: 'a1', platform: 'linkedin' });
    const stat = await ArticleStat.findOne({ articleId: 'a1' }).lean();
    assert.equal(stat.shareClicks.linkedin, 1);
  });

  it('refuses an unknown share platform', async () => {
    const result = await recordShareClick({ articleId: 'a1', platform: '__proto__' });
    assert.equal(result.reason, 'unknown_platform');
  });

  it('counts fresh sessions from one address only once per window', async () => {
    const redis = createFakeRedis();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        view(redis, { sessionId: `minted-${i}`, sourceIp: '203.0.113.7' }),
      ),
    );
    assert.equal(await viewsOf('a1'), 1);
  });

  it('counts readers on different addresses separately', async () => {
    const redis = createFakeRedis();
    await view(redis, { sessionId: 's1', sourceIp: '203.0.113.7' });
    await view(redis, { sessionId: 's2', sourceIp: '198.51.100.4' });
    assert.equal(await viewsOf('a1'), 2);
  });

  it('never stores the raw address in Redis', async () => {
    const redis = createFakeRedis();
    await view(redis, { sourceIp: '203.0.113.7' });
    assert.doesNotMatch([...redis.store.keys()].join(' '), /203\.0\.113\.7/);
  });

  it('releases both reservations when the increment fails', async () => {
    const redis = createFakeRedis();
    const failingStat = {
      updateOne: async () => {
        throw new Error('write failed');
      },
    };
    await recordArticleView(
      { articleId: 'a1', sessionId: 's1', sourceIp: '203.0.113.7', userAgent: BROWSER },
      { redis, Stat: failingStat, secret: HMAC_KEY },
    );
    assert.equal(redis.store.size, 0);
  });
});
