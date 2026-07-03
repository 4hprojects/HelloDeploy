import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { describe, it } from 'node:test';

async function readFilesByExtension(directoryUrl, extension) {
  const entries = await readdir(directoryUrl, { withFileTypes: true });
  const contents = [];

  await Promise.all(
    entries.map(async (entry) => {
      const childUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl);

      if (entry.isDirectory()) {
        contents.push(...(await readFilesByExtension(childUrl, extension)));
        return;
      }

      if (entry.name.endsWith(extension)) {
        contents.push(await readFile(childUrl, 'utf8'));
      }
    }),
  );

  return contents;
}

const appSource = await readFile(new URL('../../apps/web/src/app.js', import.meta.url), 'utf8');
const viewSources = (
  await readFilesByExtension(new URL('../../apps/web/src/views/', import.meta.url), '.ejs')
).join('\n');
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
      /scriptSrc: \["'self'", \(_req, res\) => `\\?'nonce-\$\{res\.locals\.cspNonce\}'`, 'https:\/\/challenges\.cloudflare\.com'\]/,
    );
    assert.match(appSource, /scriptSrcAttr: \["'none'"\]/);
    assert.match(appSource, /styleSrc: \["'self'"\]/);
    assert.match(appSource, /styleSrcAttr: \["'none'"\]/);
    assert.doesNotMatch(appSource, /'unsafe-inline'/);
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

  it('keeps rendered app views free of inline style attributes', () => {
    assert.doesNotMatch(viewSources, /\sstyle=/);
  });
});
