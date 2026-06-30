import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHmac } from 'node:crypto';

// Set required env before importing the service
process.env.GITHUB_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';

const { verifyWebhookSignature } = await import('../../apps/web/src/services/github.service.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSignature(body, secret = 'test-webhook-secret') {
  const hmac = createHmac('sha256', secret);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

// ─── verifyWebhookSignature ────────────────────────────────────────────────────

describe('verifyWebhookSignature', () => {
  it('returns true for a valid signature over a Buffer body', () => {
    const body = Buffer.from('{"action":"push"}');
    const sig = makeSignature(body);
    assert.equal(verifyWebhookSignature(body, sig), true);
  });

  it('returns true for a valid signature over a string body', () => {
    const body = '{"ref":"refs/heads/main"}';
    const sig = makeSignature(body);
    assert.equal(verifyWebhookSignature(Buffer.from(body), sig), true);
  });

  it('returns false when the signature is wrong', () => {
    const body = Buffer.from('{"action":"push"}');
    const badSig = makeSignature(body, 'wrong-secret');
    assert.equal(verifyWebhookSignature(body, badSig), false);
  });

  it('returns false when the signature header is missing (undefined)', () => {
    const body = Buffer.from('{"action":"push"}');
    assert.equal(verifyWebhookSignature(body, undefined), false);
  });

  it('returns false when the signature header is null', () => {
    const body = Buffer.from('{"action":"push"}');
    assert.equal(verifyWebhookSignature(body, null), false);
  });

  it('returns false when the signature header is an empty string', () => {
    const body = Buffer.from('{"action":"push"}');
    assert.equal(verifyWebhookSignature(body, ''), false);
  });

  it('returns false when the body has been tampered with', () => {
    const original = Buffer.from('{"action":"push"}');
    const tampered = Buffer.from('{"action":"push","extra":true}');
    const sig = makeSignature(original);
    assert.equal(verifyWebhookSignature(tampered, sig), false);
  });

  it('returns false when the signature lacks the sha256= prefix', () => {
    const body = Buffer.from('{"action":"push"}');
    const rawHex = createHmac('sha256', 'test-webhook-secret').update(body).digest('hex');
    assert.equal(verifyWebhookSignature(body, rawHex), false);
  });

  it('uses timing-safe comparison (does not throw on length mismatch)', () => {
    const body = Buffer.from('hello');
    // A signature that is a different length from the expected sha256= hex
    assert.doesNotThrow(() => verifyWebhookSignature(body, 'sha256=short'));
    assert.equal(verifyWebhookSignature(body, 'sha256=short'), false);
  });

  it('handles an empty body', () => {
    const body = Buffer.from('');
    const sig = makeSignature(body);
    assert.equal(verifyWebhookSignature(body, sig), true);
  });
});
