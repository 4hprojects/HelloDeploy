import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertAllOrNoneEnvironment,
  assertPairedEnvironment,
  assertProductionSecrets,
  parseIntegerEnv,
} from '@hellodeploy/contracts';

describe('environment validation', () => {
  it('accepts bounded integer environment values', () => {
    assert.equal(parseIntegerEnv('PORT', '3000', { min: 1, max: 65535 }), 3000);
  });

  it('rejects partial, fractional, unsafe, and out-of-range integers', () => {
    for (const value of ['3000x', '1.5', '9007199254740993', '0']) {
      assert.throws(() => parseIntegerEnv('PORT', value, { min: 1, max: 65535 }), /PORT/);
    }
  });

  it('requires paired integration keys together', () => {
    assert.doesNotThrow(() => assertPairedEnvironment('SITE', '', 'SECRET', ''));
    assert.doesNotThrow(() => assertPairedEnvironment('SITE', 'set', 'SECRET', 'set'));
    assert.throws(() => assertPairedEnvironment('SITE', 'set', 'SECRET', ''), /both be set/);
  });

  it('identifies missing fields in partially configured integrations', () => {
    assert.throws(
      () =>
        assertAllOrNoneEnvironment(
          [
            ['APP_ID', 'set'],
            ['PRIVATE_KEY', ''],
          ],
          'Example',
        ),
      /Missing: PRIVATE_KEY/,
    );
  });

  it('requires strong production session and encryption secrets', () => {
    const masterKey = Buffer.alloc(32, 7).toString('base64');
    assert.doesNotThrow(() =>
      assertProductionSecrets({ sessionSecret: 's'.repeat(64), masterKey }),
    );
    assert.throws(
      () => assertProductionSecrets({ sessionSecret: 'short', masterKey }),
      /SESSION_SECRET/,
    );
    assert.throws(
      () => assertProductionSecrets({ sessionSecret: 's'.repeat(64), masterKey: 'not-base64' }),
      /HELLODEPLOY_MASTER_KEY/,
    );
  });
});
