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

describe('confirmation modal UI', () => {
  it('uses shared modal markup for confirmable actions', () => {
    assert.match(footer, /id="confirm-modal"/);
    assert.match(footer, /role="dialog"/);
    assert.match(footer, /aria-modal="true"/);
    assert.match(footer, /data-confirm-accept/);
    assert.match(footer, /data-confirm-cancel/);
    assert.match(footer, /acceptButton\.disabled = false/);
  });

  it('does not rely on browser default confirm dialogs', () => {
    assert.doesNotMatch(footer, /window\.confirm|confirm\(/);
  });

  it('supports form and link data-confirm targets', () => {
    assert.match(footer, /a\[data-confirm\]/);
    assert.match(footer, /getAttribute\('data-confirm'\)/);
    assert.match(footer, /target\.tagName === 'FORM'/);
    assert.match(footer, /target\.tagName === 'A'/);
  });

  it('defines modal styling and removes the old inline confirm bar pattern', () => {
    assert.match(componentsCss, /\.confirm-modal/);
    assert.match(componentsCss, /\.confirm-modal__dialog/);
    assert.doesNotMatch(componentsCss, /\.confirm-bar/);
  });
});
