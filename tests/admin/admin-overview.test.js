import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Domain } from '@hellodeploy/database';
import { DomainStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

const { getAdminOverview } = await import('../../apps/web/src/services/admin.service.js');

describe('admin.service — getAdminOverview', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('counts domains pending admin approval', async () => {
    const project = await createProject();
    await Domain.create({
      projectId: project._id,
      hostnameNormalized: 'example.test',
      status: DomainStatus.PENDING_ADMIN_APPROVAL,
      addedBy: objectId(),
    });
    await Domain.create({
      projectId: project._id,
      hostnameNormalized: 'verified.test',
      status: DomainStatus.VERIFIED,
      addedBy: objectId(),
    });

    const overview = await getAdminOverview();

    assert.equal(overview.pendingDomainApprovals, 1);
  });

  it('reports zero when no domains are awaiting approval', async () => {
    const overview = await getAdminOverview();
    assert.equal(overview.pendingDomainApprovals, 0);
  });
});
