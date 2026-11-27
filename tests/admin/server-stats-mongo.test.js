import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { collectServerStats } = await import('../../apps/web/src/services/server-stats.service.js');

describe('server-stats.service — MongoDB connectivity', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('reports MongoDB as connected when the connection is healthy', async () => {
    const stats = await collectServerStats({ queue: null });
    assert.equal(stats.mongo.connected, true);
  });

  it('counts a project once when retained releases still hold a container id', async () => {
    const project = await createProject();
    await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'c-retained',
    });
    await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'c-live',
    });
    const stats = await collectServerStats({ queue: null });
    assert.equal(stats.running, 1);
  });
});
