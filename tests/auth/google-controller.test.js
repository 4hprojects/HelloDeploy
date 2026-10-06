import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { getGoogleCallback, getGoogleReauthenticate } =
  await import('../../apps/web/src/controllers/auth.controller.js');

function response() {
  return {
    redirected: null,
    redirect(location) {
      this.redirected = location;
    },
  };
}

async function invoke(handler, req, res) {
  let forwarded;
  await handler(req, res, (error) => {
    forwarded = error;
  });
  if (forwarded) {
    throw forwarded;
  }
}

describe('Google authentication controller guards', () => {
  it('rejects and consumes an expired OAuth transaction before token exchange', async () => {
    const flashes = [];
    const req = {
      session: {
        googleAuthTransaction: {
          state: 'expected',
          expiresAt: Date.now() - 1,
        },
      },
      query: { state: 'expected', code: 'must-not-be-exchanged' },
      flash: (...args) => flashes.push(args),
      ip: '127.0.0.1',
      correlationId: 'test',
    };
    const res = response();

    await invoke(getGoogleCallback, req, res);

    assert.equal(req.session.googleAuthTransaction, undefined);
    assert.equal(res.redirected, '/auth/sign-in');
    assert.match(flashes[0][1], /expired or could not be verified/);
  });

  it('treats a provider denial as cancellation only for a valid transaction', async () => {
    const flashes = [];
    const req = {
      session: {
        googleAuthTransaction: {
          state: 'expected',
          expiresAt: Date.now() + 60_000,
        },
      },
      query: { state: 'expected', error: 'access_denied' },
      flash: (...args) => flashes.push(args),
      ip: '127.0.0.1',
      correlationId: 'test',
    };
    const res = response();

    await invoke(getGoogleCallback, req, res);

    assert.equal(res.redirected, '/auth/sign-in');
    assert.match(flashes[0][1], /cancelled/);
  });

  it('does not preserve an external return target for reauthentication', () => {
    const req = {
      session: { user: { id: 'user-id' } },
      query: { returnTo: '//evil.example/path' },
    };
    const res = response();

    getGoogleReauthenticate(req, res);

    assert.equal(res.redirected, '/auth/google/start?intent=reauthenticate&returnTo=%2Fdashboard');
  });
});
