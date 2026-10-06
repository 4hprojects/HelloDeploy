import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sendPasswordResetEmail } from '../../apps/web/src/services/email.service.js';

const message = {
  to: 'private-recipient@example.test',
  firstName: 'Ada',
  resetCode: '638294',
  correlationId: 'reset-correlation',
};

function capturingLogger() {
  const entries = [];
  return {
    entries,
    logger: {
      info: (text, metadata) => entries.push({ level: 'info', text, metadata }),
      error: (text, metadata) => entries.push({ level: 'error', text, metadata }),
    },
  };
}

function assertLogsAreSafe(entries) {
  const serialized = JSON.stringify(entries);
  assert.doesNotMatch(serialized, /private-recipient@example\.test/);
  assert.doesNotMatch(serialized, /638294/);
}

describe('password reset email delivery', () => {
  it('returns and logs the provider acceptance ID without sensitive content', async () => {
    const capture = capturingLogger();
    const result = await sendPasswordResetEmail(message, {
      client: {
        emails: {
          send: async () => ({ data: { id: 'provider-message-id' }, error: null }),
        },
      },
      log: capture.logger,
    });

    assert.deepEqual(result, { status: 'accepted', providerMessageId: 'provider-message-id' });
    assert.equal(capture.entries[0].metadata.providerMessageId, 'provider-message-id');
    assert.equal(capture.entries[0].metadata.correlationId, 'reset-correlation');
    assertLogsAreSafe(capture.entries);
  });

  it('returns a safe skipped result when the provider is not configured', async () => {
    const capture = capturingLogger();
    const result = await sendPasswordResetEmail(message, {
      client: null,
      log: capture.logger,
    });

    assert.deepEqual(result, { status: 'skipped', providerMessageId: null });
    assertLogsAreSafe(capture.entries);
  });

  it('rejects provider errors without logging sensitive request content', async () => {
    const capture = capturingLogger();
    await assert.rejects(
      sendPasswordResetEmail(message, {
        client: {
          emails: {
            send: async () => ({
              data: null,
              error: { name: 'validation_error', message: 'request rejected' },
            }),
          },
        },
        log: capture.logger,
      }),
      /provider rejected/,
    );

    assert.equal(capture.entries[0].metadata.providerErrorType, 'validation_error');
    assertLogsAreSafe(capture.entries);
  });
});
