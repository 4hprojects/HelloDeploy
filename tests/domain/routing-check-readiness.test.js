import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Domain } from '@hellodeploy/database';
import { DomainStatus } from '@hellodeploy/contracts';

import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import {
  checkDomainRouting,
  ROUTING_RECORD_NOT_READY_DETAIL,
} from '../../apps/web/src/services/domain.service.js';

// Cloudflare's answer while the owner's old A records are still proxied.
const cloudflare525 = async () => new Response('', { status: 525 });

async function check(fields) {
  const projectId = objectId();
  const domain = await Domain.create({
    projectId,
    hostnameNormalized: 'helloeventhub.online',
    addedBy: objectId(),
    status: DomainStatus.ACTIVE,
    ...fields,
  });
  return checkDomainRouting(domain._id, projectId, cloudflare525);
}

describe('routing check before and after the CNAME record exists', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  it('tells a waiting owner there is nothing to do yet', async () => {
    const result = await check({});
    assert.equal(result.detail, ROUTING_RECORD_NOT_READY_DETAIL);
  });

  it('tells an owner with a record to replace the old records', async () => {
    const result = await check({ tunnelId: '79fad542-82f7-4225-b917-4fcdb042e280' });
    assert.match(result.detail, /Replace them with the CNAME record shown above/);
  });
});
