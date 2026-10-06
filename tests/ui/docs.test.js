import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import ejs from 'ejs';

import { DOC_SECTIONS, PUBLIC_DOC_TOPICS } from '../../apps/web/src/config/public-pages.js';
import { getDocsIndex, getDocsTopic } from '../../apps/web/src/controllers/public.controller.js';

const viewsDir = new URL('../../apps/web/src/views/pages/docs/', import.meta.url);

function renderTopic(slug) {
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    render(view, locals) {
      this.view = view;
      this.locals = locals;
    },
  };
  getDocsTopic({ params: { topic: slug } }, res);
  return res;
}

function renderView(name, locals) {
  return ejs.renderFile(fileURLToPath(new URL(`${name}.ejs`, viewsDir)), locals);
}

describe('docs structure', () => {
  it('keeps every published topic in a section', () => {
    assert.deepEqual(
      PUBLIC_DOC_TOPICS.map(([slug]) => slug),
      [
        'getting-started',
        'supported-applications',
        'github-connection',
        'environment-variables',
        'deployment-process',
        'domains',
        'deploy-hooks',
        'rollback',
        'troubleshooting',
        'service-limits',
        'faq',
      ],
    );
  });

  it('uses the five core guides as the first-deployment path', () => {
    const res = { render: (_view, locals) => (res.locals = locals) };
    getDocsIndex({}, res);
    assert.deepEqual(
      res.locals.quickStart.map((topic) => topic.slug),
      [
        'getting-started',
        'supported-applications',
        'github-connection',
        'environment-variables',
        'deployment-process',
      ],
    );
  });
});

describe('docs topic controller', () => {
  it('links rollback back to deploy hooks', () => {
    assert.equal(renderTopic('rollback').locals.previous.slug, 'deploy-hooks');
  });

  it('has no previous topic for the first topic', () => {
    assert.equal(renderTopic('getting-started').locals.previous, null);
  });

  it('has no next topic for the last topic', () => {
    assert.equal(renderTopic('faq').locals.next, null);
  });

  it('names the section a topic belongs to', () => {
    assert.equal(renderTopic('domains').locals.topic.sectionTitle, 'Configure & deploy');
  });

  it('renders 404 for an unknown topic', () => {
    assert.equal(renderTopic('nope').statusCode, 404);
  });

  it('provides structured sections for every core guide', () => {
    for (const slug of [
      'getting-started',
      'supported-applications',
      'github-connection',
      'environment-variables',
      'deployment-process',
    ]) {
      const content = renderTopic(slug).locals.topic.content;
      assert.ok(content.lead);
      assert.ok(content.sections.length >= 3);
    }
  });

  it('keeps secondary topics on the concise points path', () => {
    const topic = renderTopic('domains').locals.topic;
    assert.equal(topic.content, null);
    assert.ok(topic.points.length > 0);
  });
});

describe('docs views', () => {
  it('marks the current topic in the docs nav', async () => {
    const html = await renderView('topic', renderTopic('rollback').locals);
    assert.match(html, /href="\/docs\/rollback" aria-current="page"/);
  });

  it('renders the FAQ as question and answer pairs', async () => {
    const html = await renderView('topic', renderTopic('faq').locals);
    assert.match(html, /<dt>Is the pilot free\?<\/dt><dd>Yes, within the published limits\.<\/dd>/);
  });

  it('renders one heading per section on the index', async () => {
    const res = { render: (_view, locals) => (res.locals = locals) };
    getDocsIndex({}, res);
    const html = await renderView('index', { ...res.locals, user: null });
    assert.equal(html.match(/class="docs-section__title"/g).length, DOC_SECTIONS.length);
  });

  it('renders the quick-start guides in order before the topic catalog', async () => {
    const res = { render: (_view, locals) => (res.locals = locals) };
    getDocsIndex({}, res);
    const html = await renderView('index', { ...res.locals, user: null });
    const quickStart = html.match(/class="docs-quick-start[\s\S]*?<\/ol>/)?.[0] ?? '';
    const slugs = [
      'getting-started',
      'supported-applications',
      'github-connection',
      'environment-variables',
      'deployment-process',
    ];
    let previousIndex = -1;
    for (const slug of slugs) {
      const index = quickStart.indexOf(`/docs/${slug}`);
      assert.ok(index > previousIndex, `${slug} should follow the previous guide`);
      previousIndex = index;
    }
    assert.ok(html.indexOf('First deployment path') < html.indexOf('All documentation'));
  });

  it('uses account creation for signed-out readers and project creation for signed-in readers', async () => {
    const res = { render: (_view, locals) => (res.locals = locals) };
    getDocsIndex({}, res);
    const signedOut = await renderView('index', { ...res.locals, user: null });
    const signedIn = await renderView('index', { ...res.locals, user: { id: 'user-1' } });
    assert.match(signedOut, /href="\/auth\/create-account"[^>]*>Create Account<\/a>/);
    assert.doesNotMatch(signedOut, /href="\/projects\/new"/);
    assert.match(signedIn, /href="\/projects\/new"[^>]*>Create Project<\/a>/);
  });

  it('renders structured sections and an ordered first-deployment procedure', async () => {
    const locals = { ...renderTopic('getting-started').locals, user: null };
    const html = await renderView('topic', locals);
    assert.match(html, /class="docs-guide__lead"/);
    assert.match(html, /<h2 id="guide-section-1">Complete your first deployment<\/h2>/);
    assert.match(html, /<ol class="docs-guide-list docs-guide-list--ordered">/);
    assert.match(html, /Check my app/);
    assert.match(html, /Submit for review/);
    assert.match(html, /Deploy Latest/);
  });

  it('uses a project action for signed-in readers of a core guide', async () => {
    const html = await renderView('topic', {
      ...renderTopic('getting-started').locals,
      user: { id: 'user-1' },
    });
    assert.match(html, /href="\/projects\/new"[^>]*>Create Project<\/a>/);
    assert.doesNotMatch(html, /href="\/auth\/create-account"/);
  });

  it('keeps the concise list renderer for a secondary guide', async () => {
    const html = await renderView('topic', { ...renderTopic('domains').locals, user: null });
    assert.match(html, /class="docs-points"/);
    assert.doesNotMatch(html, /class="docs-guide__lead"/);
  });
});
