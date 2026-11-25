import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Webhook } from 'svix';

const SECRET = `whsec_${Buffer.from('resend-webhook-test-secret-32by').toString('base64')}`;
process.env.RESEND_WEBHOOK_SECRET = SECRET;
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

function signedRequest(eventId, event, { body = JSON.stringify(event) } = {}) {
  const sentAt = new Date();
  return {
    body: Buffer.from(body),
    headers: {
      'svix-id': eventId,
      'svix-timestamp': String(Math.floor(sentAt.getTime() / 1000)),
      'svix-signature': new Webhook(SECRET).sign(eventId, sentAt, JSON.stringify(event)),
    },
  };
}

describe('Resend webhook', () => {
  it('rejects invalid signatures', async () => {
    const bad = response();
    await handleResendWebhook({ body: Buffer.from('{}'), headers: {} }, bad);
    assert.equal(bad.statusCode, 401);
  });

  it('rejects a body changed after signing', async () => {
    const event = { type: 'email.delivered', data: { email_id: 'provider-1' } };
    const tampered = response();
    await handleResendWebhook(
      signedRequest('event-tampered', event, {
        body: JSON.stringify({ ...event, type: 'email.bounced' }),
      }),
      tampered,
    );
    assert.equal(tampered.statusCode, 401);
  });

  it('never queries notifications with a non-string provider message id', async () => {
    const queries = [];
    const event = { type: 'email.delivered', data: { email_id: { $ne: null } } };
    await handleResendWebhook(signedRequest('event-operator', event), response(), {
      EventModel: { async create() {} },
      NotificationModel: {
        async findOne(query) {
          queries.push(query);
          return null;
        },
      },
    });
    assert.deepEqual(queries, []);
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
      const event = { type, created_at: occurredAt, data: { email_id: 'provider-1' } };
      await handleResendWebhook(signedRequest(`event-${expected}`, event), ok, {
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
    await handleResendWebhook(
      signedRequest('event-replay', {
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: 'provider-1' },
      }),
      duplicate,
      {
        EventModel: {
          async create() {
            throw Object.assign(new Error('duplicate'), { code: 11000 });
          },
        },
      },
    );
    assert.deepEqual(duplicate.body, { ok: true, duplicate: true });

    const NotificationModel = {
      async findOne() {
        return null;
      },
      async updateOne(query, update) {
        updates.push({ query, update });
      },
    };
    await handleResendWebhook(
      signedRequest('event-unknown', {
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: 'unknown-provider-id' },
      }),
      response(),
      {
        EventModel: { async create() {} },
        NotificationModel,
      },
    );
    const staleModel = {
      async findOne() {
        return { _id: 'notification-1', status: 'DELIVERED' };
      },
      async updateOne(query, update) {
        updates.push({ query, update });
      },
    };
    await handleResendWebhook(
      signedRequest('event-stale', {
        type: 'email.sent',
        created_at: new Date().toISOString(),
        data: { email_id: 'provider-1' },
      }),
      response(),
      {
        EventModel: { async create() {} },
        NotificationModel: staleModel,
      },
    );
    assert.equal(updates.length, 0);
  });
});
