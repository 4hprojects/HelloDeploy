import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { getLiveVerificationTxtRecords } =
  await import('../../apps/web/src/services/domain.service.js');

describe('domain.service — getLiveVerificationTxtRecords', () => {
  it('joins multi-part TXT record segments into full strings', async () => {
    const fakeResolve = async (name) => {
      assert.equal(name, '_hellodeploy-verify.example.test');
      return [['hellodeploy-verify=', 'abc123']];
    };

    const records = await getLiveVerificationTxtRecords('example.test', fakeResolve);

    assert.deepEqual(records, ['hellodeploy-verify=abc123']);
  });

  it('returns null when no TXT record exists', async () => {
    const fakeResolve = async () => {
      throw new Error('ENOTFOUND');
    };

    const records = await getLiveVerificationTxtRecords('example.test', fakeResolve);

    assert.equal(records, null);
  });

  it('returns null when the lookup times out', async () => {
    const neverResolves = () => new Promise(() => {});

    const records = await getLiveVerificationTxtRecords('example.test', neverResolves);

    assert.equal(records, null);
  });
});
