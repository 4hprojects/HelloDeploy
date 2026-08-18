import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { AuditEvent, User } from '@hellodeploy/database';
import { AuditOutcome } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { searchAuditEvents } = await import('../../apps/web/src/services/audit-search.service.js');

describe('audit-search.service — actor name resolution', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('resolves an existing actor to a name and email', async () => {
    const actor = await User.create({
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.test',
      passwordHash: 'hash',
    });
    await AuditEvent.create({
      action: 'admin.user_suspended',
      outcome: AuditOutcome.SUCCESS,
      actorId: actor._id,
    });

    const { events } = await searchAuditEvents({});

    assert.equal(events[0].actorName, 'Ada Lovelace (ada@example.test)');
  });

  it('leaves actorName unset for a system action (no actorId)', async () => {
    await AuditEvent.create({
      action: 'system.cleanup',
      outcome: AuditOutcome.SUCCESS,
      actorId: null,
    });

    const { events } = await searchAuditEvents({});

    assert.equal(events[0].actorName, undefined);
  });

  it('leaves actorName unset when the actor no longer exists', async () => {
    await AuditEvent.create({
      action: 'admin.user_suspended',
      outcome: AuditOutcome.SUCCESS,
      actorId: objectId(),
    });

    const { events } = await searchAuditEvents({});

    assert.equal(events[0].actorName, undefined);
    assert.ok(events[0].actorId, 'raw actorId must still be present as a fallback');
  });
});
