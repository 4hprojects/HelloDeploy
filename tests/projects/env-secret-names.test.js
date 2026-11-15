import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Project } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

import {
  listSecretNames,
  PLATFORM_MANAGED_NAME_ERROR,
  setSecret,
  validateSecretName,
} from '../../apps/web/src/services/env-secret.service.js';

process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

describe('validateSecretName', () => {
  it('accepts an uppercase name with digits and underscores', () => {
    assert.equal(validateSecretName('DATABASE_URL_2'), null);
  });

  it('rejects a lowercase name', () => {
    assert.match(validateSecretName('database_url'), /uppercase letters/);
  });

  it('rejects a name that starts with a digit', () => {
    assert.match(validateSecretName('2FA_KEY'), /must not start with a digit/);
  });

  it('rejects a name longer than 128 characters', () => {
    assert.match(validateSecretName('A'.repeat(129)), /128 characters or fewer/);
  });

  it('rejects a missing name', () => {
    assert.equal(validateSecretName(undefined), 'Secret name is required.');
  });
});

describe('setSecret name rules', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  it('refuses PORT, which the platform sets itself', async () => {
    const result = await setSecret(objectId(), 'PORT', '8080', objectId());
    assert.equal(result.error, PLATFORM_MANAGED_NAME_ERROR);
  });
});

describe('listSecretNames', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  async function projectWithSecrets(names) {
    const project = await Project.create({
      name: 'Secret Names',
      slug: `secret-names-${Date.now()}`,
      ownerId: objectId(),
    });
    for (const name of names) {
      await setSecret(project._id, name, `value-of-${name}`, project.ownerId);
    }
    return project;
  }

  it('lists names alphabetically', async () => {
    const project = await projectWithSecrets(['ZETA', 'ALPHA', 'MIDDLE']);

    const names = await listSecretNames(project._id);

    assert.deepEqual(
      names.map((secret) => secret.name),
      ['ALPHA', 'MIDDLE', 'ZETA'],
    );
  });

  it('never returns the encrypted value', async () => {
    const project = await projectWithSecrets(['API_KEY']);

    const [secret] = await listSecretNames(project._id);

    assert.deepEqual(Object.keys(secret).sort(), ['_id', 'createdAt', 'name', 'updatedAt']);
  });
});
