import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const footer = await readFile(
  new URL('../../apps/web/src/views/partials/footer.ejs', import.meta.url),
  'utf8',
);

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

describe('confirmation modal UI', () => {
  it('uses shared modal markup for confirmable actions', () => {
    assert.match(footer, /id="confirm-modal"/);
    assert.match(footer, /role="dialog"/);
    assert.match(footer, /aria-modal="true"/);
    assert.match(footer, /data-confirm-accept/);
    assert.match(footer, /data-confirm-cancel/);
    assert.match(appJs, /acceptButton\.disabled = false/);
    assert.match(appJs, /data-confirm-title/);
    assert.match(appJs, /data-confirm-accept-label/);
    assert.match(appJs, /data-confirm-variant/);
    assert.match(appJs, /data-confirm-pending-label/);
  });

  it('does not rely on browser default confirm dialogs', () => {
    assert.doesNotMatch(appJs, /window\.confirm|confirm\(/);
  });

  it('supports form and link data-confirm targets', () => {
    assert.match(appJs, /a\[data-confirm\]/);
    assert.match(appJs, /getAttribute\('data-confirm'\)/);
    assert.match(appJs, /target\.tagName === 'FORM'/);
    assert.match(appJs, /target\.tagName === 'A'/);
  });

  it('defines modal styling and removes the old inline confirm bar pattern', () => {
    assert.match(componentsCss, /\.confirm-modal/);
    assert.match(componentsCss, /\.confirm-modal__dialog/);
    assert.match(componentsCss, /\.confirm-modal--warning/);
    assert.match(componentsCss, /\.confirm-modal--success/);
    assert.doesNotMatch(componentsCss, /\.confirm-bar/);
  });
});
