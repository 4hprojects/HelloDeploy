import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const files = {
  header: await readFile(
    new URL('../../apps/web/src/views/partials/header.ejs', import.meta.url),
    'utf8',
  ),
  footer: await readFile(
    new URL('../../apps/web/src/views/partials/footer.ejs', import.meta.url),
    'utf8',
  ),
  icon: await readFile(
    new URL('../../apps/web/src/views/partials/icon.ejs', import.meta.url),
    'utf8',
  ),
  formErrors: await readFile(
    new URL('../../apps/web/src/views/partials/form-errors.ejs', import.meta.url),
    'utf8',
  ),
  statusBadge: await readFile(
    new URL('../../apps/web/src/views/partials/status-badge.ejs', import.meta.url),
    'utf8',
  ),
  baseCss: await readFile(new URL('../../apps/web/public/css/base.css', import.meta.url), 'utf8'),
  tokensCss: await readFile(
    new URL('../../apps/web/public/css/tokens.css', import.meta.url),
    'utf8',
  ),
  report: await readFile(
    new URL('../../docs/UI_UX_ACCESSIBILITY_PASS.md', import.meta.url),
    'utf8',
  ),
};

describe('focused accessibility pass', () => {
  it('keeps header icon buttons explicit and named', () => {
    assert.match(files.header, /<button type="button" class="header__menu-toggle"/);
    assert.match(files.header, /aria-label="Toggle navigation"/);
    assert.match(files.header, /aria-expanded="false"/);
    assert.match(files.header, /aria-controls="sidebar"/);
    assert.match(files.header, /<button type="button" class="header__theme-toggle"/);
    assert.match(files.header, /aria-pressed="false"/);
  });

  it('keeps modal, tooltip, and pending form ARIA contracts intact', () => {
    assert.match(files.footer, /role="dialog"/);
    assert.match(files.footer, /aria-modal="true"/);
    assert.match(files.footer, /aria-labelledby="confirm-modal-title"/);
    assert.match(files.footer, /aria-describedby="confirm-modal-message"/);
    assert.match(files.footer, /role', 'tooltip'/);
    assert.match(files.footer, /form\.setAttribute\('aria-busy', 'true'\)/);
  });

  it('keeps decorative icons hidden and status context announced', () => {
    assert.match(files.icon, /aria-hidden="true"/);
    assert.match(files.icon, /focusable="false"/);
    assert.match(files.formErrors, /include\('icon', \{ name: 'info' \}\)/);
    assert.match(files.statusBadge, /aria-label="<%= label %>: <%= hint %>"/);
    assert.match(files.statusBadge, /tabindex="0"/);
  });

  it('keeps focus and reduced-motion support available', () => {
    assert.match(files.baseCss, /:focus-visible/);
    assert.match(files.baseCss, /\.skip-link/);
    assert.match(files.tokensCss, /prefers-reduced-motion: reduce/);
    assert.match(files.footer, /prefers-reduced-motion: reduce/);
  });

  it('records the accessibility pass and residual risk', () => {
    assert.match(files.report, /# UI\/UX Accessibility Pass/);
    assert.match(files.report, /Header controls\s+\| Fixed/);
    assert.match(files.report, /Confirmation modal\s+\| Verified/);
    assert.match(files.report, /Residual Risk/);
  });
});
