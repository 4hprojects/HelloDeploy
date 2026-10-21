import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

// Assembled so the placeholder never reads as a literal credential.
const SIGNING_KEY = ['health', 'test', 'key'].join('-');
process.env.GITHUB_WEBHOOK_SECRET = SIGNING_KEY;
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'hellodeploy-test';

const { getWebhookHealth, recordWebhookOutcome } =
  await import('../../apps/web/src/services/webhook-health.service.js');
const { handleGithubWebhook } =
  await import('../../apps/web/src/controllers/webhook.controller.js');

/** The subset of an ioredis client the health record and delivery dedup use. */
function fakeRedis({ status = 'ready' } = {}) {
  const hashes = new Map();
  return {
    status,
    async hset(key, field, value) {
      const hash = hashes.get(key) ?? {};
      Object.assign(hash, typeof field === 'object' ? field : { [field]: String(value) });
      hashes.set(key, hash);
    },
    async hincrby(key, field, by) {
      const hash = hashes.get(key) ?? {};
      hash[field] = String(Number(hash[field] ?? 0) + by);
      hashes.set(key, hash);
    },
    async hgetall(key) {
      return { ...(hashes.get(key) ?? {}) };
    },
    async set() {
      return 'OK';
    },
  };
}

function makeRes() {
  return {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json() {
      return this;
    },
  };
}

function webhookRequest(signature) {
  const body = Buffer.from(JSON.stringify({ zen: 'ping' }));
  return {
    headers: {
      'x-hub-signature-256':
        signature ?? `sha256=${createHmac('sha256', SIGNING_KEY).update(body).digest('hex')}`,
      'x-github-delivery': `health-${Math.random()}`,
      'x-github-event': 'ping',
    },
    body,
    correlationId: 'test',
  };
}

describe('GitHub webhook health', () => {
  it('reports a secret mismatch when deliveries are rejected and none was ever accepted', async () => {
    const redis = fakeRedis();
    await recordWebhookOutcome(redis, 'rejected');
    await recordWebhookOutcome(redis, 'rejected');
    const health = await getWebhookHealth(redis);
    assert.deepEqual([health.isFailing, health.rejectedSinceAccepted], [true, 2]);
  });

  it('clears the failure once a delivery is accepted', async () => {
    const redis = fakeRedis();
    await recordWebhookOutcome(redis, 'rejected', new Date('2026-10-21T00:00:00Z'));
    await recordWebhookOutcome(redis, 'accepted', new Date('2026-10-21T00:05:00Z'));
    const health = await getWebhookHealth(redis);
    assert.deepEqual([health.isFailing, health.rejectedSinceAccepted], [false, 0]);
  });

  // A command on a disconnected client queues forever; the webhook must never wait on it.
  it('skips recording while Redis is not ready', async () => {
    const redis = fakeRedis({ status: 'reconnecting' });
    await recordWebhookOutcome(redis, 'rejected');
    redis.status = 'ready';
    assert.equal((await getWebhookHealth(redis)).rejectedSinceAccepted, 0);
  });

  it('reports no health data without Redis', async () => {
    assert.equal(await getWebhookHealth(null), null);
  });

  it('records a rejected delivery from the webhook handler', async () => {
    const redis = fakeRedis();
    await handleGithubWebhook(webhookRequest('sha256=wrong'), makeRes(), {
      getRedisConnection: () => redis,
    });
    assert.equal((await getWebhookHealth(redis)).rejectedSinceAccepted, 1);
  });

  it('records an accepted delivery from the webhook handler', async () => {
    const redis = fakeRedis();
    await handleGithubWebhook(webhookRequest(), makeRes(), { getRedisConnection: () => redis });
    assert.notEqual((await getWebhookHealth(redis)).lastAcceptedAt, null);
  });
});

describe('GitHub webhook route body limit', () => {
  // GitHub sends payloads up to 25 MB; a large push (the #119 merge) hit the
  // default 100 kB limit and failed with 500 before its signature was checked.
  it('reads a payload larger than 100 kB instead of rejecting it as too large', async () => {
    const { default: express } = await import('express');
    const { default: webhookRoutes } =
      await import('../../apps/web/src/routes/api/webhook.routes.js');
    const app = express();
    app.use('/api/webhooks', webhookRoutes);
    const server = app.listen(0);
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/api/webhooks/github`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=wrong' },
        body: JSON.stringify({ padding: 'x'.repeat(200_000) }),
      });
      assert.equal(res.status, 401);
    } finally {
      server.close();
    }
  });
});
