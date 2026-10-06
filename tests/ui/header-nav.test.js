import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import ejs from 'ejs';

const headerPath = fileURLToPath(
  new URL('../../apps/web/src/views/partials/header.ejs', import.meta.url),
);

const authLayout = await readFile(
  new URL('../../apps/web/src/views/layouts/auth.ejs', import.meta.url),
  'utf8',
);

function renderHeader(locals) {
  return ejs.renderFile(headerPath, { user: null, currentPath: '/', ...locals });
}

describe('shared header navigation', () => {
  it('renders the shared header on auth pages', () => {
    assert.match(authLayout, /include\('\.\.\/partials\/header', \{ hasSidebar: false \}\)/);
  });

  it('marks the current public page in the nav', async () => {
    const html = await renderHeader({ currentPath: '/docs/getting-started' });
    assert.match(html, /<a href="\/docs" aria-current="page">Docs<\/a>/);
  });

  it('links directly to the how-it-works page and marks it as current', async () => {
    const html = await renderHeader({ currentPath: '/how-it-works' });
    assert.match(html, /<a href="\/how-it-works" aria-current="page">How It Works<\/a>/);
  });

  it('marks sign-in as current on the sign-in page', async () => {
    const html = await renderHeader({ currentPath: '/auth/sign-in' });
    assert.match(html, /<a href="\/auth\/sign-in" aria-current="page">Sign In<\/a>/);
  });

  it('gives signed-out visitors a menu toggle for the collapsible links', async () => {
    const html = await renderHeader({});
    assert.match(html, /id="public-nav-toggle"[^>]*aria-controls="public-nav"/);
  });

  it('omits the sidebar toggle for a signed-in user on a page without a sidebar', async () => {
    const html = await renderHeader({ user: { id: 'u1' }, hasSidebar: false });
    assert.doesNotMatch(html, /id="sidebar-toggle"/);
  });

  it('keeps the sidebar toggle for a signed-in user in the app shell', async () => {
    const html = await renderHeader({ user: { id: 'u1' } });
    assert.match(html, /id="sidebar-toggle"/);
  });
});

describe('sidebar navigation', () => {
  it('marks the current section with an unescaped aria-current attribute', async () => {
    const sidebarPath = fileURLToPath(
      new URL('../../apps/web/src/views/partials/sidebar.ejs', import.meta.url),
    );
    const html = await ejs.renderFile(sidebarPath, {
      user: { platformRole: 'USER' },
      currentPath: '/projects',
      csrfToken: '',
    });
    assert.match(html, /href="\/projects"\s+class="sidebar__link"\s+aria-current="page"/);
  });
});
