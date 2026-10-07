import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.RESEND_WEBHOOK_SECRET = 'whsec_test';
const { handleResendWebhook } =
  await import('../../apps/web/src/controllers/resend-webhook.controller.js');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function request(eventId = 'event-1') {
  return {
    body: Buffer.from('{}'),
    headers: {
      'svix-id': eventId,
      'svix-timestamp': '1',
      'svix-signature': 'signature',
    },
  };
}

function verifier(event) {
  return { verify: () => event };
}

describe('Resend webhook', () => {
  it('rejects invalid signatures', async () => {
    const bad = response();
    await handleResendWebhook({ body: Buffer.from('{}'), headers: {} }, bad, {
      verifier: {
        verify() {
          throw new Error('bad');
        },
      },
    });
    assert.equal(bad.statusCode, 401);
  });

  it('maps every supported provider event and records provider time', async () => {
    const mappings = {
      'email.sent': 'SENT',
      'email.delivered': 'DELIVERED',
      'email.delivery_delayed': 'DELAYED',
      'email.failed': 'FAILED',
      'email.bounced': 'BOUNCED',
      'email.suppressed': 'SUPPRESSED',
    };
    for (const [type, expected] of Object.entries(mappings)) {
      const updates = [];
      const occurredAt = '2026-10-08T00:00:00.000Z';
      const ok = response();
      await handleResendWebhook(request(`event-${expected}`), ok, {
        verifier: verifier({ type, created_at: occurredAt, data: { email_id: 'provider-1' } }),
        EventModel: { async create() {} },
        NotificationModel: {
          async findOne() {
            return { _id: 'notification-1', status: 'PROCESSING' };
          },
          async updateOne(query, update) {
            updates.push({ query, update });
          },
        },
      });
      assert.equal(ok.statusCode, 200);
      assert.equal(updates[0].update.$set.status, expected);
      assert.equal(
        Object.values(updates[0].update.$set).some(
          (value) => value instanceof Date && value.toISOString() === occurredAt,
        ),
        true,
      );
    }
  });

  it('deduplicates replayed events and ignores unknown messages and stale events', async () => {
    const updates = [];
    const duplicate = response();
    await handleResendWebhook(request('event-replay'), duplicate, {
      verifier: verifier({
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: 'provider-1' },
      }),
      EventModel: {
        async create() {
          throw Object.assign(new Error('duplicate'), { code: 11000 });
        },
      },
    });
    assert.deepEqual(duplicate.body, { ok: true, duplicate: true });

    const NotificationModel = {
      async findOne() {
        return null;
      },
      async updateOne(query, update) {
        updates.push({ query, update });
      },
    };
    await handleResendWebhook(request('event-unknown'), response(), {
      verifier: verifier({
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: 'unknown-provider-id' },
      }),
      EventModel: { async create() {} },
      NotificationModel,
    });
    const staleModel = {
      async findOne() {
        return { _id: 'notification-1', status: 'DELIVERED' };
      },
      async updateOne(query, update) {
        updates.push({ query, update });
      },
    };
    await handleResendWebhook(request('event-stale'), response(), {
      verifier: verifier({
        type: 'email.sent',
        created_at: new Date().toISOString(),
        data: { email_id: 'provider-1' },
      }),
      EventModel: { async create() {} },
      NotificationModel: staleModel,
    });
    assert.equal(updates.length, 0);
  });
});
