import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import ejs from 'ejs';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['seo', 'test', 'session', 'value'].join('-');
process.env.PLATFORM_DOMAIN = 'example.test';

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { createApp } = await import('../../apps/web/src/app.js');
const { createContentRepository } =
  await import('../../apps/web/src/services/learning-hub/content-repository.js');
const { articleAdSlot, learningHubAnalytics, analyticsCspSources } =
  await import('../../apps/web/src/services/learning-hub/page-integrations.js');
const { articleFile } = await import('./fixtures.js');

const repository = createContentRepository({
  now: new Date('2026-10-29T12:00:00Z'),
  readDirectory: () => [
    articleFile(
      {
        title: 'Breaking </script><script>alert(1)</script> titles safely',
        updatedAt: '2026-10-20',
      },
      'a.md',
    ),
    articleFile(
      {
        id: 'second',
        slug: 'second-guide',
        description:
          'A second fixture with its own description so meta descriptions stay unique per page.',
        category: 'self-hosting',
      },
      'b.md',
    ),
    articleFile({ id: 'draft', slug: 'draft-guide', status: 'draft' }, 'c.md'),
  ],
});

function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([^<]*)<\/script>/g)].map(
    (match) => JSON.parse(match[1]),
  );
}

describe('Learning Hub SEO', () => {
  let target;
  let plain;
  before(async () => {
    await startTestDb();
    const start = (learningHub) => {
      const app = createApp({ readinessCheck: async () => ({ ready: true }), learningHub });
      const server = app.listen(0);
      return { app, server, baseUrl: `http://127.0.0.1:${server.address().port}` };
    };
    target = start({ enabled: true, getRepository: () => repository });
    plain = start({ enabled: false, getRepository: () => repository });
  });
  after(async () => {
    for (const { app, server } of [target, plain]) {
      server.close();
      await app.locals.drainSessionWrites?.();
    }
    await stopTestDb();
  });

  const text = async (path, server = target) => (await fetch(`${server.baseUrl}${path}`)).text();

  it('emits BlogPosting data whose headline matches the visible title', async () => {
    const [posting] = jsonLd(await text('/blog/sample-article'));
    assert.equal(posting.headline, 'Breaking </script><script>alert(1)</script> titles safely');
  });

  it('cannot break out of the JSON-LD script with a crafted title', async () => {
    const html = await text('/blog/sample-article');
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  });

  it('dates the BlogPosting exactly as the page does', async () => {
    const html = await text('/blog/sample-article');
    const [posting] = jsonLd(html);
    assert.deepEqual(
      [posting.datePublished.slice(0, 10), posting.dateModified.slice(0, 10)],
      [
        /Published <time datetime="([^"]+)"/.exec(html)[1],
        /Updated <time datetime="([^"]+)"/.exec(html)[1],
      ],
    );
  });

  it('names the same author as the byline', async () => {
    const html = await text('/blog/sample-article');
    const [posting] = jsonLd(html);
    assert.match(html, new RegExp(`By ${posting.author.name}`));
  });

  it('emits a three-level breadcrumb ending at the canonical URL', async () => {
    const [, breadcrumb] = jsonLd(await text('/blog/sample-article'));
    assert.deepEqual(
      breadcrumb.itemListElement.map((item) => item.item),
      [
        'https://example.test/blog',
        'https://example.test/blog/category/deployment-guides',
        'https://example.test/blog/sample-article',
      ],
    );
  });

  it('gives each article its own meta description', async () => {
    const description = (html) => /<meta name="description" content="([^"]+)"/.exec(html)[1];
    const first = description(await text('/blog/sample-article'));
    const second = description(await text('/blog/second-guide'));
    assert.notEqual(first, second);
  });

  it('lists published articles in the sitemap with lastmod', async () => {
    const xml = await text('/sitemap.xml');
    assert.match(
      xml,
      /<url><loc>https:\/\/example.test\/blog\/sample-article<\/loc><lastmod>2026-10-20<\/lastmod><\/url>/,
    );
  });

  it('lists only categories that have published articles', async () => {
    const xml = await text('/sitemap.xml');
    assert.deepEqual(
      [/category\/deployment-guides/.test(xml), /category\/web-security/.test(xml)],
      [true, false],
    );
  });

  it('keeps drafts out of the sitemap', async () => {
    const xml = await text('/sitemap.xml');
    assert.doesNotMatch(xml, /draft-guide/);
  });

  it('keeps the existing public pages in the sitemap', async () => {
    const xml = await text('/sitemap.xml');
    assert.match(xml, /<loc>https:\/\/example.test\/how-it-works<\/loc>/);
  });

  it('leaves blog URLs out of the sitemap while the hub is disabled', async () => {
    const xml = await text('/sitemap.xml', plain);
    assert.doesNotMatch(xml, /\/blog/);
  });

  it('loads no analytics tag while GA4 is not configured', async () => {
    const html = await text('/blog/sample-article');
    assert.doesNotMatch(html, /googletagmanager|gtag\(/);
  });

  it('loads no ad script while ads are disabled', async () => {
    const html = await text('/blog/sample-article');
    assert.doesNotMatch(html, /adsbygoogle|googlesyndication/);
  });

  it('adds no analytics hosts to the CSP while GA4 is not configured', async () => {
    const res = await fetch(`${target.baseUrl}/blog/sample-article`);
    assert.doesNotMatch(res.headers.get('content-security-policy'), /google/);
  });
});

describe('Learning Hub analytics and ad gating', () => {
  it('keeps GA4 off without confirmed consent handling', () => {
    assert.equal(learningHubAnalytics({ measurementId: 'G-ABC1234', consentReady: false }), null);
  });

  it('keeps GA4 off without a measurement id', () => {
    assert.equal(learningHubAnalytics({ measurementId: '', consentReady: true }), null);
  });

  it('turns GA4 on only with both an id and confirmed consent', () => {
    assert.deepEqual(learningHubAnalytics({ measurementId: 'G-ABC1234', consentReady: true }), {
      measurementId: 'G-ABC1234',
    });
  });

  it('adds analytics CSP sources only when GA4 is on', () => {
    assert.deepEqual(analyticsCspSources(null).script, []);
  });

  const adConfig = { enabled: true, clientId: 'ca-pub-0000000000000000', slotId: '1234567' };
  const eligible = { adEligible: true };

  it('shows no ad while the owner switch is off', () => {
    const slot = articleAdSlot(
      { article: eligible, discussionVisible: false },
      { ...adConfig, enabled: false },
    );
    assert.equal(slot, null);
  });

  it('shows no ad on an article that is not ad-eligible', () => {
    const slot = articleAdSlot(
      { article: { adEligible: false }, discussionVisible: false },
      adConfig,
    );
    assert.equal(slot, null);
  });

  it('shows no ad next to guest comments', () => {
    const slot = articleAdSlot({ article: eligible, discussionVisible: true }, adConfig);
    assert.equal(slot, null);
  });

  it('renders the analytics tag with only the measurement id', async () => {
    const html = await ejs.renderFile(
      fileURLToPath(new URL('../../apps/web/src/views/partials/analytics.ejs', import.meta.url)),
      { analytics: { measurementId: 'G-ABC1234' }, cspNonce: 'nonce' },
    );
    assert.match(html, /gtag\('config', 'G-ABC1234'\);/);
  });

  it('sends GA4 events with only an article id and fixed labels', async () => {
    const source = await readFile(
      new URL('../../apps/web/public/js/learning-hub.js', import.meta.url),
      'utf8',
    );
    const payloads = [...source.matchAll(/track\([^,()]+(?:\([^)]*\))?[^,]*, (\{[^}]*\})\)/g)].map(
      (match) => match[1],
    );
    assert.deepEqual(payloads, [
      '{}',
      '{ platform }',
      "{ outcome: 'refused' }",
      "{ outcome: 'published' }",
    ]);
  });
});
