import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

// env reads process.env when config/env.js first loads, so the key has to be in
// place before the service is imported.
process.env.TURNSTILE_SECRET_KEY = 'test-secret';
process.env.TURNSTILE_SITE_KEY = 'test-site-key';

const { verifyTurnstile } = await import('../../apps/web/src/services/turnstile.service.js');

const realFetch = globalThis.fetch;

function stubFetch(impl) {
  globalThis.fetch = impl;
}

describe('turnstile verification', () => {
  before(() => {
    stubFetch(async () => ({ json: async () => ({ success: true }) }));
  });

  after(() => {
    globalThis.fetch = realFetch;
  });

  it('accepts a token Cloudflare reports as valid', async () => {
    stubFetch(async () => ({ json: async () => ({ success: true }) }));

    assert.equal(await verifyTurnstile('good-token', '127.0.0.1'), true);
  });

  it('rejects a token Cloudflare reports as invalid', async () => {
    stubFetch(async () => ({ json: async () => ({ success: false }) }));

    assert.equal(await verifyTurnstile('bad-token', '127.0.0.1'), false);
  });

  it('rejects rather than passes when the verification request fails', async () => {
    stubFetch(async () => {
      throw new Error('network down');
    });

    assert.equal(await verifyTurnstile('any-token', '127.0.0.1'), false);
  });

  it('rejects a missing token', async () => {
    stubFetch(async () => ({ json: async () => ({ success: false }) }));

    assert.equal(await verifyTurnstile(undefined, '127.0.0.1'), false);
  });

  it('sends the token and the client address to Cloudflare', async () => {
    let sent = null;
    stubFetch(async (_url, options) => {
      sent = Object.fromEntries(options.body);
      return { json: async () => ({ success: true }) };
    });

    await verifyTurnstile('token-123', '203.0.113.7');

    assert.deepEqual(sent, {
      secret: 'test-secret',
      response: 'token-123',
      remoteip: '203.0.113.7',
    });
  });

  it('posts to Cloudflare siteverify', async () => {
    let calledUrl = null;
    stubFetch(async (url) => {
      calledUrl = url;
      return { json: async () => ({ success: true }) };
    });

    await verifyTurnstile('token', '127.0.0.1');

    assert.equal(calledUrl, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  });
});
