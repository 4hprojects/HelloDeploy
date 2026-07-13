import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { EnvironmentSecret } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

import {
  bulkUpdateSecrets,
  MAX_ENV_FILE_BYTES,
  MAX_ENV_FILE_SECRETS,
  getDecryptedSecrets,
  importEnvFile,
  parseEnvFile,
  revealSecretValue,
} from '../../apps/web/src/services/env-secret.service.js';

process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

describe('.env file parsing', () => {
  it('parses comments, exports, quoted values, and inline comments', () => {
    const result = parseEnvFile(`
# application configuration
DATABASE_URL="mongodb://db/app?retryWrites=true"
export API_KEY='secret value'
PORT=3000 # runtime port
`);

    assert.equal(result.success, true);
    assert.deepEqual(result.entries, [
      ['DATABASE_URL', 'mongodb://db/app?retryWrites=true'],
      ['API_KEY', 'secret value'],
      ['PORT', '3000'],
    ]);
  });

  it('rejects invalid names without including the secret value in the error', () => {
    const secretValue = 'must-not-leak';
    const result = parseEnvFile(`lowercase=${secretValue}`);

    assert.equal(result.success, false);
    assert.match(result.error, /Invalid variable name on line 1/);
    assert.doesNotMatch(result.error, new RegExp(secretValue));
  });

  it('validates the whole file for malformed, empty, and duplicate assignments', () => {
    assert.match(parseEnvFile('NOT AN ASSIGNMENT').error, /line 1/);
    assert.match(parseEnvFile('EMPTY=').error, /has no value/);
    assert.match(parseEnvFile('KEY=one\nKEY=two').error, /defined more than once/);
  });

  it('enforces bounded file and variable counts', () => {
    assert.match(parseEnvFile(`KEY=${'a'.repeat(MAX_ENV_FILE_BYTES)}`).error, /64 KB/);

    const tooMany = Array.from(
      { length: MAX_ENV_FILE_SECRETS + 1 },
      (_, index) => `KEY_${index}=value`,
    ).join('\n');
    assert.match(parseEnvFile(tooMany).error, /at most 100 variables/);
  });
});

describe('.env file import', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  it('encrypts imported values and updates existing variables', async () => {
    const projectId = objectId();
    const actorId = objectId();

    const first = await importEnvFile(projectId, 'API_KEY=first\nPORT=3000', actorId);
    const second = await importEnvFile(projectId, 'API_KEY=rotated', actorId);

    assert.deepEqual(first, { success: true, count: 2 });
    assert.deepEqual(second, { success: true, count: 1 });
    assert.equal(await EnvironmentSecret.countDocuments({ projectId }), 2);
    assert.deepEqual(await getDecryptedSecrets(projectId), {
      API_KEY: 'rotated',
      PORT: '3000',
    });

    const stored = await EnvironmentSecret.findOne({ projectId, name: 'API_KEY' }).lean();
    assert.notEqual(stored.ciphertext, 'rotated');
  });

  it('writes nothing when any assignment fails validation', async () => {
    const projectId = objectId();
    const result = await importEnvFile(
      projectId,
      'VALID=value\nlowercase=must-not-be-written',
      objectId(),
    );

    assert.equal(result.success, false);
    assert.equal(await EnvironmentSecret.countDocuments({ projectId }), 0);
  });

  it('bulk updates only rows with replacement values', async () => {
    const projectId = objectId();
    const actorId = objectId();

    await importEnvFile(projectId, 'API_KEY=first\nPORT=3000', actorId);

    const result = await bulkUpdateSecrets(
      projectId,
      [
        { name: 'API_KEY', value: 'rotated' },
        { name: 'PORT', value: '' },
      ],
      actorId,
    );

    assert.deepEqual(result, { success: true, count: 1 });
    assert.deepEqual(await getDecryptedSecrets(projectId), {
      API_KEY: 'rotated',
      PORT: '3000',
    });
  });

  it('rejects all-blank, unknown, and duplicate bulk secret submissions', async () => {
    const projectId = objectId();
    const actorId = objectId();

    await importEnvFile(projectId, 'API_KEY=first\nPORT=3000', actorId);

    const blankResult = await bulkUpdateSecrets(
      projectId,
      [
        { name: 'API_KEY', value: '' },
        { name: 'PORT', value: '' },
      ],
      actorId,
    );
    assert.equal(blankResult.success, false);
    assert.match(blankResult.error, /at least one new value/i);

    const unknownResult = await bulkUpdateSecrets(
      projectId,
      [{ name: 'MISSING_KEY', value: 'value' }],
      actorId,
    );
    assert.equal(unknownResult.success, false);
    assert.match(unknownResult.error, /no longer exists/i);

    const duplicateResult = await bulkUpdateSecrets(
      projectId,
      [
        { name: 'API_KEY', value: 'one' },
        { name: 'API_KEY', value: 'two' },
      ],
      actorId,
    );
    assert.equal(duplicateResult.success, false);
    assert.match(duplicateResult.error, /more than once/i);
  });

  it('reveals a stored secret value and rejects unknown names', async () => {
    const projectId = objectId();
    const actorId = objectId();

    await importEnvFile(projectId, 'API_KEY=first\nPORT=3000', actorId);

    const revealed = await revealSecretValue(projectId, 'api_key', actorId);
    assert.deepEqual(revealed, {
      success: true,
      name: 'API_KEY',
      value: 'first',
    });

    const missing = await revealSecretValue(projectId, 'MISSING_KEY', actorId);
    assert.equal(missing.success, false);
    assert.match(missing.error, /not found/i);
  });
});
