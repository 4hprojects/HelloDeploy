import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// Assembled so the placeholder never reads as a literal credential.
process.env.SESSION_SECRET = ['legal', 'pages', 'test', 'value'].join('-');

const { startTestDb, stopTestDb } = await import('../helpers/worker-db.js');
const { createApp } = await import('../../apps/web/src/app.js');
const { LEGAL_CONTACT_EMAIL, LEGAL_POLICIES } =
  await import('../../apps/web/src/config/legal-policies.js');

const PATHS = ['/legal', ...LEGAL_POLICIES.map((policy) => `/${policy.slug}`)];

function tocTargets(html) {
  const toc = /<nav class="legal-toc"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
  return [...toc.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
}

function ids(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

describe('Legal pages', () => {
  let app;
  let server;
  const pages = new Map();

  before(async () => {
    await startTestDb();
    app = createApp({ readinessCheck: async () => ({ ready: true }) });
    server = app.listen(0);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
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

  it('serves every policy page', () => {
    assert.deepEqual(
      PATHS.map((path) => pages.get(path).status),
      PATHS.map(() => 200),
    );
  });

  it('never publishes a personal Gmail address', () => {
    assert.deepEqual(
      PATHS.filter((path) => /gmail/i.test(pages.get(path).html)),
      [],
    );
  });

  it('gives every page a mailto link to the project contact address', () => {
    assert.deepEqual(
      PATHS.filter(
        (path) => !pages.get(path).html.includes(`href="mailto:${LEGAL_CONTACT_EMAIL}"`),
      ),
      [],
    );
  });

  it('renders exactly one h1 per page', () => {
    assert.deepEqual(
      PATHS.map((path) => pages.get(path).html.match(/<h1\b/g)?.length ?? 0),
      PATHS.map(() => 1),
    );
  });

  it('points every table-of-contents link at a heading on the same page', () => {
    const broken = LEGAL_POLICIES.flatMap(({ slug }) => {
      const { html } = pages.get(`/${slug}`);
      const present = ids(html);
      return tocTargets(html)
        .filter((id) => !present.has(id))
        .map((id) => `/${slug}#${id}`);
    });
    assert.deepEqual(broken, []);
  });

  it('gives every policy page a table of contents', () => {
    assert.deepEqual(
      LEGAL_POLICIES.filter(({ slug }) => tocTargets(pages.get(`/${slug}`).html).length === 0),
      [],
    );
  });

  it('marks the current policy in the related-policy navigation', () => {
    assert.match(
      pages.get('/cookies').html,
      /<a href="\/cookies" aria-current="page">Cookie Policy<\/a>/,
    );
  });

  it('names 4H Projects as the operator in the privacy policy', () => {
    assert.match(pages.get('/privacy').html, /run by <strong>4H Projects<\/strong>/);
  });

  it('tells readers they can complain to the National Privacy Commission', () => {
    assert.match(pages.get('/privacy').html, /href="https:\/\/privacy\.gov\.ph"/);
  });

  it('no longer names a person as the operator in the terms', () => {
    assert.match(pages.get('/terms').html, /operated by <strong>4H Projects<\/strong>/);
  });

  it('loads the policy stylesheet on policy pages', () => {
    assert.match(pages.get('/privacy').html, /href="[^"]*legal[^"]*\.css"/);
  });

  it('gives every narrow-screen table cell a column label', () => {
    const unlabeled = PATHS.filter((path) =>
      /<td(?![^>]*data-label)[^>]*>/.test(pages.get(path).html),
    );
    assert.deepEqual(unlabeled, []);
  });

  it('gives users an appeal route in the acceptable use policy', () => {
    assert.match(pages.get('/acceptable-use').html, /<h3 id="appeals">Appeals<\/h3>/);
  });

  it('restricts sexually explicit services in the acceptable use policy', () => {
    assert.match(
      pages.get('/acceptable-use').html,
      /<strong>Sexually explicit services\.<\/strong>/,
    );
  });

  it('no longer says resource suspensions happen without notice', () => {
    assert.doesNotMatch(pages.get('/acceptable-use').html, /suspended without notice/);
  });

  it('licenses HelloDeploy to host and run what users deploy', () => {
    assert.match(
      pages.get('/terms').html,
      /store, build, host, run, restart, roll back, and serve/,
    );
  });

  it('names OpenAI as a recipient of blog comment text', () => {
    assert.match(
      pages.get('/privacy').html,
      /<td data-label="Provider">OpenAI<\/td>.*The display name and text of each submitted comment/,
    );
  });
});
