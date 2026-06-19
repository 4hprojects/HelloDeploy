import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

// Use a valid 32-byte key (base64 of 32 zero bytes)
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

const { encrypt, decrypt } = await import('../../packages/security/src/encryption.js');

describe('encrypt', () => {
  it('returns ciphertext, iv, authTag, and version', () => {
    const result = encrypt('hello world');
    assert.ok(result.ciphertext, 'ciphertext missing');
    assert.ok(result.iv, 'iv missing');
    assert.ok(result.authTag, 'authTag missing');
    assert.equal(result.version, 1);
  });

  it('produces different ciphertext each call (unique IV)', () => {
    const a = encrypt('same plaintext');
    const b = encrypt('same plaintext');
    assert.notEqual(a.ciphertext, b.ciphertext);
    assert.notEqual(a.iv, b.iv);
  });

  it('stores IV as 16-char base64 (12 raw bytes)', () => {
    const { iv } = encrypt('x');
    const raw = Buffer.from(iv, 'base64');
    assert.equal(raw.length, 12, `expected 12-byte IV, got ${raw.length}`);
  });

  it('stores authTag as 24-char base64 (16 raw bytes)', () => {
    const { authTag } = encrypt('x');
    const raw = Buffer.from(authTag, 'base64');
    assert.equal(raw.length, 16, `expected 16-byte authTag, got ${raw.length}`);
  });

  it('throws when HELLODEPLOY_MASTER_KEY is not set', () => {
    const saved = process.env.HELLODEPLOY_MASTER_KEY;
    delete process.env.HELLODEPLOY_MASTER_KEY;
    try {
      assert.throws(() => encrypt('x'), /HELLODEPLOY_MASTER_KEY/);
    } finally {
      process.env.HELLODEPLOY_MASTER_KEY = saved;
    }
  });

  it('throws when key is wrong length (not 32 bytes)', () => {
    const saved = process.env.HELLODEPLOY_MASTER_KEY;
    process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(16).toString('base64'); // 16 bytes
    try {
      assert.throws(() => encrypt('x'), /32 bytes/);
    } finally {
      process.env.HELLODEPLOY_MASTER_KEY = saved;
    }
  });
});

describe('decrypt', () => {
  it('round-trips a simple string', () => {
    const plaintext = 'postgresql://user:pass@host/db';
    const payload = encrypt(plaintext);
    assert.equal(decrypt(payload), plaintext);
  });

  it('round-trips unicode', () => {
    const plaintext = 'secret: 🔑 émoji café';
    assert.equal(decrypt(encrypt(plaintext)), plaintext);
  });

  it('round-trips an empty string', () => {
    assert.equal(decrypt(encrypt('')), '');
  });

  it('throws on tampered ciphertext (authentication failure)', () => {
    const payload = encrypt('original');
    const tampered = {
      ...payload,
      ciphertext: Buffer.from('tampered').toString('base64'),
    };
    assert.throws(() => decrypt(tampered));
  });

  it('throws on tampered authTag', () => {
    const payload = encrypt('original');
    const tampered = { ...payload, authTag: Buffer.alloc(16).toString('base64') };
    assert.throws(() => decrypt(tampered));
  });

  it('throws on unsupported version', () => {
    const payload = { ...encrypt('x'), version: 99 };
    assert.throws(() => decrypt(payload), /Unsupported encryption version/);
  });
});
