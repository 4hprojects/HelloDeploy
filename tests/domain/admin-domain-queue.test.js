import assert from 'node:assert/strict';
import { before, after, beforeEach, describe, it } from 'node:test';

import { Domain } from '@hellodeploy/database';
import { DomainStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

const { getPendingApprovalDomains, getRoutableDomains } =
  await import('../../apps/web/src/services/domain.service.js');

async function createPendingDomain(projectId, hostnameNormalized) {
  return Domain.create({
    projectId,
    hostnameNormalized,
    status: DomainStatus.PENDING_ADMIN_APPROVAL,
    verificationTokenHash: 'hash',
    addedBy: objectId(),
  });
}

describe('admin domain approval queue', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('finds pending domains by the owning project name', async () => {
    const shop = await createProject({ name: 'Corner Shop' });
    const blog = await createProject({ name: 'Travel Blog' });
    await createPendingDomain(shop._id, 'shop.example.com');
    await createPendingDomain(blog._id, 'blog.example.com');

    const { domains } = await getPendingApprovalDomains({ search: 'corner' });

    assert.deepEqual(
      domains.map((d) => d.hostnameNormalized),
      ['shop.example.com'],
    );
  });

  it('treats search text as a literal, not a pattern', async () => {
    const project = await createProject();
    await createPendingDomain(project._id, 'shop.example.com');

    const { total } = await getPendingApprovalDomains({ search: '.*' });

    assert.equal(total, 0);
  });

  it('returns one page of the queue with the full count', async () => {
    const project = await createProject();
    await createPendingDomain(project._id, 'a.example.com');
    await createPendingDomain(project._id, 'b.example.com');
    await createPendingDomain(project._id, 'c.example.com');

    const result = await getPendingApprovalDomains({ page: 2, limit: 2 });

    assert.deepEqual(
      { total: result.total, hostnames: result.domains.map((d) => d.hostnameNormalized) },
      { total: 3, hostnames: ['c.example.com'] },
    );
  });

  it('filters the tunnel list by hostname', async () => {
    const project = await createProject();
    await createPendingDomain(project._id, 'shop.example.com');
    await createPendingDomain(project._id, 'blog.example.com');

    const domains = await getRoutableDomains({ search: 'blog' });

    assert.deepEqual(
      domains.map((d) => d.hostnameNormalized),
      ['blog.example.com'],
    );
  });
});
