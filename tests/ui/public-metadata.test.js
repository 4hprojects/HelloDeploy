import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';

import {
  livePublicPaths,
  publicFooterColumns,
  publicNavLinks,
} from '../../apps/web/src/config/public-pages.js';

const { renderFile } = ejs;

const root = fileURLToPath(new URL('../../apps/web/src/views/', import.meta.url));
const appSource = await readFile(new URL('../../apps/web/src/app.js', import.meta.url), 'utf8');
const SITE_URL = 'http://localhost:3000';

function locals(overrides = {}) {
  return {
    cspNonce: 'nonce',
    csrfToken: 'token',
    user: null,
    currentPath: '/privacy',
    uiMode: 'SIMPLE',
    turnstileSiteKey: '',
    flash: {},
    siteUrl: SITE_URL,
    publicNavLinks,
    publicFooterColumns,
    ...overrides,
  };
}

const head = (overrides) => renderFile(root + 'partials/head.ejs', locals(overrides), { root });

describe('public page metadata', () => {
  it('renders the page description passed by the route', async () => {
    const html = await head({
      title: 'Privacy Policy',
      description: 'How HelloDeploy handles data.',
    });

    assert.match(html, /<meta name="description" content="How HelloDeploy handles data." \/>/);
  });

  it('falls back to the site description when a page passes none', async () => {
    const html = await head({ title: 'Dashboard' });

    assert.match(
      html,
      /<meta name="description" content="HelloDeploy — self-hosted web application deployment" \/>/,
    );
  });

  it('renders a title without HelloDeploy repeated when no page title is given', async () => {
    const html = await head();

    assert.match(html, /<title>HelloDeploy<\/title>/);
  });

  it('builds the canonical URL from the site origin and the current path', async () => {
    const html = await head({ title: 'Privacy Policy' });

    assert.match(html, /<link rel="canonical" href="http:\/\/localhost:3000\/privacy" \/>/);
  });

  it('prefers an explicit canonical path over the current path', async () => {
    const html = await head({ title: 'Privacy Policy', canonical: '/legal' });

    assert.match(html, /<link rel="canonical" href="http:\/\/localhost:3000\/legal" \/>/);
  });

  it('omits the canonical link when no site origin is known', async () => {
    const html = await head({ title: 'Privacy Policy', siteUrl: '' });

    assert.doesNotMatch(html, /rel="canonical"/);
  });

  it('makes the Open Graph image absolute so crawlers can resolve it', async () => {
    const html = await head({ title: 'Privacy Policy' });

    assert.match(
      html,
      /<meta property="og:image" content="http:\/\/localhost:3000\/assets\/icons\/icon-512.png" \/>/,
    );
  });
});

describe('public page registry', () => {
  it('registers a route for every page it lists as live', () => {
    const unrouted = livePublicPaths.filter((path) => !appSource.includes(`app.get('${path}'`));

    assert.deepEqual(unrouted, []);
  });

  it('keeps pages without a route out of the navigation', () => {
    assert.deepEqual(
      publicNavLinks.filter((link) => !livePublicPaths.includes(link.path)),
      [],
    );
  });

  it('keeps pages without a route out of the footer', () => {
    const footerLinks = publicFooterColumns.flatMap((column) => column.links);

    assert.deepEqual(
      footerLinks.filter((link) => !livePublicPaths.includes(link.path)),
      [],
    );
  });

  it('gives every footer column at least one link', () => {
    assert.deepEqual(
      publicFooterColumns.filter((column) => column.links.length === 0),
      [],
    );
  });
});

describe('public layout', () => {
  it('renders without the authenticated app sidebar', async () => {
    const page = locals({ title: 'Privacy Policy' });
    const body = await renderFile(root + 'pages/privacy.ejs', page, { root });
    const html = await renderFile(root + 'layouts/public.ejs', { ...page, body }, { root });

    assert.doesNotMatch(html, /id="sidebar"/);
  });

  it('offers the dashboard to a signed-in visitor instead of sign-in', async () => {
    const page = locals({ title: 'Privacy Policy', user: { email: 'a@b.c' } });
    const body = await renderFile(root + 'pages/privacy.ejs', page, { root });
    const html = await renderFile(root + 'layouts/public.ejs', { ...page, body }, { root });

    assert.match(html, /href="\/dashboard" class="button button--primary button--sm">Dashboard</);
  });

  it('offers sign-in to a visitor who is not signed in', async () => {
    const page = locals({ title: 'Privacy Policy' });
    const body = await renderFile(root + 'pages/privacy.ejs', page, { root });
    const html = await renderFile(root + 'layouts/public.ejs', { ...page, body }, { root });

    assert.match(html, /href="\/auth\/sign-in"/);
  });
});
