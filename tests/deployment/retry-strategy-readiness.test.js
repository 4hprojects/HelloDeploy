import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

process.env.GITHUB_APP_ID ??= '12345';
process.env.GITHUB_APP_NAME ??= 'test-app';
process.env.HELLODEPLOY_MASTER_KEY ??= Buffer.alloc(32, 4).toString('base64');

const { Deployment } = await import('@hellodeploy/database');
const { DeploymentStatus } = await import('@hellodeploy/contracts');
const { startTestDb, stopTestDb, clearTestDb, objectId } = await import('../helpers/worker-db.js');
const { createProject, createDeployment, createRepository } =
  await import('../helpers/worker-fixtures.js');
const { retryDeployment } = await import('../../apps/web/src/services/deployment.service.js');

describe('retry strategy readiness', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('refuses to retry a Python project that has no Python mode saved', async () => {
    const project = await createProject({ runtimeType: 'PYTHON', buildStrategy: null });
    const repo = await createRepository(project._id);
    await project.updateOne({ $set: { repositoryId: repo._id } });
    const failed = await createDeployment(project._id, { status: DeploymentStatus.FAILED });

    const result = await retryDeployment(failed._id, project._id, objectId());

    assert.deepEqual(
      [result.success, /limited pilot/.test(result.error), await Deployment.countDocuments()],
      [false, true, 1],
    );
  });
});
