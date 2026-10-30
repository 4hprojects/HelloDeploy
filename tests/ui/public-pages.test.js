import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['public', 'pages', 'test', 'value'].join('-');

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { createApp } = await import('../../apps/web/src/app.js');
const { LEGAL_OPERATOR } = await import('../../apps/web/src/config/legal-policies.js');

const PATHS = ['/', '/about', '/features', '/pilot', '/premium', '/sitemap.xml'];

describe('Public product pages', () => {
  let app;
  let server;
  let baseUrl;
  const pages = new Map();

  before(async () => {
    await startTestDb();
    app = createApp({ readinessCheck: async () => ({ ready: true }) });
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
    const responses = await Promise.all(PATHS.map((path) => fetch(`${baseUrl}${path}`)));
    const bodies = await Promise.all(responses.map((response) => response.text()));
    PATHS.forEach((path, index) =>
      pages.set(path, { status: responses[index].status, html: bodies[index] }),
    );
  });

  after(async () => {
    server.close();
    await app.locals.drainSessionWrites?.();
    await stopTestDb();
  });

  it('serves the about and features pages', () => {
    assert.deepEqual(
      ['/about', '/features'].map((path) => pages.get(path).status),
      [200, 200],
    );
  });

  it('renders exactly one h1 on each new page', () => {
    assert.deepEqual(
      ['/about', '/features'].map((path) => pages.get(path).html.match(/<h1\b/g)?.length ?? 0),
      [1, 1],
    );
  });

  it('redirects /pricing permanently to the pilot page', async () => {
    const response = await fetch(`${baseUrl}/pricing`, { redirect: 'manual' });
    assert.deepEqual([response.status, response.headers.get('location')], [301, '/pilot']);
  });

  it('names the operator from config on the homepage', () => {
    assert.match(pages.get('/').html, new RegExp(`Operated by ${LEGAL_OPERATOR}\\.`));
  });

  it('no longer names a person as the operator on product pages', () => {
    assert.deepEqual(
      PATHS.filter((path) => /Henson Sagorsor/.test(pages.get(path).html)),
      [],
    );
  });

  it('labels every feature with a written status', () => {
    const cards = pages
      .get('/features')
      .html.match(/<h3>[^<]+<\/h3>\s*<p><span class="status-badge/g);
    assert.equal(cards?.length, 19);
  });

  it('describes Premium as not for sale', () => {
    assert.match(pages.get('/premium').html, /<h2>Not for sale<\/h2>/);
  });

  it('keeps Premium out of the sitemap', () => {
    assert.doesNotMatch(pages.get('/sitemap.xml').html, /\/premium</);
  });

  it('lists the new pages in the sitemap', () => {
    assert.match(
      pages.get('/sitemap.xml').html,
      /\/about<[\s\S]*\/features<|\/features<[\s\S]*\/about</,
    );
  });

  it('states there are no paid plans on the pilot page', () => {
    assert.match(pages.get('/pilot').html, /There are no paid plans\./);
  });
});
