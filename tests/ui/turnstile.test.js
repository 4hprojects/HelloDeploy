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
const googleCompleteAccount = await readFile(
  new URL('../../apps/web/src/views/pages/auth/google-complete-account.ejs', import.meta.url),
  'utf8',
);
const forgotPassword = await readFile(
  new URL('../../apps/web/src/views/pages/auth/forgot-password.ejs', import.meta.url),
  'utf8',
);
const verifyResetCode = await readFile(
  new URL('../../apps/web/src/views/pages/auth/verify-reset-code.ejs', import.meta.url),
  'utf8',
);
const authStyles = await readFile(
  new URL('../../apps/web/public/css/auth.css', import.meta.url),
  'utf8',
);
const controller = await readFile(
  new URL('../../apps/web/src/controllers/auth.controller.js', import.meta.url),
  'utf8',
);

describe('Turnstile authentication UI', () => {
  it('renders configured, action-bound widgets on public authentication forms', () => {
    assert.match(signIn, /if \(turnstileSiteKey\)/);
    assert.match(signIn, /class="cf-turnstile[^"]*".*data-action="sign-in"/);
    assert.match(createAccount, /if \(turnstileSiteKey\)/);
    assert.match(createAccount, /class="cf-turnstile[^"]*".*data-action="create-account"/);
    assert.match(
      googleCompleteAccount,
      /class="cf-turnstile[^"]*".*data-action="google-create-account"/,
    );
    assert.match(forgotPassword, /if \(turnstileSiteKey\)/);
    assert.match(forgotPassword, /class="cf-turnstile[^"]*".*data-action="forgot-password"/);
  });

  it('keeps auth verification visible, responsive, and stable above submission', () => {
    for (const template of [signIn, createAccount, googleCompleteAccount, forgotPassword]) {
      assert.match(template, /class="auth-verification"/);
      assert.match(template, /data-size="flexible"/);
      assert.match(template, /data-theme="auto"/);
      assert.match(template, /data-appearance="always"/);
      assert.ok(template.indexOf('auth-verification') < template.lastIndexOf('type="submit"'));
    }
    assert.match(authStyles, /\.auth-verification\s*{[^}]*min-height:\s*65px/s);
    assert.match(authStyles, /\.auth-verification \.cf-turnstile\s*{[^}]*width:\s*100%/s);
  });

  it('validates public password forms against their matching server-side actions', () => {
    assert.match(controller, /expectedAction: 'sign-in'/);
    assert.match(controller, /expectedAction: 'create-account'/);
    assert.match(controller, /expectedAction: 'forgot-password'/);
  });

  it('keeps reset-code guidance neutral for unknown and ineligible accounts', () => {
    assert.match(verifyResetCode, /If an eligible account exists/);
    assert.match(verifyResetCode, /inbox and spam folder/);
  });
});
