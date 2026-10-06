import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import ejs from 'ejs';

import { PUBLIC_PAGES, publicPageMetadata } from '../../apps/web/src/config/public-pages.js';
import { getHowItWorks, getSitemap } from '../../apps/web/src/controllers/public.controller.js';

const viewPath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/how-it-works.ejs', import.meta.url),
);

function renderController() {
  const response = {
    render(view, locals) {
      this.view = view;
      this.locals = locals;
    },
  };
  getHowItWorks({}, response);
  return response;
}

describe('how-it-works public page', () => {
  it('renders through the public controller', () => {
    const response = renderController();
    assert.equal(response.view, 'pages/how-it-works');
    assert.equal(response.locals.title, 'How It Works');
  });

  it('presents the six-step journey with one page heading', async () => {
    const html = await ejs.renderFile(viewPath);
    assert.equal(html.match(/<h1\b/g)?.length, 1);
    assert.equal(html.match(/class="workflow-step"/g)?.length, 6);
    assert.match(html, /Create and verify your account/);
    assert.match(html, /Open and operate the live app/);
  });

  it('explains candidate safety, rollback, domains, and external databases', async () => {
    const html = await ejs.renderFile(viewPath);
    assert.match(html, /failed candidate does not replace the current healthy release/);
    assert.match(html, /Rollback<\/h3>/);
    assert.match(html, /custom domain/);
    assert.match(html, /does not host, administer, or back up that database/);
  });

  it('offers account, support, documentation, and limits actions', async () => {
    const html = await ejs.renderFile(viewPath);
    for (const href of [
      '/auth/create-account',
      '/supported-apps',
      '/docs/getting-started',
      '/service-limits',
    ]) {
      assert.match(html, new RegExp(`href="${href}"`));
    }
  });

  it('is indexable and included in the public page registry', () => {
    assert.ok(PUBLIC_PAGES.some((page) => page.path === '/how-it-works'));
    assert.deepEqual(publicPageMetadata('/how-it-works', 'hellodeploy.test'), {
      path: '/how-it-works',
      title: 'How It Works',
      description:
        'Follow the HelloDeploy journey from connecting a GitHub repository through approval, deployment, health checks, and a live URL.',
      canonicalUrl: 'https://hellodeploy.test/how-it-works',
      imageUrl: 'https://hellodeploy.test/assets/social/hellodeploy-og-image.png',
      robots: 'index,follow',
    });
  });

  it('is emitted in the public sitemap', () => {
    const response = {
      type(value) {
        this.contentType = value;
        return this;
      },
      send(value) {
        this.body = value;
        return this;
      },
    };
    getSitemap({}, response);
    assert.equal(response.contentType, 'application/xml');
    assert.match(response.body, /<loc>https:\/\/[^<]+\/how-it-works<\/loc>/);
  });
});
