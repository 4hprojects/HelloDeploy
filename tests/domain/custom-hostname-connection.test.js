import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Domain } from '@hellodeploy/database';
import { DomainStatus } from '@hellodeploy/contracts';

import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

// Env is read when the service loads; Cloudflare itself is replaced by fakeClient.
process.env.CLOUDFLARE_API_TOKEN = 'test-token';
process.env.CLOUDFLARE_ZONE_ID = 'test-zone';
process.env.CUSTOM_HOSTNAME_TARGET = 'customers.hellodeploy.online';

const { CERTIFICATE_PENDING_DETAIL, checkDomainRouting, connectCustomHostname, removeDomain } =
  await import('../../apps/web/src/services/domain.service.js');

function fakeClient(overrides = {}) {
  const calls = { register: [], get: [], remove: [] };
  const client = {
    register: async (hostname) => {
      calls.register.push(hostname);
      return {
        ok: true,
        result: { id: 'cf-1', hostname, status: 'pending', ssl: { status: 'pending_validation' } },
      };
    },
    get: async (id) => {
      calls.get.push(id);
      return { ok: true, result: { id, status: 'active', ssl: { status: 'pending_validation' } } };
    },
    remove: async (id) => {
      calls.remove.push(id);
      return { ok: true, result: { id } };
    },
    // An otherwise empty zone: only this client's own registrations count.
    count: async () => ({ ok: true, result: calls.register.length - calls.remove.length }),
    ...overrides,
  };
  return { client, calls };
}

async function createDomain(fields = {}) {
  const projectId = objectId();
  const domain = await Domain.create({
    projectId,
    hostnameNormalized: 'helloeventhub.online',
    addedBy: objectId(),
    status: DomainStatus.ACTIVE,
    ...fields,
  });
  return { domain, projectId };
}

describe('connecting a custom domain without an administrator', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  it('registers a verified domain with Cloudflare and stores its id', async () => {
    const { domain, projectId } = await createDomain();
    const { client } = fakeClient();

    await connectCustomHostname(domain._id, projectId, objectId(), { customHostnames: client });

    const fresh = await Domain.findById(domain._id).lean();
    assert.equal(fresh.cfCustomHostnameId, 'cf-1');
  });

  it('refreshes an already registered domain instead of registering it again', async () => {
    const { domain, projectId } = await createDomain({ cfCustomHostnameId: 'cf-1' });
    const { client, calls } = fakeClient();

    await connectCustomHostname(domain._id, projectId, objectId(), { customHostnames: client });

    assert.deepEqual(calls.register, []);
  });

  it('refuses a domain whose ownership is not verified yet', async () => {
    const { domain, projectId } = await createDomain({
      status: DomainStatus.PENDING_VERIFICATION,
    });
    const { client } = fakeClient();

    const result = await connectCustomHostname(domain._id, projectId, objectId(), {
      customHostnames: client,
    });

    assert.equal(result.success, false);
  });

  it('says the feature is unavailable when it is not configured', async () => {
    const { domain, projectId } = await createDomain();

    const result = await connectCustomHostname(domain._id, projectId, objectId(), {
      customHostnames: null,
    });

    assert.match(result.error, /administrator will prepare your record/);
  });

  it('stores nothing when Cloudflare refuses the registration', async () => {
    const { domain, projectId } = await createDomain();
    const { client } = fakeClient({
      register: async () => ({ ok: false, code: 10000, error: 'Authentication error' }),
    });

    await connectCustomHostname(domain._id, projectId, objectId(), { customHostnames: client });

    const fresh = await Domain.findById(domain._id).lean();
    assert.equal(fresh.cfCustomHostnameId, null);
  });

  it('removes the Cloudflare hostname when the owner removes the domain', async () => {
    const { domain, projectId } = await createDomain({
      status: DomainStatus.FAILED,
      cfCustomHostnameId: 'cf-1',
    });
    const { client, calls } = fakeClient();

    await removeDomain(domain._id, projectId, objectId(), { customHostnames: client });

    assert.deepEqual(calls.remove, ['cf-1']);
  });

  it('registers a verified domain on its first routing check', async () => {
    const { domain, projectId } = await createDomain();
    const { client } = fakeClient();

    const result = await checkDomainRouting(
      domain._id,
      projectId,
      async () => new Response('', { status: 525 }),
      { customHostnames: client },
    );

    assert.equal(result.recordReady, true);
  });

  it('says the certificate is on its way once Cloudflare sees the record', async () => {
    const { domain, projectId } = await createDomain({ cfCustomHostnameId: 'cf-1' });
    const { client } = fakeClient();

    const result = await checkDomainRouting(
      domain._id,
      projectId,
      async () => new Response('', { status: 525 }),
      { customHostnames: client },
    );

    assert.equal(result.detail, CERTIFICATE_PENDING_DETAIL);
  });

  it('refuses a new hostname once the platform has 100', async () => {
    const { domain, projectId } = await createDomain();
    const { client } = fakeClient({ count: async () => ({ ok: true, result: 100 }) });

    const result = await connectCustomHostname(domain._id, projectId, objectId(), {
      customHostnames: client,
    });

    assert.match(result.error, /can't connect more custom domains right now/);
  });

  it('never asks Cloudflare to register at the limit', async () => {
    const { domain, projectId } = await createDomain();
    const { client, calls } = fakeClient({ count: async () => ({ ok: true, result: 100 }) });

    await connectCustomHostname(domain._id, projectId, objectId(), { customHostnames: client });

    assert.deepEqual(calls.register, []);
  });

  it('refuses to register when the count is unknown', async () => {
    const { domain, projectId } = await createDomain();
    const { client, calls } = fakeClient({
      count: async () => ({ ok: false, code: null, error: 'timed out' }),
    });

    await connectCustomHostname(domain._id, projectId, objectId(), { customHostnames: client });

    assert.deepEqual(calls.register, []);
  });

  it('backs out its own hostname when a simultaneous registration crossed the limit', async () => {
    const { domain, projectId } = await createDomain();
    let counted = 0;
    const { client, calls } = fakeClient({
      count: async () => ({ ok: true, result: counted++ === 0 ? 99 : 101 }),
    });

    await connectCustomHostname(domain._id, projectId, objectId(), { customHostnames: client });

    assert.deepEqual(calls.remove, ['cf-1']);
  });

  it('stores no id for a backed-out hostname', async () => {
    const { domain, projectId } = await createDomain();
    let counted = 0;
    const { client } = fakeClient({
      count: async () => ({ ok: true, result: counted++ === 0 ? 99 : 101 }),
    });

    await connectCustomHostname(domain._id, projectId, objectId(), { customHostnames: client });

    const fresh = await Domain.findById(domain._id).lean();
    assert.equal(fresh.cfCustomHostnameId, null);
  });

  it('keeps refreshing an already registered domain at the limit', async () => {
    const { domain, projectId } = await createDomain({ cfCustomHostnameId: 'cf-1' });
    const { client } = fakeClient({ count: async () => ({ ok: true, result: 100 }) });

    const result = await connectCustomHostname(domain._id, projectId, objectId(), {
      customHostnames: client,
    });

    assert.equal(result.success, true);
  });
});
