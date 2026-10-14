import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { AuditEvent, EnvironmentSecret } from '@hellodeploy/database';
import { configureAuditService } from '@hellodeploy/observability';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

import {
  bulkUpdateSecrets,
  deleteAllSecrets,
  MAX_ENV_FILE_BYTES,
  MAX_ENV_FILE_SECRETS,
  getDecryptedSecrets,
  importEnvFile,
  parseEnvFile,
  previewEnvFile,
  revealSecretValues,
  setSecret,
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

    assert.deepEqual(
      result.entries.map((entry) => [entry.name, entry.localValue]),
      [
        ['DATABASE_URL', 'mongodb://db/app?retryWrites=true'],
        ['API_KEY', 'secret value'],
        ['PORT', '3000'],
      ],
    );
  });

  it('rejects invalid names without including the secret value in the error', () => {
    const secretValue = 'must-not-leak';
    const result = parseEnvFile(`lowercase=${secretValue}`);

    assert.equal(result.success, false);
    assert.match(result.error, /Invalid variable name on line 1/);
    assert.doesNotMatch(result.error, new RegExp(secretValue));
  });

  it('validates the whole file for malformed and duplicate assignments', () => {
    assert.match(parseEnvFile('NOT AN ASSIGNMENT').error, /line 1/);
    assert.match(parseEnvFile('KEY=one\nKEY=two').error, /defined more than once/);
  });

  it('keeps an empty value as an entry instead of failing the file', () => {
    const result = parseEnvFile('PORT=3000\nRESEND_API_KEY=');
    assert.equal(result.entries[1].localValue, '');
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

describe('.env production values from comments', () => {
  const productionOf = (content, name) =>
    parseEnvFile(content).entries.find((entry) => entry.name === name);

  it('reads an inline prod note', () => {
    const entry = productionOf('NODE_ENV=development # prod: production', 'NODE_ENV');
    assert.deepEqual([entry.localValue, entry.productionValue], ['development', 'production']);
  });

  it('ignores a prod note inside a quoted value', () => {
    const entry = productionOf('MOTTO="ship it # prod: never"', 'MOTTO');
    assert.equal(entry.productionValue, null);
  });

  it('reads a commented assignment directly below the active line', () => {
    const entry = productionOf(
      'APP_BASE_URL=http://localhost:3000\n# APP_BASE_URL=https://helloeventhub.online',
      'APP_BASE_URL',
    );
    assert.equal(entry.productionValue, 'https://helloeventhub.online');
  });

  it('reads commented assignments under a production label', () => {
    const entry = productionOf(
      '# Production:\n# MONGODB_URI=mongodb+srv://prod/app\nMONGODB_URI=mongodb://127.0.0.1/app',
      'MONGODB_URI',
    );
    assert.deepEqual(
      [entry.localValue, entry.productionValue, entry.productionSource],
      ['mongodb://127.0.0.1/app', 'mongodb+srv://prod/app', 'label'],
    );
  });

  it('ends a production label at a blank line', () => {
    const entry = productionOf('# Production:\n\n# PORT=8080\nPORT=3000', 'PORT');
    assert.equal(entry.productionValue, null);
  });

  it('reads production-only names under a section header until the next header', () => {
    const result = parseEnvFile(
      '# --- local ---\nPORT=3000\n# --- production ---\n# PORT=8080\n# SENTRY_DSN=https://sentry\n# --- notes ---\n# OLD_KEY=unused',
    );
    assert.deepEqual(
      result.entries.map((entry) => [entry.name, entry.localValue, entry.productionValue]),
      [
        ['PORT', '3000', '8080'],
        ['SENTRY_DSN', null, 'https://sentry'],
      ],
    );
  });

  it('ignores ordinary commented-out assignments', () => {
    const result = parseEnvFile('PORT=3000\n\n# DEBUG=true');
    assert.deepEqual(
      result.entries.map((entry) => entry.name),
      ['PORT'],
    );
  });

  it('previews names and value availability without any values', () => {
    const result = previewEnvFile('API_KEY=local-secret # prod: prod-secret\nEMPTY=');
    assert.doesNotMatch(JSON.stringify(result), /secret/);
  });
});

describe('.env file import', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  it('encrypts imported values and updates existing variables', async () => {
    const projectId = objectId();
    const actorId = objectId();

    const first = await importEnvFile(projectId, 'API_KEY=first\nAPP_PORT=3000', actorId);
    const second = await importEnvFile(projectId, 'API_KEY=rotated', actorId);

    assert.equal(first.count, 2);
    assert.equal(second.count, 1);
    assert.equal(await EnvironmentSecret.countDocuments({ projectId }), 2);
    assert.deepEqual(await getDecryptedSecrets(projectId), {
      API_KEY: 'rotated',
      APP_PORT: '3000',
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

  it('imports the production value by default', async () => {
    const projectId = objectId();
    await importEnvFile(projectId, 'NODE_ENV=development # prod: production', objectId());
    assert.deepEqual(await getDecryptedSecrets(projectId), { NODE_ENV: 'production' });
  });

  it('imports the local value when the review chose it', async () => {
    const projectId = objectId();
    await importEnvFile(projectId, 'NODE_ENV=development # prod: production', objectId(), {
      selections: { NODE_ENV: { include: true, source: 'local' } },
    });
    assert.deepEqual(await getDecryptedSecrets(projectId), { NODE_ENV: 'development' });
  });

  it('skips a removed variable', async () => {
    const projectId = objectId();
    await importEnvFile(projectId, 'KEEP=1\nDROP=2', objectId(), {
      selections: { DROP: { include: false } },
    });
    assert.deepEqual(await getDecryptedSecrets(projectId), { KEEP: '1' });
  });

  it('skips an empty value and reports it when no choice was made', async () => {
    const result = await importEnvFile(objectId(), 'APP_PORT=3000\nRESEND_API_KEY=', objectId());
    assert.deepEqual(result.skipped, ['RESEND_API_KEY']);
  });

  it('uses a value typed in the review for an empty variable', async () => {
    const projectId = objectId();
    await importEnvFile(projectId, 'RESEND_API_KEY=', objectId(), {
      selections: { RESEND_API_KEY: { include: true, source: 'local', value: 're_typed' } },
    });
    assert.deepEqual(await getDecryptedSecrets(projectId), { RESEND_API_KEY: 're_typed' });
  });

  it('writes nothing when an included variable still has no value', async () => {
    const projectId = objectId();
    const result = await importEnvFile(projectId, 'APP_PORT=3000\nRESEND_API_KEY=', objectId(), {
      selections: { RESEND_API_KEY: { include: true, source: 'local' } },
    });
    assert.equal(await EnvironmentSecret.countDocuments({ projectId }), 0);
    assert.match(result.error, /RESEND_API_KEY/);
  });

  it('ignores selections for names that are not in the file', async () => {
    const projectId = objectId();
    await importEnvFile(projectId, 'APP_PORT=3000', objectId(), {
      selections: { INJECTED: { include: true, source: 'local', value: 'x' } },
    });
    assert.deepEqual(await getDecryptedSecrets(projectId), { APP_PORT: '3000' });
  });

  it('refuses an import where every variable was removed', async () => {
    const result = await importEnvFile(objectId(), 'APP_PORT=3000', objectId(), {
      selections: { APP_PORT: { include: false } },
    });
    assert.match(result.error, /Nothing to import/);
  });

  it('bulk updates only rows with replacement values', async () => {
    const projectId = objectId();
    const actorId = objectId();

    await importEnvFile(projectId, 'API_KEY=first\nAPP_PORT=3000', actorId);

    const result = await bulkUpdateSecrets(
      projectId,
      [
        { name: 'API_KEY', value: 'rotated' },
        { name: 'APP_PORT', value: '' },
      ],
      actorId,
    );

    assert.deepEqual(result, { success: true, count: 1 });
    assert.deepEqual(await getDecryptedSecrets(projectId), {
      API_KEY: 'rotated',
      APP_PORT: '3000',
    });
  });

  it('rejects all-blank, unknown, and duplicate bulk secret submissions', async () => {
    const projectId = objectId();
    const actorId = objectId();

    await importEnvFile(projectId, 'API_KEY=first\nAPP_PORT=3000', actorId);

    const blankResult = await bulkUpdateSecrets(
      projectId,
      [
        { name: 'API_KEY', value: '' },
        { name: 'APP_PORT', value: '' },
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
});

describe('deleting all secrets', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  it('removes every secret for the project', async () => {
    const projectId = objectId();
    const actorId = objectId();
    await importEnvFile(projectId, 'API_KEY=first\nAPP_PORT=3000', actorId);

    await deleteAllSecrets(projectId, actorId);

    assert.equal(await EnvironmentSecret.countDocuments({ projectId }), 0);
  });

  it('leaves secrets of other projects untouched', async () => {
    const projectId = objectId();
    const otherProjectId = objectId();
    const actorId = objectId();
    await importEnvFile(projectId, 'API_KEY=first', actorId);
    await importEnvFile(otherProjectId, 'OTHER_KEY=kept', actorId);

    await deleteAllSecrets(projectId, actorId);

    assert.deepEqual(await getDecryptedSecrets(otherProjectId), { OTHER_KEY: 'kept' });
  });

  it('rejects clearing a project that has no secrets', async () => {
    const result = await deleteAllSecrets(objectId(), objectId());

    assert.deepEqual(result, { success: false, error: 'There are no secrets to delete.' });
  });
});

describe('revealing all secret values', () => {
  before(async () => {
    await startTestDb();
    configureAuditService(AuditEvent);
  });
  beforeEach(clearTestDb);
  after(async () => {
    configureAuditService(null);
    await stopTestDb();
  });

  it('returns every decrypted value for the project', async () => {
    const projectId = objectId();
    const actorId = objectId();
    await importEnvFile(projectId, 'API_KEY=first\nAPP_PORT=3000', actorId);

    assert.deepEqual(await revealSecretValues(projectId, actorId), {
      API_KEY: 'first',
      APP_PORT: '3000',
    });
  });

  it('records who revealed the values without recording the values', async () => {
    const projectId = objectId();
    const actorId = objectId();
    await importEnvFile(projectId, 'API_KEY=very-secret-value', actorId);

    await revealSecretValues(projectId, actorId);

    const event = await AuditEvent.findOne({ action: 'project.secrets_revealed' }).lean();
    assert.deepEqual(event.metadata, { count: 1, names: ['API_KEY'] });
  });
});

describe('PORT is set by HelloDeploy, not stored as a secret', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  it('refuses to save a PORT secret', async () => {
    const result = await setSecret(objectId(), 'PORT', '3009', objectId());

    assert.equal(result.success, false);
  });

  it('imports the other variables and leaves PORT out', async () => {
    const projectId = objectId();
    await importEnvFile(projectId, 'PORT=3009\nAPI_KEY=first', objectId());

    assert.deepEqual(await getDecryptedSecrets(projectId), { API_KEY: 'first' });
  });

  it('leaves PORT out of the import review', () => {
    const result = previewEnvFile('PORT=3009\nAPI_KEY=first');

    assert.deepEqual(
      result.entries.map((entry) => entry.name),
      ['API_KEY'],
    );
  });
});
