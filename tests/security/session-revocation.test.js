import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { mongoose } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { revokeUserSessions } =
  await import('../../apps/web/src/services/session-revocation.service.js');

function sessions() {
  return mongoose.connection.db.collection('sessions');
}

function storeSession(sessionId, userId) {
  return sessions().insertOne({
    _id: sessionId,
    session: JSON.stringify({ user: { id: userId.toString() } }),
    expires: new Date(Date.now() + 86_400_000),
  });
}

describe('revokeUserSessions', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('removes every stored session of the user', async () => {
    const userId = objectId();
    await storeSession('laptop', userId);
    await storeSession('phone', userId);

    await revokeUserSessions(userId);

    assert.equal(await sessions().countDocuments(), 0);
  });

  it('reports how many sessions it removed', async () => {
    const userId = objectId();
    await storeSession('laptop', userId);
    await storeSession('phone', userId);

    assert.equal(await revokeUserSessions(userId), 2);
  });

  it("keeps the caller's own session when asked to", async () => {
    const userId = objectId();
    await storeSession('this-browser', userId);
    await storeSession('other-browser', userId);

    await revokeUserSessions(userId, { exceptSessionId: 'this-browser' });

    assert.deepEqual(
      (await sessions().find().toArray()).map((session) => session._id),
      ['this-browser'],
    );
  });

  it("leaves other users' sessions alone", async () => {
    await storeSession('someone-else', objectId());

    await revokeUserSessions(objectId());

    assert.equal(await sessions().countDocuments(), 1);
  });

  it('refuses a user id that is not an ObjectId instead of matching it as a pattern', async () => {
    await storeSession('someone', objectId());

    await assert.rejects(revokeUserSessions('.*'));
  });
});
