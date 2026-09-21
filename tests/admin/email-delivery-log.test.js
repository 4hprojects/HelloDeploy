import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { EmailDelivery, EmailDeliveryOutcome } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';

// apps/web/src/config/env.js imports dotenv, so a real RESEND_API_KEY from
// .env would otherwise reach this suite and attempt live sends. dotenv does
// not overwrite variables that are already set, so claiming it first wins.
process.env.RESEND_API_KEY = '';

const { sendVerificationEmail } = await import('../../apps/web/src/services/email.service.js');
const { collectServerStats } = await import('../../apps/web/src/services/server-stats.service.js');

describe('email delivery log', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('records a send that never happened because no provider key is configured', async () => {
    await sendVerificationEmail({
      to: 'new-user@example.test',
      firstName: 'Sam',
      verificationUrl: 'https://example.test/verify',
    });
    const record = await EmailDelivery.findOne({ recipient: 'new-user@example.test' }).lean();
    assert.equal(record.outcome, EmailDeliveryOutcome.SKIPPED);
  });

  it('says why the send was skipped', async () => {
    await sendVerificationEmail({
      to: 'new-user@example.test',
      firstName: 'Sam',
      verificationUrl: 'https://example.test/verify',
    });
    const record = await EmailDelivery.findOne({ recipient: 'new-user@example.test' }).lean();
    assert.match(record.error, /RESEND_API_KEY/);
  });

  it('labels the template so an operator can tell signup from password reset', async () => {
    await sendVerificationEmail({
      to: 'new-user@example.test',
      firstName: 'Sam',
      verificationUrl: 'https://example.test/verify',
    });
    const record = await EmailDelivery.findOne({ recipient: 'new-user@example.test' }).lean();
    assert.equal(record.template, 'verification');
  });

  it('reports delivery as unhealthy on the admin dashboard when sends are skipped', async () => {
    await EmailDelivery.create({
      recipient: 'a@example.test',
      template: 'verification',
      outcome: EmailDeliveryOutcome.SKIPPED,
      error: 'RESEND_API_KEY is not configured',
    });
    const stats = await collectServerStats({ queue: null });
    assert.equal(stats.email.healthy, false);
  });

  it('reports delivery as healthy when recent sends all succeeded', async () => {
    await EmailDelivery.create({
      recipient: 'a@example.test',
      template: 'verification',
      outcome: EmailDeliveryOutcome.SENT,
    });
    const stats = await collectServerStats({ queue: null });
    assert.equal(stats.email.healthy, true);
  });

  it('surfaces the most recent problem for diagnosis', async () => {
    await EmailDelivery.create({
      recipient: 'a@example.test',
      template: 'password-reset',
      outcome: EmailDeliveryOutcome.FAILED,
      error: 'domain not verified',
    });
    const stats = await collectServerStats({ queue: null });
    assert.equal(stats.email.lastFailure.error, 'domain not verified');
  });
});
