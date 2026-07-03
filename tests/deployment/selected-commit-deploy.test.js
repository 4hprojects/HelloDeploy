import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import { startTestDb, stopTestDb, objectId } from '../helpers/worker-db.js';

const { createDeployment, COMMIT_SHA_FORMAT_ERROR } =
  await import('../../apps/web/src/services/deployment.service.js');

describe('selected-commit deployment — SHA validation', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });

  it('rejects a short SHA with a field-scoped error', async () => {
    const result = await createDeployment({
      projectId: objectId(),
      actorId: objectId(),
      commitSha: 'abc123',
    });
    assert.equal(result.success, false);
    assert.equal(result.error, COMMIT_SHA_FORMAT_ERROR);
    assert.equal(result.errorField, 'commitSha');
  });

  it('rejects non-hex input of the right length', async () => {
    const result = await createDeployment({
      projectId: objectId(),
      actorId: objectId(),
      commitSha: 'z'.repeat(40),
    });
    assert.equal(result.errorField, 'commitSha');
  });

  it('accepts a valid 40-hex SHA past validation (fails later on the missing project, not the SHA)', async () => {
    const result = await createDeployment({
      projectId: objectId(),
      actorId: objectId(),
      commitSha: 'a'.repeat(40),
    });
    assert.equal(result.success, false);
    assert.equal(result.error, 'Project not found.');
    assert.equal(result.errorField, undefined);
  });

  it('normalizes uppercase SHAs instead of rejecting them', async () => {
    const result = await createDeployment({
      projectId: objectId(),
      actorId: objectId(),
      commitSha: 'A'.repeat(40),
    });
    assert.equal(result.error, 'Project not found.');
  });

  it('treats a null override as deploy-latest (no SHA error)', async () => {
    const result = await createDeployment({
      projectId: objectId(),
      actorId: objectId(),
      commitSha: null,
    });
    assert.equal(result.error, 'Project not found.');
  });
});
