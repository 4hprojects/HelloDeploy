import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

process.env.GITHUB_APP_ID ??= '12345';
process.env.GITHUB_APP_NAME ??= 'test-app';
process.env.HELLODEPLOY_MASTER_KEY ??= Buffer.alloc(32, 4).toString('base64');

const { Deployment, Project } = await import('@hellodeploy/database');
const { DeploymentStatus } = await import('@hellodeploy/contracts');
const { startTestDb, stopTestDb, clearTestDb, objectId } = await import('../helpers/worker-db.js');
const { createProject, createDeployment, createRepository } =
  await import('../helpers/worker-fixtures.js');
const { retryDeployment, rollbackDeployment } =
  await import('../../apps/web/src/services/deployment.service.js');
const { runProjectDetection } = await import('../../apps/web/src/services/detection.service.js');

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

  it('refuses a rollback to a pre-snapshot release after the deployment mode changed', async () => {
    const project = await createProject({
      runtimeType: 'NEXTJS',
      buildStrategy: 'next_standard_v1',
    });
    const repo = await createRepository(project._id);
    await project.updateOne({ $set: { repositoryId: repo._id } });
    const preUpgrade = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-pre-upgrade',
    });

    const result = await rollbackDeployment(project._id, preUpgrade._id, objectId());

    assert.match(result.error, /before HelloDeploy recorded deployment settings/);
  });

  it('refuses a rollback to a release whose pilot has been turned off', async () => {
    const project = await createProject({ runtimeType: 'NEXTJS', buildStrategy: null });
    const repo = await createRepository(project._id);
    await project.updateOne({ $set: { repositoryId: repo._id } });
    const nextRelease = await createDeployment(project._id, {
      status: DeploymentStatus.HEALTHY,
      imageTag: 'img-next',
      configurationSnapshot: {
        schemaVersion: 1,
        buildStrategy: 'next_standard_v1',
        runtimeType: 'NEXTJS',
        buildConfiguration: { applicationRoot: '.', applicationPort: 3000, healthCheckPath: '/' },
        projectConfigurationVersion: 1,
        environmentVersion: 1,
        sourceCommit: 'a'.repeat(40),
      },
    });

    const result = await rollbackDeployment(project._id, nextRelease._id, objectId());

    assert.match(result.error, /not enabled for this project/);
  });

  it('keeps the recommended mode when detection cannot run', async () => {
    const project = await createProject({
      runtimeType: 'NEXTJS',
      detection: { status: 'READY', recommendedBuildStrategy: 'next_standalone_v1' },
    });
    await runProjectDetection(project._id, objectId());
    const stored = await Project.findById(project._id).lean();
    assert.equal(stored.detection.recommendedBuildStrategy, 'next_standalone_v1');
  });
});
