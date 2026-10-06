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
const members = await readFile(
  new URL('../../apps/web/src/views/pages/projects/members.ejs', import.meta.url),
  'utf8',
);

describe('Google authentication UI', () => {
  it('shows optional Google actions on both entry pages', () => {
    assert.match(signIn, /googleAuthEnabled/);
    assert.match(signIn, /Continue with Google/);
    assert.match(createAccount, /googleAuthEnabled/);
    assert.match(createAccount, /Continue with Google/);
  });

  it('requires policy consent and Turnstile when completing a Google account', () => {
    assert.match(completion, /policy-consent/);
    assert.match(completion, /cf-turnstile/);
    assert.match(completion, /given-name/);
    assert.match(completion, /family-name/);
  });

  it('offers Google step-up before a Google-only owner transfers ownership', () => {
    assert.match(members, /googleOnlyOwner && !sensitiveAuthRecent/);
    assert.match(members, /Reconfirm with Google/);
  });
});
