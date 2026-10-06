import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { verifyTurnstile } = await import('../../apps/web/src/services/turnstile.service.js');

describe('Turnstile verification', () => {
  it('is disabled only when no secret key is configured', async () => {
    let called = false;
    const valid = await verifyTurnstile({
      token: '',
      expectedAction: 'sign-in',
      secretKey: '',
      fetchImpl: async () => {
        called = true;
      },
    });

    assert.equal(valid, true);
    assert.equal(called, false);
  });

  it('rejects missing and oversized tokens before making a request', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
    };

    assert.equal(
      await verifyTurnstile({
        token: undefined,
        expectedAction: 'sign-in',
        secretKey: 'secret',
        fetchImpl,
      }),
      false,
    );
    assert.equal(
      await verifyTurnstile({
        token: 'x'.repeat(2049),
        expectedAction: 'sign-in',
        secretKey: 'secret',
        fetchImpl,
      }),
      false,
    );
    assert.equal(calls, 0);
  });

  it('submits the token and source IP and accepts the expected action', async () => {
    let request;
    const valid = await verifyTurnstile({
      token: 'browser-token',
      sourceIp: '203.0.113.10',
      expectedAction: 'sign-in',
      secretKey: 'server-secret',
      fetchImpl: async (url, options) => {
        request = { url, options };
        return { json: async () => ({ success: true, action: 'sign-in' }) };
      },
    });

    assert.equal(valid, true);
    assert.equal(request.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.body.get('secret'), 'server-secret');
    assert.equal(request.options.body.get('response'), 'browser-token');
    assert.equal(request.options.body.get('remoteip'), '203.0.113.10');
    assert.ok(request.options.signal instanceof AbortSignal);
  });

  it('fails closed for an action mismatch or verification request error', async () => {
    assert.equal(
      await verifyTurnstile({
        token: 'browser-token',
        expectedAction: 'create-account',
        secretKey: 'server-secret',
        fetchImpl: async () => ({ json: async () => ({ success: true, action: 'sign-in' }) }),
      }),
      false,
    );
    assert.equal(
      await verifyTurnstile({
        token: 'browser-token',
        expectedAction: 'sign-in',
        secretKey: 'server-secret',
        fetchImpl: async () => {
          throw new Error('network unavailable');
        },
      }),
      false,
    );
  });
});
