import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { EnvironmentSecret } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const { setSecret, importEnvFile, listSecretNames } =
  await import('../../apps/web/src/services/env-secret.service.js');
const { detectEnvironmentKeys } = await import('../../apps/web/src/services/detection.service.js');

describe('platform-managed settings are protected in simple mode', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('refuses PORT by default', async () => {
    const result = await setSecret(objectId(), 'PORT', '3000', objectId());
    assert.equal(result.success, false);
  });

  it('explains why, and how to override', async () => {
    const result = await setSecret(objectId(), 'PORT', '3000', objectId());
    assert.match(result.error, /Switch to Advanced mode/);
  });

  it('stores nothing when it refuses', async () => {
    const projectId = objectId();
    await setSecret(projectId, 'PORT', '3000', objectId());

    assert.equal(await EnvironmentSecret.countDocuments({ projectId }), 0);
  });

  it('allows PORT when advanced mode overrides', async () => {
    const result = await setSecret(objectId(), 'PORT', '3000', objectId(), {
      allowPlatformManaged: true,
    });

    assert.equal(result.success, true);
  });

  it('leaves an ordinary setting alone', async () => {
    const result = await setSecret(objectId(), 'DATABASE_URL', 'postgres://x', objectId());
    assert.equal(result.success, true);
  });
});

describe('importing a .env file', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  const envFile = 'PORT=3000\nNODE_ENV=production\nDATABASE_URL=postgres://x\nAPI_KEY=abc\n';

  it('imports the settings that are the owner’s to set', async () => {
    const projectId = objectId();
    const result = await importEnvFile(projectId, envFile, objectId());

    assert.equal(result.count, 2);
  });

  it('names what it skipped rather than dropping it silently', async () => {
    const result = await importEnvFile(objectId(), envFile, objectId());
    assert.deepEqual(result.skipped, ['PORT', 'NODE_ENV']);
  });

  it('stores none of the platform-managed names', async () => {
    const projectId = objectId();
    await importEnvFile(projectId, envFile, objectId());
    const stored = (await listSecretNames(projectId)).map((secret) => secret.name);

    assert.deepEqual(stored.sort(), ['API_KEY', 'DATABASE_URL']);
  });
});

describe('reading a project’s expected settings', () => {
  const files = (overrides = {}) => ({ '.env.example': null, '.env.sample': null, ...overrides });

  it('treats a name with no default as required', () => {
    const result = detectEnvironmentKeys(files({ '.env.example': 'DATABASE_URL=\n' }));
    assert.deepEqual(result.required, ['DATABASE_URL']);
  });

  it('treats a name with a default as optional', () => {
    const result = detectEnvironmentKeys(files({ '.env.example': 'LOG_LEVEL=info\n' }));
    assert.deepEqual(result.optional, ['LOG_LEVEL']);
  });

  it('ignores comments', () => {
    const result = detectEnvironmentKeys(files({ '.env.example': '# DATABASE_URL=\nAPI_KEY=\n' }));
    assert.deepEqual(result.required, ['API_KEY']);
  });

  it('never asks the owner for a setting HelloDeploy manages', () => {
    const result = detectEnvironmentKeys(files({ '.env.example': 'PORT=\nAPI_KEY=\n' }));
    assert.deepEqual(result.required, ['API_KEY']);
  });

  it('handles an exported name', () => {
    const result = detectEnvironmentKeys(files({ '.env.example': 'export API_KEY=\n' }));
    assert.deepEqual(result.required, ['API_KEY']);
  });

  it('does not repeat a name listed twice', () => {
    const result = detectEnvironmentKeys(files({ '.env.example': 'API_KEY=\nAPI_KEY=\n' }));
    assert.deepEqual(result.required, ['API_KEY']);
  });

  it('asks for nothing when the project declares nothing', () => {
    assert.deepEqual(detectEnvironmentKeys(files()).required, []);
  });

  it('falls back to .env.sample', () => {
    const result = detectEnvironmentKeys(files({ '.env.sample': 'API_KEY=\n' }));
    assert.deepEqual(result.required, ['API_KEY']);
  });
});
