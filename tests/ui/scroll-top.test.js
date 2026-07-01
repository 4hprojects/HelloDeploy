import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const footer = await readFile(
  new URL('../../apps/web/src/views/partials/footer.ejs', import.meta.url),
  'utf8',
);

const appJs = await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8');

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

describe('scroll-to-top UI', () => {
  it('renders a shared accessible floating button', () => {
    assert.match(footer, /id="scroll-top-button"/);
    assert.match(footer, /aria-label="Scroll to top"/);
    assert.match(footer, /data-tooltip="Back to top"/);
    assert.match(footer, /hidden/);
  });

  it('shows only after scrolling and returns to the page top', () => {
    assert.match(appJs, /const threshold = 420/);
    assert.match(appJs, /button\.hidden = window\.scrollY < threshold/);
    assert.match(appJs, /window\.scrollTo/);
    assert.match(appJs, /top: 0/);
  });

  it('respects reduced-motion preferences', () => {
    assert.match(appJs, /prefers-reduced-motion: reduce/);
    assert.match(appJs, /behavior: reduceMotion\.matches \? 'auto' : 'smooth'/);
  });

  it('defines responsive fixed-position styles', () => {
    assert.match(componentsCss, /\.scroll-top-button/);
    assert.match(componentsCss, /position: fixed/);
    assert.match(componentsCss, /env\(safe-area-inset-bottom\)/);
    assert.match(componentsCss, /\.scroll-top-button:focus-visible/);
    assert.match(componentsCss, /@media \(max-width: 40rem\)/);
  });
});
