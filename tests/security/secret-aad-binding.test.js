import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { EnvironmentSecret } from '@hellodeploy/database';
import { buildSecretAad, encrypt, decrypt } from '@hellodeploy/security';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

// A valid 32-byte key, set the way tests/security/encryption.test.js does. The
// suite must not depend on a developer's .env — CI has none, and these tests
// passed locally while failing there for exactly that reason.
const TEST_KEY = Buffer.alloc(32).toString('base64');
const ORIGINAL_KEY = process.env.HELLODEPLOY_MASTER_KEY;

before(() => {
  process.env.HELLODEPLOY_MASTER_KEY = TEST_KEY;
});

after(() => {
  if (ORIGINAL_KEY !== undefined) {
    process.env.HELLODEPLOY_MASTER_KEY = ORIGINAL_KEY;
  } else {
    delete process.env.HELLODEPLOY_MASTER_KEY;
  }
});

const { bindAllSecrets } = await import('../../scripts/bind-secret-aad.js');
const { getProjectEnvVars } = await import('../../apps/worker/src/deployment/secrets.js');

/**
 * A ciphertext with no additional authenticated data is valid wherever it is
 * placed, so write access to the collection is enough to move another project's
 * secret into one you own and read the plaintext back. Binding to projectId+name
 * is what makes a moved ciphertext fail to decrypt.
 */
describe('binding a secret ciphertext to its record', () => {
  it('decrypts with the AAD it was written with', () => {
    const aad = buildSecretAad({ projectId: 'p1', name: 'DATABASE_URL' });
    const payload = encrypt('postgres://secret', aad);

    assert.equal(decrypt({ ...payload, aad }), 'postgres://secret');
  });

  it('reports that it bound the ciphertext', () => {
    const aad = buildSecretAad({ projectId: 'p1', name: 'DATABASE_URL' });

    assert.equal(encrypt('postgres://secret', aad).aadBound, true);
  });

  it('refuses to decrypt under a different project', () => {
    const payload = encrypt('postgres://secret', buildSecretAad({ projectId: 'p1', name: 'X' }));

    assert.throws(() =>
      decrypt({ ...payload, aad: buildSecretAad({ projectId: 'p2', name: 'X' }) }),
    );
  });

  it('refuses to decrypt under a different secret name', () => {
    const payload = encrypt('postgres://secret', buildSecretAad({ projectId: 'p1', name: 'X' }));

    assert.throws(() =>
      decrypt({ ...payload, aad: buildSecretAad({ projectId: 'p1', name: 'Y' }) }),
    );
  });

  it('refuses to decrypt a bound ciphertext with no AAD at all', () => {
    const payload = encrypt('postgres://secret', buildSecretAad({ projectId: 'p1', name: 'X' }));

    assert.throws(() => decrypt({ ...payload, aad: undefined }));
  });

  it('still decrypts a record written before binding existed', () => {
    const legacy = encrypt('postgres://secret');

    assert.equal(legacy.aadBound, false);
    assert.equal(decrypt(legacy), 'postgres://secret');
  });
});

describe('migrating stored secrets onto AAD binding', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function legacySecret(projectId, name, value) {
    const payload = encrypt(value);
    return EnvironmentSecret.create({
      projectId,
      name,
      ciphertext: payload.ciphertext,
      iv: payload.iv,
      authTag: payload.authTag,
      encryptionVersion: payload.version,
      aadBound: false,
      createdBy: objectId(),
      updatedBy: objectId(),
    });
  }

  it('binds an unbound record', async () => {
    const projectId = objectId();
    await legacySecret(projectId, 'DATABASE_URL', 'postgres://secret');

    await bindAllSecrets();

    const stored = await EnvironmentSecret.findOne({ projectId }).lean();
    assert.equal(stored.aadBound, true);
  });

  it('leaves the plaintext readable through the worker after binding', async () => {
    const projectId = objectId();
    await legacySecret(projectId, 'DATABASE_URL', 'postgres://secret');
    await bindAllSecrets();

    const vars = await getProjectEnvVars(projectId);

    assert.equal(vars.DATABASE_URL, 'postgres://secret');
  });

  it('reads an unmigrated record just as well', async () => {
    const projectId = objectId();
    await legacySecret(projectId, 'API_KEY', 'plain-value');

    const vars = await getProjectEnvVars(projectId);

    assert.equal(vars.API_KEY, 'plain-value');
  });

  it('changes nothing on a second run', async () => {
    const projectId = objectId();
    await legacySecret(projectId, 'DATABASE_URL', 'postgres://secret');
    await bindAllSecrets();

    const { bound } = await bindAllSecrets();

    assert.equal(bound, 0);
  });

  it('fails to decrypt once a bound ciphertext is moved to another project', async () => {
    const victim = objectId();
    const attacker = objectId();
    await legacySecret(victim, 'DATABASE_URL', 'postgres://victim-secret');
    await legacySecret(attacker, 'DATABASE_URL', 'harmless');
    await bindAllSecrets();

    const stolen = await EnvironmentSecret.findOne({ projectId: victim }).lean();
    await EnvironmentSecret.updateOne(
      { projectId: attacker },
      {
        $set: {
          ciphertext: stolen.ciphertext,
          iv: stolen.iv,
          authTag: stolen.authTag,
          encryptionVersion: stolen.encryptionVersion,
          aadBound: true,
        },
      },
    );

    await assert.rejects(() => getProjectEnvVars(attacker));
  });
});
