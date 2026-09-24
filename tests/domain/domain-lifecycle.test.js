import assert from 'node:assert/strict';
import { before, after, beforeEach, describe, it } from 'node:test';

import { Domain } from '@hellodeploy/database';
import { DomainStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { addDomain, requestVerification, removeDomain } =
  await import('../../apps/web/src/services/domain.service.js');

function recordingQueue({ fail = false } = {}) {
  const jobs = [];
  return {
    jobs,
    async add(name, data, opts) {
      if (fail) {
        throw new Error('queue unavailable');
      }
      jobs.push({ name, data, opts });
      return { id: opts.jobId };
    },
  };
}

async function createDomain(overrides = {}) {
  return Domain.create({
    projectId: objectId(),
    hostnameNormalized: 'app.example.com',
    status: DomainStatus.PENDING_VERIFICATION,
    verificationTokenHash: 'hash',
    addedBy: objectId(),
    ...overrides,
  });
}

describe('custom domain lifecycle', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('uses a unique job ID for every verification attempt', async () => {
    const domain = await createDomain();
    const queue = recordingQueue();

    const first = await requestVerification(domain._id, domain.projectId, domain.addedBy, {
      queue,
    });
    assert.equal(first.success, true);
    await Domain.updateOne(
      { _id: domain._id },
      { $set: { status: DomainStatus.PENDING_VERIFICATION } },
    );
    const second = await requestVerification(domain._id, domain.projectId, domain.addedBy, {
      queue,
    });

    assert.equal(second.success, true);
    assert.equal(queue.jobs.length, 2);
    assert.notEqual(queue.jobs[0].opts.jobId, queue.jobs[1].opts.jobId);
    assert.equal(queue.jobs[0].data.version, 2);
    assert.equal(queue.jobs[0].data.lifecycleVersion, 1);
  });

  it('does not enqueue a second verification while the first is in progress', async () => {
    const domain = await createDomain();
    const queue = recordingQueue();

    const first = await requestVerification(domain._id, domain.projectId, domain.addedBy, {
      queue,
    });
    const second = await requestVerification(domain._id, domain.projectId, domain.addedBy, {
      queue,
    });

    assert.equal(first.success, true);
    assert.equal(second.success, false);
    assert.match(second.error, /already in progress/i);
    assert.equal(queue.jobs.length, 1);
  });

  it('restores a retryable state when verification cannot be enqueued', async () => {
    const domain = await createDomain();
    const result = await requestVerification(domain._id, domain.projectId, domain.addedBy, {
      queue: recordingQueue({ fail: true }),
    });
    const fresh = await Domain.findById(domain._id).lean();

    assert.equal(result.success, false);
    assert.equal(fresh.status, DomainStatus.PENDING_VERIFICATION);
    assert.match(fresh.operationError, /queue is unavailable/i);
  });

  it('initializes lifecycle fencing for a legacy domain document', async () => {
    const projectId = objectId();
    const addedBy = objectId();
    const { insertedId } = await Domain.collection.insertOne({
      projectId,
      hostnameNormalized: 'legacy.example.com',
      type: 'CUSTOM',
      status: DomainStatus.PENDING_VERIFICATION,
      verificationTokenHash: 'hash',
      addedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const queue = recordingQueue();

    const result = await requestVerification(insertedId, projectId, addedBy, { queue });
    const fresh = await Domain.findById(insertedId).lean();

    assert.equal(result.success, true);
    assert.equal(queue.jobs[0].data.lifecycleVersion, 1);
    assert.equal(fresh.lifecycleVersion, 1);
  });

  it('increments the lifecycle version when a removed hostname is reclaimed', async () => {
    const domain = await createDomain({ status: DomainStatus.REMOVED, lifecycleVersion: 3 });
    const result = await addDomain(objectId(), domain.hostnameNormalized, objectId());
    const fresh = await Domain.findById(domain._id).lean();

    assert.equal(result.success, true);
    assert.equal(fresh.lifecycleVersion, 4);
    assert.equal(fresh.status, DomainStatus.PENDING_VERIFICATION);
  });

  it('reclaims a legacy removed hostname at lifecycle version 2', async () => {
    const { insertedId } = await Domain.collection.insertOne({
      projectId: objectId(),
      hostnameNormalized: 'legacy.example.com',
      type: 'CUSTOM',
      status: DomainStatus.REMOVED,
      verificationTokenHash: 'hash',
      addedBy: objectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await addDomain(objectId(), 'legacy.example.com', objectId());
    const fresh = await Domain.findById(insertedId).lean();

    assert.equal(result.success, true);
    assert.equal(fresh.lifecycleVersion, 2);
  });

  it('queues active-route removal before making the hostname reclaimable', async () => {
    const domain = await createDomain({ status: DomainStatus.ACTIVE });
    const queue = recordingQueue();
    const result = await removeDomain(domain._id, domain.projectId, domain.addedBy, { queue });
    const fresh = await Domain.findById(domain._id).lean();

    assert.equal(result.success, true);
    assert.equal(result.queued, true);
    assert.equal(fresh.status, DomainStatus.REMOVING);
    assert.equal(queue.jobs[0].name, 'REMOVE_DOMAIN');
    assert.match(queue.jobs[0].opts.jobId, /^remove-domain-/);
  });

  it('rejects removal while verification or activation is in progress', async () => {
    const domain = await createDomain({ status: DomainStatus.VERIFYING });
    const result = await removeDomain(domain._id, domain.projectId, domain.addedBy, {
      queue: recordingQueue(),
    });

    assert.equal(result.success, false);
    assert.match(result.error, /already in progress/i);
  });
});
