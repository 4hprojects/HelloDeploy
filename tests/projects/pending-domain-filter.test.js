import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Domain } from '@hellodeploy/database';
import { DomainRoutingState, DomainStatus } from '@hellodeploy/contracts';

import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { PENDING_DOMAIN_FILTER } from '../../apps/web/src/config/project-navigation.js';

async function hasPendingDomain(fields) {
  const projectId = objectId();
  await Domain.create({
    projectId,
    hostnameNormalized: 'app.example.com',
    addedBy: objectId(),
    ...fields,
  });
  return Boolean(await Domain.exists({ projectId, ...PENDING_DOMAIN_FILTER }));
}

describe('pending custom domain filter', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  it('counts a domain waiting for its DNS record', async () => {
    assert.equal(await hasPendingDomain({ status: DomainStatus.PENDING_VERIFICATION }), true);
  });

  it('counts a live domain whose traffic does not reach the platform', async () => {
    assert.equal(
      await hasPendingDomain({
        status: DomainStatus.ACTIVE,
        routingState: DomainRoutingState.NOT_POINTED,
      }),
      true,
    );
  });

  it('ignores a live domain confirmed to reach the app', async () => {
    assert.equal(
      await hasPendingDomain({
        status: DomainStatus.ACTIVE,
        routingState: DomainRoutingState.LIVE,
      }),
      false,
    );
  });

  it('ignores a live domain whose routing was never checked', async () => {
    assert.equal(
      await hasPendingDomain({
        status: DomainStatus.ACTIVE,
        routingState: DomainRoutingState.UNKNOWN,
      }),
      false,
    );
  });

  it('ignores a removed domain', async () => {
    assert.equal(await hasPendingDomain({ status: DomainStatus.REMOVED }), false);
  });
});
