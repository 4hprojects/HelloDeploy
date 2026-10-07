import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const errorView = await readFile(
  new URL('../../apps/web/src/views/pages/error.ejs', import.meta.url),
  'utf8',
);
const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

describe('rate-limit modal UI', () => {
  it('renders rate-limit errors as an accessible modal while preserving standard error pages', () => {
    assert.match(errorView, /if \(locals\.modal\)/);
    assert.match(errorView, /role="alertdialog"/);
    assert.match(errorView, /aria-modal="true"/);
    assert.match(errorView, /aria-labelledby="page-error-modal-title"/);
    assert.match(errorView, /aria-describedby="page-error-modal-message"/);
    assert.match(errorView, /locals\.retryHref \|\| locals\.currentPath/);
    assert.match(errorView, /else/);
    assert.match(errorView, /class="page-header"/);
  });

  it('focuses the modal, traps keyboard focus, and gives Escape a safe destination', () => {
    assert.match(appJs, /function initPageModal\(\)/);
    assert.match(appJs, /requestAnimationFrame\(\(\) => dialog\.focus\(\)\)/);
    assert.match(appJs, /modal\.dataset\.pageModalDismissHref/);
    assert.match(appJs, /initPageModal\(\)/);
  });
});
