import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { getSignIn } = await import('../../apps/web/src/controllers/auth.controller.js');

function render(query) {
  let captured = null;
  // body is always present in the app: the parsers run before this route.
  const req = { query, body: {}, session: {} };
  const res = {
    locals: {},
    redirect() {},
    render(view, options) {
      captured = { view, options };
    },
  };
  getSignIn(req, res);
  return captured;
}

describe('sign-in page context', () => {
  // requireAuth redirects deep links to /auth/sign-in?returnTo=..., and the view
  // has always had a hidden field for it — but the controller never passed it
  // through, so every deep link silently landed on /dashboard instead.
  it('carries returnTo through to the form', () => {
    const result = render({ returnTo: '/projects/my-app/deployments' });
    assert.equal(result.options.returnTo, '/projects/my-app/deployments');
  });

  it('refuses an absolute URL as a return target', () => {
    const result = render({ returnTo: 'https://evil.example/steal' });
    assert.equal(result.options.returnTo, '');
  });

  it('refuses a protocol-relative return target', () => {
    const result = render({ returnTo: '//evil.example/steal' });
    assert.equal(result.options.returnTo, '');
  });

  // requireAuth signs a suspended account out with ?reason=account_suspended,
  // which nothing rendered — so the person was ejected with no explanation.
  it('explains why a suspended account was signed out', () => {
    const result = render({ reason: 'account_suspended' });
    assert.match(result.options.notice, /no longer active/);
  });

  it('shows no notice on an ordinary visit', () => {
    const result = render({});
    assert.equal(result.options.notice, null);
  });

  it('ignores an unrecognised reason rather than echoing it', () => {
    const result = render({ reason: 'something-made-up' });
    assert.equal(result.options.notice, null);
  });
});
