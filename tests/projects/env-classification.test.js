import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EnvVarCategory, isPlatformManagedEnv } from '@hellodeploy/contracts';

import {
  classifyEnvironment,
  validateEnvValue,
} from '../../apps/web/src/services/env-classification.service.js';

const rowFor = (result, name) => result.rows.find((row) => row.name === name);

describe('environment classification', () => {
  it('asks for a required setting that is not stored', () => {
    const result = classifyEnvironment({ requiredKeys: ['DATABASE_URL'] });
    assert.equal(rowFor(result, 'DATABASE_URL').category, EnvVarCategory.REQUIRED_USER_INPUT);
  });

  it('blocks on a required setting that is not stored', () => {
    const result = classifyEnvironment({ requiredKeys: ['DATABASE_URL'] });
    assert.deepEqual(result.missingRequired, ['DATABASE_URL']);
  });

  it('stops asking once a required setting is stored', () => {
    const result = classifyEnvironment({
      requiredKeys: ['DATABASE_URL'],
      storedNames: ['DATABASE_URL'],
    });

    assert.deepEqual(result.missingRequired, []);
  });

  it('never blocks on an optional setting', () => {
    const result = classifyEnvironment({ optionalKeys: ['ANALYTICS_ID'] });
    assert.deepEqual(result.missingRequired, []);
  });

  it('marks a platform-managed setting as managed', () => {
    const result = classifyEnvironment({ storedNames: ['PORT'] });
    assert.equal(rowFor(result, 'PORT').category, EnvVarCategory.PLATFORM_MANAGED);
  });

  it('explains why a platform-managed setting is not the owner’s to set', () => {
    const result = classifyEnvironment({ storedNames: ['PORT'] });
    assert.match(rowFor(result, 'PORT').note, /chooses the port/);
  });

  it('keeps a stored setting detection did not mention', () => {
    const result = classifyEnvironment({ storedNames: ['LEGACY_TOKEN'] });
    assert.equal(rowFor(result, 'LEGACY_TOKEN').category, EnvVarCategory.DETECTED_EXISTING);
  });

  it('lists a blocking setting before the others', () => {
    const result = classifyEnvironment({
      requiredKeys: ['DATABASE_URL'],
      optionalKeys: ['ANALYTICS_ID'],
      storedNames: ['PORT'],
    });

    assert.equal(result.rows[0].name, 'DATABASE_URL');
  });

  it('lists each setting once even when detected and stored', () => {
    const result = classifyEnvironment({
      requiredKeys: ['DATABASE_URL'],
      optionalKeys: ['DATABASE_URL'],
      storedNames: ['DATABASE_URL'],
    });

    assert.equal(result.rows.filter((row) => row.name === 'DATABASE_URL').length, 1);
  });

  it('compares names case-insensitively against what is stored', () => {
    const result = classifyEnvironment({
      requiredKeys: ['database_url'],
      storedNames: ['DATABASE_URL'],
    });

    assert.deepEqual(result.missingRequired, []);
  });
});

describe('environment value format checks', () => {
  it('rejects an empty value', () => {
    assert.match(validateEnvValue('ANY_NAME', '   '), /Enter a value/);
  });

  it('rejects a database address that is not an address', () => {
    assert.match(validateEnvValue('DATABASE_URL', 'my-database'), /should be a web or database/);
  });

  it('accepts a postgres connection string', () => {
    assert.equal(validateEnvValue('DATABASE_URL', 'postgres://user:pw@host:5432/db'), null);
  });

  it('accepts an https url', () => {
    assert.equal(validateEnvValue('SUPABASE_URL', 'https://example.supabase.co'), null);
  });

  it('rejects a non-numeric port', () => {
    assert.match(validateEnvValue('REDIS_PORT', 'sixty'), /should be a number/);
  });

  it('accepts an opaque secret with no format rule', () => {
    assert.equal(validateEnvValue('SUPABASE_ANON_KEY', 'ey.some.token'), null);
  });

  it('makes no remote call to decide a value is usable', () => {
    // A syntactically valid address is accepted even if nothing is listening.
    assert.equal(validateEnvValue('DATABASE_URL', 'postgres://nobody@127.0.0.1:1/none'), null);
  });
});

describe('platform-managed names', () => {
  it('treats PORT as managed', () => {
    assert.equal(isPlatformManagedEnv('PORT'), true);
  });

  it('treats NODE_ENV as managed', () => {
    assert.equal(isPlatformManagedEnv('NODE_ENV'), true);
  });

  it('ignores case when deciding', () => {
    assert.equal(isPlatformManagedEnv('port'), true);
  });

  it('leaves an ordinary setting alone', () => {
    assert.equal(isPlatformManagedEnv('DATABASE_URL'), false);
  });
});
