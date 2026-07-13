import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import {
  assertAllOrNoneEnvironment,
  assertPairedEnvironment,
  assertProductionSecrets,
  parseHostnameEnv,
  parseIntegerEnv,
} from '@hellodeploy/contracts';

describe('environment validation', () => {
  it('forces production mode through both service start commands', async () => {
    for (const component of ['web', 'worker']) {
      const packageJson = JSON.parse(
        await readFile(new URL(`../../apps/${component}/package.json`, import.meta.url), 'utf8'),
      );
      assert.match(packageJson.scripts.start, /^NODE_ENV=production /);
      assert.match(packageJson.scripts.start, /--env-file-if-exists=\.\.\/\.\.\/\.env/);
    }
  });

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

  it('normalizes valid hostnames and rejects Nginx-unsafe domain values', () => {
    assert.equal(parseHostnameEnv('DEPLOYMENT_DOMAIN', 'Apps.Example.COM'), 'apps.example.com');
    for (const value of [
      'https://apps.example.com',
      '*.apps.example.com',
      'apps.example.com:443',
      'apps.example.com/path',
      'apps.example.com; include evil.conf',
    ]) {
      assert.throws(() => parseHostnameEnv('DEPLOYMENT_DOMAIN', value), /DEPLOYMENT_DOMAIN/);
    }
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
    REDIS_URL: '',
    PLATFORM_DOMAIN: 'hellodeploy.example.test',
    DEPLOYMENT_DOMAIN: 'apps.hellodeploy.example.test',
    PLATFORM_SUBDOMAIN_SUFFIX: '.apps.hellodeploy.example.test',
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

  it('prefers managed TLS Redis URL configuration and reports only its mode', () => {
    const sentinel = 'redis-password-must-not-appear';
    const result = validateWorker({
      REDIS_URL: `rediss://user:${sentinel}@managed.example.test:6380/0`,
      REDIS_HOST: 'ignored.example.test',
      REDIS_PORT: 'not-a-port',
      REDIS_PASSWORD: 'ignored-password',
      NGINX_ENABLED: 'false',
      NGINX_DISABLED_ACK: 'true',
    });
    assert.equal(result.status, 0, result.stdout || result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(
      output.results[0].checks.find((check) => check.name === 'redis'),
      { name: 'redis', status: 'managed-tls-url' },
    );
    assert.doesNotMatch(result.stdout, new RegExp(sentinel));
    assert.doesNotMatch(result.stderr, new RegExp(sentinel));
  });

  it('rejects insecure remote Redis in production without exposing its URL', () => {
    const sentinel = 'insecure-redis-password-must-not-appear';
    const result = validateWorker({
      REDIS_URL: `redis://user:${sentinel}@managed.example.test:6379/0`,
      NGINX_ENABLED: 'false',
      NGINX_DISABLED_ACK: 'true',
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /requires a rediss:\/\//);
    assert.doesNotMatch(result.stdout, new RegExp(sentinel));
    assert.doesNotMatch(result.stderr, new RegExp(sentinel));
  });

  it('rejects unsafe or inconsistent production deployment domains', () => {
    const unsafe = validateWorker({
      DEPLOYMENT_DOMAIN: 'apps.example.test; include evil.conf',
      NGINX_ENABLED: 'false',
      NGINX_DISABLED_ACK: 'true',
    });
    assert.equal(unsafe.status, 1);
    assert.match(unsafe.stdout, /DEPLOYMENT_DOMAIN must be a valid hostname/);
    assert.doesNotMatch(unsafe.stdout, /include evil/);

    const webResult = spawnSync(process.execPath, [validator, '--component', 'web', '--json'], {
      encoding: 'utf8',
      env: {
        ...baseEnv,
        SESSION_SECRET: 's'.repeat(64),
        PLATFORM_SUBDOMAIN_SUFFIX: '.different.example.test',
        NGINX_ENABLED: 'false',
        NGINX_DISABLED_ACK: 'true',
      },
    });
    assert.equal(webResult.status, 1);
    assert.match(webResult.stdout, /PLATFORM_SUBDOMAIN_SUFFIX/);
  });

  it('reports configuration names and statuses without values', () => {
    const sentinel = 'must-not-appear-in-diagnostics';
    const result = validateWorker({
      NGINX_ENABLED: 'false',
      NGINX_DISABLED_ACK: 'true',
      REDIS_PASSWORD: sentinel,
      RESEND_API_KEY: sentinel,
    });
    assert.equal(result.status, 0, result.stdout || result.stderr);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(
      output.results[0].checks.find((check) => check.name === 'runtime'),
      { name: 'runtime', status: 'production' },
    );
    assert.deepEqual(
      output.results[0].checks.find((check) => check.name === 'routing'),
      { name: 'routing', status: 'external-router' },
    );
    assert.deepEqual(
      output.results[0].checks.find((check) => check.name === 'email'),
      { name: 'email', status: 'configured' },
    );
    assert.doesNotMatch(result.stdout, new RegExp(sentinel));
    assert.doesNotMatch(result.stderr, new RegExp(sentinel));
  });

  it('rejects non-production mode when production validation is required', () => {
    const result = spawnSync(
      process.execPath,
      [validator, '--component', 'worker', '--require-production', '--json'],
      {
        encoding: 'utf8',
        env: {
          ...baseEnv,
          NODE_ENV: 'development',
          NGINX_ENABLED: 'false',
          NGINX_DISABLED_ACK: 'true',
        },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stdout, /NODE_ENV must be production/);
  });

  it('labels partially populated integration groups as incomplete', () => {
    const result = validateWorker({
      NGINX_ENABLED: 'false',
      NGINX_DISABLED_ACK: 'true',
      GITHUB_APP_ID: 'configured-id',
      GITHUB_APP_PRIVATE_KEY_PATH: '',
      GITHUB_APP_PRIVATE_KEY: '',
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Missing: GITHUB_APP_PRIVATE_KEY/);

    const developmentResult = spawnSync(
      process.execPath,
      [validator, '--component', 'worker', '--json'],
      {
        encoding: 'utf8',
        env: {
          ...baseEnv,
          NODE_ENV: 'development',
          GITHUB_APP_ID: 'configured-id',
          GITHUB_APP_PRIVATE_KEY_PATH: '',
          GITHUB_APP_PRIVATE_KEY: '',
        },
      },
    );
    assert.equal(developmentResult.status, 0, developmentResult.stdout || developmentResult.stderr);
    const output = JSON.parse(developmentResult.stdout);
    assert.deepEqual(
      output.results[0].checks.find((check) => check.name === 'github-app'),
      { name: 'github-app', status: 'incomplete' },
    );
  });

  it('keeps invalid configuration values out of failure diagnostics', () => {
    const sentinel = 'invalid-secret-value-must-not-appear';
    const result = validateWorker({
      HELLODEPLOY_MASTER_KEY: sentinel,
      NGINX_ENABLED: 'true',
      NGINX_DISABLED_ACK: 'false',
    });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /HELLODEPLOY_MASTER_KEY/);
    assert.doesNotMatch(result.stdout, new RegExp(sentinel));
    assert.doesNotMatch(result.stderr, new RegExp(sentinel));
  });
});
