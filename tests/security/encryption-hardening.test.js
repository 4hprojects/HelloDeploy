import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

// Each test uses its own master key to avoid crosstalk
const KEY_A = Buffer.alloc(32, 0xAA).toString('base64');
const KEY_B = Buffer.alloc(32, 0xBB).toString('base64');

describe('Encryption hardening', () => {
  before(() => { process.env.HELLODEPLOY_MASTER_KEY = KEY_A; });
  after(() => { delete process.env.HELLODEPLOY_MASTER_KEY; });

  it('every ciphertext is unique (IVs are random)', async () => {
    const { encrypt } = await import('../../packages/security/src/encryption.js');
    const a = encrypt('hello');
    const b = encrypt('hello');
    assert.notEqual(a.iv, b.iv, 'IVs must differ between encryptions');
    assert.notEqual(a.ciphertext, b.ciphertext, 'ciphertexts must differ');
  });

  it('decryption fails with a different master key', async () => {
    process.env.HELLODEPLOY_MASTER_KEY = KEY_A;
    const { encrypt } = await import('../../packages/security/src/encryption.js');
    const payload = encrypt('sensitive-value');

    process.env.HELLODEPLOY_MASTER_KEY = KEY_B;
    const { decrypt } = await import('../../packages/security/src/encryption.js');
    assert.throws(() => decrypt(payload), /auth|decipher/i);

    process.env.HELLODEPLOY_MASTER_KEY = KEY_A;
  });

  it('decryption fails if any byte of ciphertext is altered', async () => {
    const { encrypt, decrypt } = await import('../../packages/security/src/encryption.js');
    const payload = encrypt('secret');
    const ctBytes = Buffer.from(payload.ciphertext, 'base64');
    ctBytes[0] ^= 0xff; // flip bits in first byte
    const tampered = { ...payload, ciphertext: ctBytes.toString('base64') };
    assert.throws(() => decrypt(tampered));
  });

  it('decryption fails if IV is altered', async () => {
    const { encrypt, decrypt } = await import('../../packages/security/src/encryption.js');
    const payload = encrypt('secret');
    const ivBytes = Buffer.from(payload.iv, 'base64');
    ivBytes[0] ^= 0xff;
    const tampered = { ...payload, iv: ivBytes.toString('base64') };
    assert.throws(() => decrypt(tampered));
  });

  it('authTag length is exactly 16 bytes (128-bit GCM tag)', async () => {
    const { encrypt } = await import('../../packages/security/src/encryption.js');
    const { authTag } = encrypt('test');
    const raw = Buffer.from(authTag, 'base64');
    assert.equal(raw.length, 16);
  });
});
