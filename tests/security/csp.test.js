import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const appSource = await readFile(new URL('../../apps/web/src/app.js', import.meta.url), 'utf8');
const head = await readFile(
  new URL('../../apps/web/src/views/partials/head.ejs', import.meta.url),
  'utf8',
);
const mainLayout = await readFile(
  new URL('../../apps/web/src/views/layouts/main.ejs', import.meta.url),
  'utf8',
);
const authLayout = await readFile(
  new URL('../../apps/web/src/views/layouts/auth.ejs', import.meta.url),
  'utf8',
);
const repository = await readFile(
  new URL('../../apps/web/src/views/pages/projects/repository.ejs', import.meta.url),
  'utf8',
);
const members = await readFile(
  new URL('../../apps/web/src/views/pages/projects/members.ejs', import.meta.url),
  'utf8',
);

describe('Content Security Policy hardening', () => {
  it('enables Helmet CSP with a nonce for the early theme bootstrap', () => {
    assert.match(appSource, /contentSecurityPolicy: \{/);
    assert.match(
      appSource,
      /scriptSrc: \["'self'", \(_req, res\) => `\\?'nonce-\$\{res\.locals\.cspNonce\}'`\]/,
    );
    assert.match(appSource, /scriptSrcAttr: \["'none'"\]/);
    assert.match(head, /<script nonce="<%= cspNonce %>">/);
  });

  it('loads shared behavior from the static app bundle on main and auth layouts', () => {
    assert.match(mainLayout, /<script src="\/js\/app\.js" defer><\/script>/);
    assert.match(authLayout, /<script src="\/js\/app\.js" defer><\/script>/);
  });

  it('removes inline handlers and unsafe branch option HTML resets', () => {
    assert.doesNotMatch(members, /onchange=/);
    assert.match(members, /data-auto-submit/);
    assert.doesNotMatch(repository, /innerHTML/);
  });
});
