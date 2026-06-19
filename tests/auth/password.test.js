import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from '@hellodeploy/auth';

describe('password — hashPassword', () => {
  it('produces a non-empty hash string', async () => {
    const hash = await hashPassword('ValidPass1');
    assert.ok(typeof hash === 'string' && hash.length > 20);
  });

  it('different calls produce different hashes (salt)', async () => {
    const h1 = await hashPassword('ValidPass1');
    const h2 = await hashPassword('ValidPass1');
    assert.notEqual(h1, h2);
  });

  it('throws on empty password', async () => {
    await assert.rejects(() => hashPassword(''), /range/i);
  });

  it('throws on oversized password', async () => {
    await assert.rejects(() => hashPassword('A'.repeat(200)), /range/i);
  });
});

describe('password — verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('CorrectHorse1');
    assert.ok(await verifyPassword(hash, 'CorrectHorse1'));
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('CorrectHorse1');
    assert.ok(!(await verifyPassword(hash, 'WrongHorse1')));
  });

  it('returns false for empty password without throwing', async () => {
    const hash = await hashPassword('ValidPass1');
    assert.ok(!(await verifyPassword(hash, '')));
  });
});
