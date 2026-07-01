import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

const mainLayout = await readFile(
  new URL('../../apps/web/src/views/layouts/main.ejs', import.meta.url),
  'utf8',
);

const layoutCss = await readFile(
  new URL('../../apps/web/public/css/layout.css', import.meta.url),
  'utf8',
);

describe('mobile sidebar drawer UI', () => {
  it('renders a dedicated backdrop next to the sidebar', () => {
    assert.match(mainLayout, /id="sidebar-backdrop"/);
    assert.match(mainLayout, /class="sidebar-backdrop"/);
    assert.match(mainLayout, /hidden/);
  });

  it('initializes after DOM content is available', () => {
    assert.match(appJs, /DOMContentLoaded/);
    assert.match(appJs, /initSidebarDrawer/);
  });

  it('supports Escape close, link close, focus trap, and body scroll lock', () => {
    assert.match(appJs, /e\.key === 'Escape'/);
    assert.match(appJs, /e\.key !== 'Tab'/);
    assert.match(appJs, /closest\('a\[href\]'\)/);
    assert.match(appJs, /sidebar-drawer-open/);
    assert.match(appJs, /main\.setAttribute\('inert'/);
  });

  it('overrides the mobile hidden sidebar rule with drawer display and backdrop styles', () => {
    assert.match(layoutCss, /\.sidebar\s*{[\s\S]*display: block;/);
    assert.match(layoutCss, /\.sidebar-backdrop:not\(\[hidden\]\)/);
    assert.match(layoutCss, /\.header__menu-toggle\[aria-expanded='true'\]/);
  });
});
