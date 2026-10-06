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
const controller = await readFile(
  new URL('../../apps/web/src/controllers/auth.controller.js', import.meta.url),
  'utf8',
);

describe('Turnstile authentication UI', () => {
  it('renders configured, action-bound widgets on sign-in and account creation', () => {
    assert.match(signIn, /if \(turnstileSiteKey\)/);
    assert.match(signIn, /class="cf-turnstile[^"]*".*data-action="sign-in"/);
    assert.match(createAccount, /if \(turnstileSiteKey\)/);
    assert.match(createAccount, /class="cf-turnstile[^"]*".*data-action="create-account"/);
  });

  it('validates both password flows against their matching server-side actions', () => {
    assert.match(controller, /expectedAction: 'sign-in'/);
    assert.match(controller, /expectedAction: 'create-account'/);
  });
});
