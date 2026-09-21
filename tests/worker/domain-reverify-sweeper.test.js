import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Domain } from '@hellodeploy/database';
import { DomainStatus, JobType } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { sweepUnverifiedDomains } = await import('../../apps/worker/src/domain/reverify-sweeper.js');

function makeQueueStub() {
  const added = [];
  return { added, queue: { add: async (name, data, opts) => added.push({ name, data, opts }) } };
}

let hostnameCounter = 0;

async function seedDomain(status, ageMs) {
  const hostname = `example-${(hostnameCounter += 1)}.test`;
  const domain = await Domain.create({
    projectId: objectId(),
    hostname,
    hostnameNormalized: hostname,
    addedBy: objectId(),
    status,
  });
  await Domain.collection.updateOne(
    { _id: domain._id },
    { $set: { updatedAt: new Date(Date.now() - ageMs) } },
  );
  return domain;
}

describe('unverified domain sweeper', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('re-checks a domain left pending past the threshold', async () => {
    await seedDomain(DomainStatus.PENDING_VERIFICATION, 3 * 60 * 60 * 1000);
    const { added, queue } = makeQueueStub();
    await sweepUnverifiedDomains({ queue });
    assert.equal(added[0].name, JobType.VERIFY_DOMAIN);
  });

  it('leaves a recently added domain alone', async () => {
    await seedDomain(DomainStatus.PENDING_VERIFICATION, 60 * 1000);
    const { added, queue } = makeQueueStub();
    await sweepUnverifiedDomains({ queue });
    assert.equal(added.length, 0);
  });

  it('ignores a domain that already verified', async () => {
    await seedDomain(DomainStatus.VERIFIED, 3 * 60 * 60 * 1000);
    const { added, queue } = makeQueueStub();
    await sweepUnverifiedDomains({ queue });
    assert.equal(added.length, 0);
  });

  it('uses a sweep-specific job id so the retained user-triggered job cannot swallow it', async () => {
    const domain = await seedDomain(DomainStatus.PENDING_VERIFICATION, 3 * 60 * 60 * 1000);
    await Domain.collection.updateOne({ _id: domain._id }, { $set: { updatedAt: new Date(0) } });
    const { added, queue } = makeQueueStub();
    await sweepUnverifiedDomains({ queue, now: () => 1234, maxAgeMs: 1 });
    assert.equal(added[0].opts.jobId, `domain-reverify-${domain._id}-1234`);
  });

  it('bounds how much one sweep enqueues', async () => {
    for (let i = 0; i < 4; i++) {
      await seedDomain(DomainStatus.PENDING_VERIFICATION, 3 * 60 * 60 * 1000);
    }
    const { added, queue } = makeQueueStub();
    await sweepUnverifiedDomains({ queue, limit: 2 });
    assert.equal(added.length, 2);
  });

  it('does nothing when the queue is unavailable', async () => {
    await seedDomain(DomainStatus.PENDING_VERIFICATION, 3 * 60 * 60 * 1000);
    assert.equal(await sweepUnverifiedDomains({ queue: null }), 0);
  });
});
