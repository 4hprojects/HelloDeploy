import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHmac } from 'node:crypto';

// Must be set before importing the controller so the module captures this value
process.env.GITHUB_WEBHOOK_SECRET = 'replay-test-secret';
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'hellodeploy-test';

const { handleGithubWebhook } = await import(
  '../../apps/web/src/controllers/webhook.controller.js'
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sign(body) {
  return `sha256=${createHmac('sha256', 'replay-test-secret').update(body).digest('hex')}`;
}

const PING_PAYLOAD = Buffer.from(JSON.stringify({ zen: 'keep it simple', hook_id: 1 }));

let counter = 0;
function uniqueDeliveryId() {
  return `replay-test-delivery-${++counter}-${Date.now()}`;
}

function makeReq({ body = PING_PAYLOAD, signature, deliveryId, event = 'ping' } = {}) {
  return {
    headers: {
      'x-hub-signature-256': signature ?? sign(body),
      'x-github-delivery': deliveryId ?? uniqueDeliveryId(),
      'x-github-event': event,
    },
    body,
    correlationId: 'test',
  };
}

function makeRes() {
  const res = {
    _status: null,
    _json: null,
    status(code) { this._status = code; return this; },
    json(body) { this._json = body; return this; },
  };
  return res;
}

// ─── Signature verification ───────────────────────────────────────────────────

describe('webhook security — signature verification', () => {
  it('rejects a request with an invalid HMAC signature with 401', async () => {
    const res = makeRes();
    await handleGithubWebhook(makeReq({ signature: 'sha256=invalid' }), res);
    assert.equal(res._status, 401, 'invalid signature must return 401');
    assert.ok(res._json?.error, 'error field must be present');
  });

  it('rejects a request with a missing signature with 401', async () => {
    const req = makeReq();
    req.headers['x-hub-signature-256'] = undefined;
    const res = makeRes();
    await handleGithubWebhook(req, res);
    assert.equal(res._status, 401);
  });

  it('rejects a request with a wrong-secret signature with 401', async () => {
    const wrongSig = `sha256=${createHmac('sha256', 'wrong-secret').update(PING_PAYLOAD).digest('hex')}`;
    const res = makeRes();
    await handleGithubWebhook(makeReq({ signature: wrongSig }), res);
    assert.equal(res._status, 401);
  });

  it('accepts a request with a valid HMAC signature', async () => {
    const res = makeRes();
    await handleGithubWebhook(makeReq(), res);
    assert.equal(res._status, 200);
    assert.equal(res._json?.ok, true);
  });
});

// ─── Replay prevention ────────────────────────────────────────────────────────

describe('webhook security — replay prevention', () => {
  it('processes the first delivery with a given ID', async () => {
    const deliveryId = uniqueDeliveryId();
    const res = makeRes();
    await handleGithubWebhook(makeReq({ deliveryId }), res);
    assert.equal(res._status, 200);
    assert.ok(res._json?.ok === true && !res._json?.note, 'first delivery must not be flagged as duplicate');
  });

  it('silently deduplicates a replayed delivery (same X-GitHub-Delivery ID)', async () => {
    const deliveryId = uniqueDeliveryId();
    // First delivery — mark as seen
    await handleGithubWebhook(makeReq({ deliveryId }), makeRes());
    // Replayed delivery — same ID
    const res = makeRes();
    await handleGithubWebhook(makeReq({ deliveryId }), res);
    assert.equal(res._status, 200, 'replayed webhook must still return 200 (not an error)');
    assert.ok(
      res._json?.note?.includes('duplicate'),
      'replayed webhook must be flagged as duplicate in response',
    );
  });

  it('treats two different delivery IDs as independent events', async () => {
    const id1 = uniqueDeliveryId();
    const id2 = uniqueDeliveryId();
    const res1 = makeRes();
    const res2 = makeRes();
    await handleGithubWebhook(makeReq({ deliveryId: id1 }), res1);
    await handleGithubWebhook(makeReq({ deliveryId: id2 }), res2);
    assert.ok(!res1._json?.note, 'first delivery must not be flagged');
    assert.ok(!res2._json?.note, 'second delivery with different ID must not be flagged');
  });

  it('processes a delivery with no X-GitHub-Delivery header (no replay tracking)', async () => {
    const req = makeReq();
    delete req.headers['x-github-delivery'];
    const res = makeRes();
    await handleGithubWebhook(req, res);
    // Without a delivery ID there is nothing to deduplicate — should still process
    assert.equal(res._status, 200);
  });
});

// ─── Payload validation ───────────────────────────────────────────────────────

describe('webhook security — payload validation', () => {
  it('rejects a malformed JSON payload with 400', async () => {
    const body = Buffer.from('not-valid-json{{{');
    const res = makeRes();
    await handleGithubWebhook(makeReq({ body, signature: sign(body) }), res);
    assert.equal(res._status, 400);
    assert.ok(res._json?.error, 'error field must be present');
  });

  it('accepts a valid JSON payload', async () => {
    const body = Buffer.from(JSON.stringify({ zen: 'test', hook_id: 99 }));
    const res = makeRes();
    await handleGithubWebhook(makeReq({ body, signature: sign(body) }), res);
    assert.equal(res._status, 200);
  });
});
