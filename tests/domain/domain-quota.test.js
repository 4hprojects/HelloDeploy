import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Domain, Quota } from '@hellodeploy/database';
import { DomainStatus, QuotaScope } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

const { addDomain } = await import('../../apps/web/src/services/domain.service.js');

function setQuota(project, fields) {
  return Quota.create({
    scopeType: QuotaScope.PROJECT,
    scopeId: project._id,
    createdBy: project.ownerId,
    ...fields,
  });
}

describe('custom domain quota', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('refuses a domain beyond the project limit', async () => {
    const project = await createProject();
    await setQuota(project, { maxCustomDomains: 1 });
    await addDomain(project._id, 'first.example', project.ownerId);

    const result = await addDomain(project._id, 'second.example', project.ownerId);

    assert.equal(result.success, false);
  });

  it('names the limit in the rejection', async () => {
    const project = await createProject();
    await setQuota(project, { maxCustomDomains: 1 });
    await addDomain(project._id, 'first.example', project.ownerId);

    const result = await addDomain(project._id, 'second.example', project.ownerId);

    assert.match(result.error, /limit of 1 custom domain/);
  });

  it('allows a domain while the project is under its limit', async () => {
    const project = await createProject();
    await setQuota(project, { maxCustomDomains: 2 });
    await addDomain(project._id, 'first.example', project.ownerId);

    const result = await addDomain(project._id, 'second.example', project.ownerId);

    assert.equal(result.success, true);
  });

  it('does not count a removed domain against the limit', async () => {
    const project = await createProject();
    await setQuota(project, { maxCustomDomains: 1 });
    await addDomain(project._id, 'first.example', project.ownerId);
    await Domain.updateOne(
      { hostnameNormalized: 'first.example' },
      { $set: { status: DomainStatus.REMOVED } },
    );

    const result = await addDomain(project._id, 'second.example', project.ownerId);

    assert.equal(result.success, true);
  });
});
