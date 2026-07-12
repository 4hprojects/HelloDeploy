import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

describe('production worker routing validation', () => {
  const validator = new URL('../../scripts/validate-config.js', import.meta.url).pathname;
  const baseEnv = {
    ...process.env,
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/hellodeploy-test',
    HELLODEPLOY_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
    GITHUB_APP_ID: '',
    GITHUB_APP_NAME: '',
    GITHUB_APP_PRIVATE_KEY_PATH: '',
    GITHUB_APP_PRIVATE_KEY: '',
    GITHUB_WEBHOOK_SECRET: '',
  };

  function validateWorker(overrides) {
    return spawnSync(process.execPath, [validator, '--component', 'worker', '--json'], {
      encoding: 'utf8',
      env: { ...baseEnv, ...overrides },
    });
  }

  it('rejects disabled production routing without explicit acknowledgement', () => {
    const result = validateWorker({ NGINX_ENABLED: 'false', NGINX_DISABLED_ACK: 'false' });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /NGINX_DISABLED_ACK=true/);
  });

  it('accepts the local Nginx helper routing mode', () => {
    const result = validateWorker({ NGINX_ENABLED: 'true', NGINX_DISABLED_ACK: 'false' });
    assert.equal(result.status, 0, result.stdout || result.stderr);
  });

  it('accepts acknowledged external routing mode', () => {
    const result = validateWorker({ NGINX_ENABLED: 'false', NGINX_DISABLED_ACK: 'true' });
    assert.equal(result.status, 0, result.stdout || result.stderr);
  });
});
