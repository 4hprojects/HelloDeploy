import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { EnvironmentSecret } from '@hellodeploy/database';
import { encrypt, decrypt } from '@hellodeploy/security';
import {
  startApprovalTestDb,
  stopApprovalTestDb,
  clearApprovalTestDb,
  approvalObjectId,
} from '../helpers/approval-db.js';

const PRIMARY_KEY = Buffer.alloc(32, 1).toString('base64');
const NEXT_KEY = Buffer.alloc(32, 2).toString('base64');

process.env.HELLODEPLOY_MASTER_KEY = PRIMARY_KEY;

const { rotateAllSecrets } = await import('../../scripts/rotate-master-key.js');

async function seedSecret(plaintext) {
  const payload = encrypt(plaintext);
  return EnvironmentSecret.create({
    projectId: approvalObjectId(),
    name: 'DATABASE_URL',
    ciphertext: payload.ciphertext,
    iv: payload.iv,
    authTag: payload.authTag,
    encryptionVersion: payload.version,
    createdBy: approvalObjectId(),
    updatedBy: approvalObjectId(),
  });
}

describe('rotateAllSecrets', () => {
  before(async () => {
    await startApprovalTestDb();
  });
  after(async () => {
    await stopApprovalTestDb();
  });
  beforeEach(async () => {
    await clearApprovalTestDb();
    delete process.env.HELLODEPLOY_MASTER_KEY_NEXT;
  });

  it('re-encrypts every version-1 secret to version 2 under the next key', async () => {
    const secret = await seedSecret('super-secret-value');
    process.env.HELLODEPLOY_MASTER_KEY_NEXT = NEXT_KEY;

    const { rotated, failed } = await rotateAllSecrets();

    assert.equal(rotated, 1);
    assert.equal(failed, 0);
    const fresh = await EnvironmentSecret.findById(secret._id).lean();
    assert.equal(fresh.encryptionVersion, 2);
  });

  it('preserves the original plaintext across rotation', async () => {
    const secret = await seedSecret('postgresql://user:pass@host/db');
    process.env.HELLODEPLOY_MASTER_KEY_NEXT = NEXT_KEY;

    await rotateAllSecrets();

    const fresh = await EnvironmentSecret.findById(secret._id).lean();
    const plaintext = decrypt({
      ciphertext: fresh.ciphertext,
      iv: fresh.iv,
      authTag: fresh.authTag,
      version: fresh.encryptionVersion,
    });
    assert.equal(plaintext, 'postgresql://user:pass@host/db');
  });

  it('preserves the plaintext after the next key is promoted and unset', async () => {
    const secret = await seedSecret('survives-promotion');
    process.env.HELLODEPLOY_MASTER_KEY_NEXT = NEXT_KEY;
    await rotateAllSecrets();

    const fresh = await EnvironmentSecret.findById(secret._id).lean();
    process.env.HELLODEPLOY_MASTER_KEY = NEXT_KEY;
    delete process.env.HELLODEPLOY_MASTER_KEY_NEXT;
    try {
      assert.equal(
        decrypt({
          ciphertext: fresh.ciphertext,
          iv: fresh.iv,
          authTag: fresh.authTag,
          version: fresh.encryptionVersion,
        }),
        'survives-promotion',
      );
    } finally {
      process.env.HELLODEPLOY_MASTER_KEY = PRIMARY_KEY;
    }
  });

  it('is idempotent — a second run finds nothing left to rotate', async () => {
    await seedSecret('one-time-secret');
    process.env.HELLODEPLOY_MASTER_KEY_NEXT = NEXT_KEY;
    await rotateAllSecrets();

    const { rotated, failed } = await rotateAllSecrets();

    assert.equal(rotated, 0);
    assert.equal(failed, 0);
  });
});
