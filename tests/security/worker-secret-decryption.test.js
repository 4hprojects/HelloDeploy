import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { EnvironmentSecret } from '@hellodeploy/database';
import { encrypt } from '@hellodeploy/security';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject } from '../helpers/worker-fixtures.js';

// Encryption reads the master key from the environment at call time.
const TEST_KEY = Buffer.alloc(32).toString('base64');
const ORIGINAL_KEY = process.env.HELLODEPLOY_MASTER_KEY;

const { getProjectEnvVars } = await import('../../apps/worker/src/deployment/secrets.js');

async function storeSecret(projectId, name, value) {
  const sealed = encrypt(value);
  const actor = objectId();
  return EnvironmentSecret.create({
    projectId,
    name,
    ciphertext: sealed.ciphertext,
    iv: sealed.iv,
    authTag: sealed.authTag,
    encryptionVersion: sealed.version,
    createdBy: actor,
    updatedBy: actor,
  });
}

describe('getProjectEnvVars', () => {
  before(async () => {
    process.env.HELLODEPLOY_MASTER_KEY = TEST_KEY;
    await startTestDb();
  });
  after(async () => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.HELLODEPLOY_MASTER_KEY;
    } else {
      process.env.HELLODEPLOY_MASTER_KEY = ORIGINAL_KEY;
    }
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('round-trips a stored secret back to its plaintext', async () => {
    const project = await createProject();
    await storeSecret(project._id, 'API_KEY', 'super-secret-value');
    const vars = await getProjectEnvVars(project._id);
    assert.equal(vars.API_KEY, 'super-secret-value');
  });

  it('returns every secret the project owns', async () => {
    const project = await createProject();
    await storeSecret(project._id, 'ONE', '1');
    await storeSecret(project._id, 'TWO', '2');
    const vars = await getProjectEnvVars(project._id);
    assert.deepEqual(vars, { ONE: '1', TWO: '2' });
  });

  it('never returns another project’s secrets', async () => {
    const mine = await createProject();
    const theirs = await createProject();
    await storeSecret(theirs._id, 'THEIR_KEY', 'not-yours');
    const vars = await getProjectEnvVars(mine._id);
    assert.deepEqual(vars, {});
  });

  it('returns an empty map for a project with no secrets', async () => {
    const project = await createProject();
    assert.deepEqual(await getProjectEnvVars(project._id), {});
  });

  it('preserves a value containing characters that survive encryption badly', async () => {
    const project = await createProject();
    await storeSecret(project._id, 'TRICKY', 'a=b&c "quoted" — ünïcode');
    const vars = await getProjectEnvVars(project._id);
    assert.equal(vars.TRICKY, 'a=b&c "quoted" — ünïcode');
  });
});
