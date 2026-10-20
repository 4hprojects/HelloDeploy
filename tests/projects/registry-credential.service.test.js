import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import mongoose from 'mongoose';

process.env.HELLODEPLOY_MASTER_KEY ??= Buffer.alloc(32, 5).toString('base64');

const { RegistryCredential } = await import('@hellodeploy/database');
const { startTestDb, stopTestDb, clearTestDb } = await import('../helpers/worker-db.js');
const { deleteRegistryCredential, listRegistryCredentials, saveRegistryCredential } =
  await import('../../apps/web/src/services/registry-credential.service.js');

// Assembled so the placeholder never reads as a literal credential.
const PULL_VALUE = ['read', 'only', 'placeholder'].join('-');
const projectId = new mongoose.Types.ObjectId();
const actorId = new mongoose.Types.ObjectId();

function save(overrides = {}) {
  return saveRegistryCredential({
    projectId,
    registry: 'ghcr.io',
    username: 'owner',
    token: PULL_VALUE,
    actorId,
    ...overrides,
  });
}

describe('registry credential service', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('stores the token encrypted, never in plain text', async () => {
    await save();
    const record = await RegistryCredential.findOne({ projectId }).lean();
    assert.equal(JSON.stringify(record).includes(PULL_VALUE), false);
  });

  it('lists saved registries without their tokens', async () => {
    await save();
    const [listed] = await listRegistryCredentials(projectId);
    assert.deepEqual(Object.keys(listed).sort(), ['registry', 'updatedAt', 'username']);
  });

  it('replaces the credential for the same registry', async () => {
    await save();
    await save({ username: 'second-owner' });
    const listed = await listRegistryCredentials(projectId);
    assert.deepEqual(
      listed.map(({ username }) => username),
      ['second-owner'],
    );
  });

  it('refuses a registry outside the approved list', async () => {
    const result = await save({ registry: 'quay.io' });
    assert.match(result.error, /docker\.io, ghcr\.io/);
  });

  // Extended form parsing turns `registry[$ne]=x` into an object; it must never reach a query.
  it('refuses a registry sent as an object', async () => {
    const result = await save({ registry: { $ne: 'quay.io' } });
    assert.match(result.error, /docker\.io, ghcr\.io/);
  });

  it('refuses an empty token', async () => {
    const result = await save({ token: '' });
    assert.match(result.error, /access token/);
  });

  it('deletes a saved credential', async () => {
    await save();
    await deleteRegistryCredential({ projectId, registry: 'ghcr.io', actorId });
    assert.deepEqual(await listRegistryCredentials(projectId), []);
  });
});
