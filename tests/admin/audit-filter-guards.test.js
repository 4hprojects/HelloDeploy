import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { AuditEvent } from '@hellodeploy/database';
import { AuditOutcome } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { searchAuditEvents } = await import('../../apps/web/src/services/audit-search.service.js');

/**
 * Audit filters arrive straight from req.query, where a bracketed parameter
 * (?actorId[$ne]=x) arrives as an object rather than a string. Reaching .trim()
 * on one used to throw and surface as a 500.
 */
describe('audit search filters reject values that are not strings', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
    await AuditEvent.create({
      action: 'admin.user_suspended',
      outcome: AuditOutcome.SUCCESS,
      actorId: objectId(),
    });
  });

  it('ignores an object-valued action filter instead of throwing', async () => {
    const result = await searchAuditEvents({ action: { $ne: null } });

    assert.equal(result.events.length, 1);
  });

  it('ignores an object-valued date filter instead of throwing', async () => {
    const result = await searchAuditEvents({ from: { $gt: '' } });

    assert.equal(result.events.length, 1);
  });

  it('ignores an unparseable date instead of throwing', async () => {
    const result = await searchAuditEvents({ from: 'not-a-date' });

    assert.equal(result.events.length, 1);
  });

  it('returns nothing for an actor id that cannot exist', async () => {
    const result = await searchAuditEvents({ actorId: 'not-an-object-id' });

    assert.equal(result.events.length, 0);
  });

  it('still filters by a valid actor id', async () => {
    const mine = objectId();
    await AuditEvent.create({
      action: 'auth.sign_in',
      outcome: AuditOutcome.SUCCESS,
      actorId: mine,
    });

    const result = await searchAuditEvents({ actorId: mine.toString() });

    assert.equal(result.events.length, 1);
  });
});
