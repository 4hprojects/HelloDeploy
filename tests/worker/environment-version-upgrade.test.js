import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

process.env.HELLODEPLOY_MASTER_KEY ??= Buffer.alloc(32, 7).toString('base64');

const { Deployment, Project } = await import('@hellodeploy/database');
const { DeploymentStatus } = await import('@hellodeploy/contracts');
const { startTestDb, stopTestDb, clearTestDb, objectId } = await import('../helpers/worker-db.js');
const { createProject, createDeployment, createRepository } =
  await import('../helpers/worker-fixtures.js');
const { setSecret } = await import('../../apps/web/src/services/env-secret.service.js');
const { handleBuildDeployment } =
  await import('../../apps/worker/src/jobs/build-deployment.job.js');

/** A project document written before environmentVersion existed. */
async function createPreUpgradeProject() {
  const project = await createProject();
  await Project.collection.updateOne({ _id: project._id }, { $unset: { environmentVersion: '' } });
  return project;
}

function buildDeps() {
  const digest = `sha256:${'a'.repeat(64)}`;
  return {
    getInstallationToken: async () => 'installation-token',
    cloneExactCommit: async () => {},
    clonePublicExactCommit: async () => {},
    prepareBuildContext: async () => {},
    resolveApplicationRoot: async (workDir) => workDir,
    resolveBuildProfile: async () => ({ templateVersion: 'legacy', fallbackReason: null }),
    writePlatformDockerignore: async () => {},
    listRootEnvFiles: async () => [],
    getProjectEnvVars: async () => ({}),
    writeDockerfile: async () => {},
    buildExecutor: { build: async () => ({ imageRef: digest, imageDigest: digest }) },
    removeDockerImage: async () => {},
    cleanupBuildWorkspace: async () => {},
    enqueueActivateRelease: async () => {},
    notifyDeploymentResult: async () => {},
    sleep: async () => {},
  };
}

describe('environment fence for projects stored before the upgrade', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('builds a version-1 snapshot for a project without a stored version', async () => {
    const project = await createPreUpgradeProject();
    const repo = await createRepository(project._id);
    await Project.collection.updateOne({ _id: project._id }, { $set: { repositoryId: repo._id } });
    const deployment = await createDeployment(project._id, {
      configurationSnapshot: {
        schemaVersion: 1,
        buildStrategy: 'legacy_generated',
        runtimeType: 'NODEJS',
        buildConfiguration: { applicationRoot: '.', startCommand: 'node server.js' },
        projectConfigurationVersion: 1,
        environmentVersion: 1,
        sourceCommit: 'a'.repeat(40),
      },
    });
    await handleBuildDeployment(
      {
        data: {
          version: 2,
          projectId: project._id.toString(),
          deploymentId: deployment._id.toString(),
          correlationId: 'upgrade-test',
        },
      },
      buildDeps(),
    );
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.status, DeploymentStatus.DEPLOYING);
  });

  it('moves a project without a stored version past 1 on its first secret change', async () => {
    const project = await createPreUpgradeProject();
    await setSecret(project._id, 'API_URL', 'https://example.test', objectId());
    const stored = await Project.collection.findOne({ _id: project._id });
    assert.equal(stored.environmentVersion, 2);
  });

  // A cached rebuild of the same commit shares the image ID with a retained
  // release; removing by ID would delete that release's rollback image.
  it('removes a failed local build by its unique tag, not the shared image ID', async () => {
    const project = await createProject({ environmentVersion: 2 });
    const repo = await createRepository(project._id);
    await Project.updateOne({ _id: project._id }, { $set: { repositoryId: repo._id } });
    const deployment = await createDeployment(project._id, {
      configurationSnapshot: {
        schemaVersion: 1,
        buildStrategy: 'legacy_generated',
        runtimeType: 'NODEJS',
        buildConfiguration: { applicationRoot: '.', startCommand: 'node server.js' },
        projectConfigurationVersion: 1,
        environmentVersion: 2,
        sourceCommit: 'a'.repeat(40),
      },
    });
    const removed = [];
    const imageId = `sha256:${'b'.repeat(64)}`;
    await handleBuildDeployment(
      {
        data: {
          version: 2,
          projectId: project._id.toString(),
          deploymentId: deployment._id.toString(),
          correlationId: 'removal-test',
        },
      },
      {
        ...buildDeps(),
        // The environment changes while the build runs.
        buildExecutor: {
          build: async () => {
            await Project.updateOne({ _id: project._id }, { $set: { environmentVersion: 3 } });
            return { imageRef: imageId, imageDigest: imageId };
          },
        },
        removeDockerImage: async (reference) => removed.push(reference),
      },
    );
    assert.deepEqual(
      removed.map((reference) => reference === imageId),
      [false],
    );
  });
});
