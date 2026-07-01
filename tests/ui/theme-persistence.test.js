import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const head = await readFile(
  new URL('../../apps/web/src/views/partials/head.ejs', import.meta.url),
  'utf8',
);

const header = await readFile(
  new URL('../../apps/web/src/views/partials/header.ejs', import.meta.url),
  'utf8',
);

const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

const authLayout = await readFile(
  new URL('../../apps/web/src/views/layouts/auth.ejs', import.meta.url),
  'utf8',
);

const tokensCss = await readFile(
  new URL('../../apps/web/public/css/tokens.css', import.meta.url),
  'utf8',
);

describe('theme persistence UI', () => {
  it('applies the stored or system theme before stylesheets load', () => {
    assert.match(head, /localStorage\.getItem\(storageKey\)/);
    assert.match(head, /prefers-color-scheme: dark/);
    assert.match(head, /root\.setAttribute\('data-theme', safeTheme\)/);
    assert.match(head, /<link rel="stylesheet" href="\/css\/main\.css" \/>/);
    assert.ok(head.indexOf('applyTheme(theme, false)') < head.indexOf('/css/main.css'));
  });

  it('shares the same theme bootstrap on auth and main surfaces', () => {
    assert.match(authLayout, /include\('\.\.\/partials\/head'/);
    assert.doesNotMatch(authLayout, /localStorage\.getItem\('hd-theme'\)/);
    assert.doesNotMatch(authLayout, /<script>[\s\S]*prefers-color-scheme/);
  });

  it('persists explicit user selection and syncs browser theme chrome', () => {
    assert.match(head, /localStorage\.setItem\(storageKey, safeTheme\)/);
    assert.match(head, /meta\[name="theme-color"\]/);
    assert.match(head, /root\.style\.colorScheme = safeTheme/);
    assert.match(head, /hellodeploy:themechange/);
  });

  it('keeps the header toggle label and pressed state aligned with the active theme', () => {
    assert.match(header, /id="theme-toggle"/);
    assert.match(header, /aria-pressed="false"/);
    assert.match(appJs, /function syncThemeToggle/);
    assert.match(appJs, /btn\.setAttribute\('aria-pressed', String\(isDark\)\)/);
    assert.match(appJs, /btn\.setAttribute\('aria-label', label\)/);
    assert.match(appJs, /btn\.setAttribute\('data-tooltip', label\)/);
    assert.match(appJs, /__setHelloDeployTheme\(next, true\)/);
  });

  it('declares light and dark color schemes for native controls', () => {
    assert.match(tokensCss, /\[data-theme='light'\] \{\n\s{2}color-scheme: light;/);
    assert.match(tokensCss, /\[data-theme='dark'\] \{\n\s{2}color-scheme: dark;/);
  });
});
