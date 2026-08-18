import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import { startTestDb, stopTestDb } from '../helpers/worker-db.js';

const { collectServerStats } = await import('../../apps/web/src/services/server-stats.service.js');
const { closeDeploymentQueue } = await import('../../apps/web/src/queue/client.js');

describe('server-stats.service — MongoDB connectivity', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await closeDeploymentQueue();
    await stopTestDb();
  });

  it('reports MongoDB as connected when the connection is healthy', async () => {
    const stats = await collectServerStats();
    assert.equal(stats.mongo.connected, true);
  });
});
