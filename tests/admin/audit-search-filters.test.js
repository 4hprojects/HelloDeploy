import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { AuditEvent, User } from '@hellodeploy/database';
import { AuditOutcome } from '@hellodeploy/contracts';

import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';

const { searchAuditEvents } = await import('../../apps/web/src/services/audit-search.service.js');

// Local times, matching how the page displays events and reads its date inputs.
const LATE_ON_14TH = new Date(2026, 9, 14, 23, 30);
const LATE_ON_15TH = new Date(2026, 9, 15, 23, 30);

const actionsOf = (result) => result.events.map((event) => event.action).sort();

async function recordEvent(action, overrides = {}) {
  const event = await AuditEvent.create({ action, outcome: AuditOutcome.SUCCESS, ...overrides });
  if (overrides.createdAt) {
    // createdAt is managed by timestamps, so set the test time directly.
    await AuditEvent.collection.updateOne(
      { _id: event._id },
      { $set: { createdAt: overrides.createdAt } },
    );
  }
  return event;
}

describe('audit search filters', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  describe('date range', () => {
    beforeEach(async () => {
      await recordEvent('auth.on_14th', { createdAt: LATE_ON_14TH });
      await recordEvent('auth.on_15th', { createdAt: LATE_ON_15TH });
    });

    it('includes the whole of the "to" day', async () => {
      const result = await searchAuditEvents({ to: '2026-10-15' });
      assert.deepEqual(actionsOf(result), ['auth.on_14th', 'auth.on_15th']);
    });

    it('starts the "from" day at local midnight', async () => {
      const result = await searchAuditEvents({ from: '2026-10-15' });
      assert.deepEqual(actionsOf(result), ['auth.on_15th']);
    });
  });

  describe('actor', () => {
    beforeEach(async () => {
      const ada = await User.create({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.test',
        passwordHash: 'hash',
      });
      const alan = await User.create({
        firstName: 'Alan',
        lastName: 'Turing',
        email: 'alan@example.test',
        passwordHash: 'hash',
      });
      await recordEvent('auth.by_ada', { actorId: ada._id });
      await recordEvent('auth.by_alan', { actorId: alan._id });
      await recordEvent('nginx.by_system', { actorId: null });
    });

    it('matches by email', async () => {
      const result = await searchAuditEvents({ actor: 'alan@example' });
      assert.deepEqual(actionsOf(result), ['auth.by_alan']);
    });

    it('matches a full name across first and last name', async () => {
      const result = await searchAuditEvents({ actor: 'ada love' });
      assert.deepEqual(actionsOf(result), ['auth.by_ada']);
    });

    it('returns nothing when no user matches', async () => {
      const result = await searchAuditEvents({ actor: 'grace' });
      assert.equal(result.total, 0);
    });

    it('treats "system" as events with no actor', async () => {
      const result = await searchAuditEvents({ actor: 'System' });
      assert.deepEqual(actionsOf(result), ['nginx.by_system']);
    });
  });

  describe('period', () => {
    beforeEach(async () => {
      await recordEvent('auth.recent', { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });
      await recordEvent('auth.last_week', {
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      });
    });

    it('limits "Last 24 hours" to the past day', async () => {
      const result = await searchAuditEvents({ period: '24h' });
      assert.deepEqual(actionsOf(result), ['auth.recent']);
    });

    it('lets a preset period override custom dates', async () => {
      const result = await searchAuditEvents({
        period: '7d',
        from: '2000-01-01',
        to: '2000-01-02',
      });
      assert.deepEqual(actionsOf(result), ['auth.last_week', 'auth.recent']);
    });

    it('uses the custom dates for "Custom range"', async () => {
      const result = await searchAuditEvents({ period: 'custom', to: '2000-01-02' });
      assert.equal(result.total, 0);
    });

    it('ignores an unknown period', async () => {
      const result = await searchAuditEvents({ period: 'forever' });
      assert.equal(result.total, 2);
    });
  });

  it('narrows to one request by correlation id', async () => {
    await recordEvent('project.first', { correlationId: 'req-1' });
    await recordEvent('project.second', { correlationId: 'req-1' });
    await recordEvent('project.other', { correlationId: 'req-2' });

    const result = await searchAuditEvents({ correlationId: 'req-1' });

    assert.deepEqual(actionsOf(result), ['project.first', 'project.second']);
  });
});
