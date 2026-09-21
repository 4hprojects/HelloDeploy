import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import ejs from 'ejs';

const VIEW = new URL('../../apps/web/src/views/pages/auth/create-account.ejs', import.meta.url);

function renderPage(locals = {}) {
  return ejs.renderFile(VIEW.pathname, {
    turnstileSiteKey: 'test-site-key',
    csrfToken: 'test-csrf',
    ...locals,
  });
}

describe('create-account form', () => {
  it('posts the identity fields the controller validates', async () => {
    const html = await renderPage();

    assert.match(
      html,
      /^(?=[\s\S]*name="firstName")(?=[\s\S]*name="lastName")(?=[\s\S]*name="email")/,
    );
  });

  it('posts both password fields and the consent checkbox', async () => {
    const html = await renderPage();

    assert.match(
      html,
      /^(?=[\s\S]*name="password")(?=[\s\S]*name="confirmPassword")(?=[\s\S]*name="acceptTerms")/,
    );
  });

  it('groups the fields into two labelled sections', async () => {
    const html = await renderPage();

    assert.equal(html.match(/<legend class="auth-section__title">/g).length, 2);
  });

  it('keeps every policy link in the consent block', async () => {
    const html = await renderPage();

    assert.match(
      html,
      /^(?=[\s\S]*href="\/terms")(?=[\s\S]*href="\/privacy")(?=[\s\S]*href="\/cookies")(?=[\s\S]*href="\/acceptable-use")(?=[\s\S]*href="\/legal")/,
    );
  });

  it('refills submitted values after a validation error', async () => {
    const html = await renderPage({
      values: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' },
      errors: { acceptTerms: 'You must accept the policies.' },
    });

    assert.match(html, /name="email"\s+value="ada@example\.com"/);
  });

  it('links the consent error to the checkbox', async () => {
    const html = await renderPage({ errors: { acceptTerms: 'You must accept the policies.' } });

    assert.match(html, /aria-describedby="acceptTerms-policies acceptTerms-error"/);
  });
});
