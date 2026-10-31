import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['seo', 'navigation', 'test', 'value'].join('-');
// dotenv keeps a value that is already set, so a local .env cannot turn the tag on.
process.env.GOOGLE_SITE_VERIFICATION = '';

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { createApp } = await import('../../apps/web/src/app.js');
const { LEGAL_OPERATOR, LEGAL_POLICIES } =
  await import('../../apps/web/src/config/legal-policies.js');

const PATHS = ['/', '/about', '/sitemap.xml', '/auth/sign-in', '/dashboard', '/admin'];

function structuredData(html) {
  const match = html.match(/<script type="application\/ld\+json"[^>]*>([^<]+)<\/script>/);
  return match ? JSON.parse(match[1]) : null;
}

describe('SEO and public navigation', () => {
  let app;
  let server;
  const pages = new Map();

  before(async () => {
    await startTestDb();
    app = createApp({ readinessCheck: async () => ({ ready: true }) });
    server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const responses = await Promise.all(
      PATHS.map((path) => fetch(`${baseUrl}${path}`, { redirect: 'manual' })),
    );
    const bodies = await Promise.all(responses.map((response) => response.text()));
    PATHS.forEach((path, index) =>
      pages.set(path, {
        robotsHeader: responses[index].headers.get('x-robots-tag'),
        html: bodies[index],
      }),
    );
  });

  after(async () => {
    server.close();
    await app.locals.drainSessionWrites?.();
    await stopTestDb();
  });

  it('marks sign-in, dashboard, and admin responses noindex', () => {
    assert.deepEqual(
      ['/auth/sign-in', '/dashboard', '/admin'].map((path) => pages.get(path).robotsHeader),
      ['noindex, nofollow', 'noindex, nofollow', 'noindex, nofollow'],
    );
  });

  it('leaves public pages without a noindex header', () => {
    assert.deepEqual(
      ['/', '/about'].map((path) => pages.get(path).robotsHeader),
      [null, null],
    );
  });

  it('gives each policy in the sitemap its updated date as lastmod', () => {
    const missing = LEGAL_POLICIES.filter(
      ({ slug, updated }) =>
        !pages.get('/sitemap.xml').html.includes(`/${slug}</loc><lastmod>${updated}</lastmod>`),
    );
    assert.deepEqual(missing, []);
  });

  it('describes the operator and the site as structured data on the homepage', () => {
    const graph = structuredData(pages.get('/').html)['@graph'];
    assert.deepEqual(
      graph.map((node) => [node['@type'], node.name]),
      [
        ['Organization', LEGAL_OPERATOR],
        ['WebSite', 'HelloDeploy'],
      ],
    );
  });

  it('keeps structured data off other public pages', () => {
    assert.equal(structuredData(pages.get('/about').html), null);
  });

  it('omits the Search Console tag while no token is configured', () => {
    assert.doesNotMatch(pages.get('/').html, /google-site-verification/);
  });

  it('groups the footer into platform, resources, company, and legal links', () => {
    assert.deepEqual(
      [
        ...pages
          .get('/')
          .html.split('class="footer__links"')[1]
          .matchAll(/<div><strong>([^<]+)<\/strong>/g),
      ].map((match) => match[1]),
      ['Platform', 'Resources', 'Company', 'Legal'],
    );
  });
});
