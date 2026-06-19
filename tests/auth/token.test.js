import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateRawToken, hashToken, generateToken } from '@hellodeploy/auth';

describe('token — generateRawToken', () => {
  it('returns a hex string of 2*byteLength chars', () => {
    const t = generateRawToken(32);
    assert.equal(t.length, 64);
    assert.match(t, /^[0-9a-f]+$/);
  });

  it('each call produces a unique value', () => {
    assert.notEqual(generateRawToken(32), generateRawToken(32));
  });
});

describe('token — hashToken', () => {
  it('produces a 64-char SHA-256 hex digest', () => {
    const h = hashToken('abc');
    assert.equal(h.length, 64);
    assert.match(h, /^[0-9a-f]+$/);
  });

  it('is deterministic', () => {
    assert.equal(hashToken('test'), hashToken('test'));
  });

  it('different inputs produce different hashes', () => {
    assert.notEqual(hashToken('a'), hashToken('b'));
  });
});

describe('token — generateToken', () => {
  it('returns raw and hash pair', () => {
    const { raw, hash } = generateToken(32);
    assert.equal(raw.length, 64);
    assert.equal(hash.length, 64);
    assert.equal(hash, hashToken(raw));
  });
});
