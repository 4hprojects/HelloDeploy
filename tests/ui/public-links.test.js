import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['public', 'links', 'test', 'value'].join('-');

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { createApp } = await import('../../apps/web/src/app.js');

/**
 * Every page in the sitemap is rendered and every internal link on it is
 * requested, so a renamed route or a typo in copy fails CI instead of
 * reaching visitors as a 404.
 */
describe('public internal links', () => {
  let app;
  let server;
  let baseUrl;
  let broken;

  before(async () => {
    await startTestDb();
    app = createApp({ readinessCheck: async () => ({ ready: true }) });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const sitemap = await (await fetch(`${baseUrl}/sitemap.xml`)).text();
    const pages = [...sitemap.matchAll(/<loc>https?:\/\/[^/<]+([^<]*)<\/loc>/g)].map(
      (match) => match[1] || '/',
    );
    const links = new Map();
    for (const page of pages) {
      const html = await (await fetch(`${baseUrl}${page}`)).text();
      for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="(\/(?!\/)[^"#?]*)/g)) {
        if (!links.has(href)) {
          links.set(href, page);
        }
      }
    }

    const results = await Promise.all(
      [...links].map(async ([href, page]) => {
        const response = await fetch(`${baseUrl}${href}`, { redirect: 'manual' });
        return { href, page, status: response.status };
      }),
    );
    broken = results.filter(({ status }) => status >= 400);
  });

  after(async () => {
    server.close();
    await app.locals.drainSessionWrites?.();
    await stopTestDb();
  });

  it('resolve without a 4xx or 5xx response', () => {
    assert.deepEqual(broken, []);
  });
});
