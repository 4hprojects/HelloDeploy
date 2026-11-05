import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';
import { createDeployment, createProject } from '../helpers/worker-fixtures.js';

const { getDeploymentActivity } =
  await import('../../apps/web/src/services/admin-ops/deployments.service.js');

describe('deployment activity for the overview', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  function deployment(project, sequenceNumber, status, extra = {}) {
    return createDeployment(project._id, {
      sequenceNumber,
      status,
      currentStage: status,
      ...extra,
    });
  }

  it('treats a failure fixed by a later successful deploy as history', async () => {
    const project = await createProject();
    await deployment(project, 1, 'FAILED');
    await deployment(project, 2, 'HEALTHY');
    const activity = await getDeploymentActivity();
    assert.deepEqual(
      [
        activity.unresolvedFailures.length,
        activity.recent.find((r) => r.status === 'FAILED').superseded,
      ],
      [0, true],
    );
  });

  it('keeps a project whose latest deploy failed as unresolved', async () => {
    const project = await createProject();
    await deployment(project, 1, 'HEALTHY');
    await deployment(project, 2, 'FAILED');
    const activity = await getDeploymentActivity();
    assert.equal(activity.unresolvedFailures.length, 1);
  });

  it('flags a build running for over thirty minutes as possibly stuck', async () => {
    const project = await createProject();
    await deployment(project, 1, 'BUILDING', { createdAt: new Date(Date.now() - 45 * 60_000) });
    const activity = await getDeploymentActivity();
    assert.equal(activity.active[0].stuck, true);
  });

  it('does not flag a deployment still waiting in the queue as stuck', async () => {
    const project = await createProject();
    await deployment(project, 1, 'QUEUED', { createdAt: new Date(Date.now() - 45 * 60_000) });
    const activity = await getDeploymentActivity();
    assert.equal(activity.active[0].stuck, false);
  });
});
