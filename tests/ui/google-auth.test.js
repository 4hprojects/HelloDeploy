import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const signIn = await readFile(
  new URL('../../apps/web/src/views/pages/auth/sign-in.ejs', import.meta.url),
  'utf8',
);
const createAccount = await readFile(
  new URL('../../apps/web/src/views/pages/auth/create-account.ejs', import.meta.url),
  'utf8',
);
const completion = await readFile(
  new URL('../../apps/web/src/views/pages/auth/google-complete-account.ejs', import.meta.url),
  'utf8',
);
const googleButton = await readFile(
  new URL('../../apps/web/src/views/partials/google-auth-button.ejs', import.meta.url),
  'utf8',
);
const authCss = await readFile(
  new URL('../../apps/web/public/css/auth.css', import.meta.url),
  'utf8',
);
const members = await readFile(
  new URL('../../apps/web/src/views/pages/projects/members.ejs', import.meta.url),
  'utf8',
);

describe('Google authentication UI', () => {
  it('shows optional Google actions on both entry pages', () => {
    assert.match(signIn, /googleAuthEnabled/);
    assert.match(signIn, /include\('\.\.\/\.\.\/partials\/google-auth-button'/);
    assert.match(signIn, /intent=sign-in/);
    assert.match(signIn, /Continue with Google/);
    assert.match(createAccount, /googleAuthEnabled/);
    assert.match(createAccount, /include\('\.\.\/\.\.\/partials\/google-auth-button'/);
    assert.match(createAccount, /intent=create-account/);
    assert.match(createAccount, /Continue with Google/);
  });

  it('uses an accessible, provider-branded shared button', () => {
    assert.match(googleButton, /class="google-auth-button/);
    assert.match(googleButton, /aria-hidden="true"/);
    assert.match(googleButton, /focusable="false"/);
    assert.match(googleButton, /fill="#EA4335"/);
    assert.match(googleButton, /fill="#4285F4"/);
    assert.match(googleButton, /<span><%= _googleButtonLabel %><\/span>/);
    assert.match(authCss, /\.google-auth-button--full/);
    assert.match(authCss, /background: #fff/);
    assert.match(authCss, /\[data-theme='dark'\] \.google-auth-button/);
    assert.match(authCss, /background: #131314/);
  });

  it('requires policy consent and Turnstile when completing a Google account', () => {
    assert.match(completion, /policy-consent/);
    assert.match(completion, /cf-turnstile/);
    assert.match(completion, /given-name/);
    assert.match(completion, /family-name/);
  });

  it('offers Google step-up before a Google-only owner transfers ownership', () => {
    assert.match(members, /googleOnlyOwner && !sensitiveAuthRecent/);
    assert.match(members, /include\('\.\.\/\.\.\/partials\/google-auth-button'/);
    assert.match(members, /auth\/google\/reauthenticate\?returnTo=/);
    assert.match(members, /Reconfirm with Google/);
  });
});
