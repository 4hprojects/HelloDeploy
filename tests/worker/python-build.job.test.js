import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import mongoose from 'mongoose';

// The worker reads pilot flags at import. These values only satisfy validation;
// every boundary that would use them is injected below.
const ALLOWED_PROJECT_ID = new mongoose.Types.ObjectId();
Object.assign(process.env, {
  BUILD_EXECUTOR: 'remote-buildkit',
  BUILD_BUILDER_NAME: 'hellodeploy-test',
  USER_IMAGE_REGISTRY: 'ghcr.io/example/hellodeploy-apps',
  REGISTRY_MANIFEST_DELETE_ENABLED: 'true',
  WORKER_CONCURRENCY: '1',
  MULTIRUNTIME_PYTHON_V1_ENABLED: 'true',
  MULTIRUNTIME_PYTHON_V1_PROJECT_IDS: ALLOWED_PROJECT_ID.toString(),
});

const { Deployment } = await import('@hellodeploy/database');
const { startTestDb, stopTestDb, clearTestDb } = await import('../helpers/worker-db.js');
const { createProject, createDeployment, createRepository } =
  await import('../helpers/worker-fixtures.js');
const { handleBuildDeployment } =
  await import('../../apps/worker/src/jobs/build-deployment.job.js');

function makeDeps(pythonVersionFile) {
  const dockerfiles = [];
  const digest = `sha256:${'c'.repeat(64)}`;
  const deps = {
    getInstallationToken: async () => 'ghs_test-token',
    cloneExactCommit: async () => {},
    clonePublicExactCommit: async () => {},
    prepareBuildContext: async () => {},
    resolveApplicationRoot: async (workDir) => workDir,
    resolveBuildProfile: async () => ({ templateVersion: 'legacy', fallbackReason: null }),
    writePlatformDockerignore: async () => {},
    listRootEnvFiles: async () => [],
    readPythonVersionFile: async () => pythonVersionFile,
    getProjectEnvVars: async () => ({}),
    writeDockerfile: async (dir, content) => dockerfiles.push(content),
    buildExecutor: { build: async () => ({ imageRef: digest, imageDigest: digest }) },
    removeDockerImage: async () => {},
    deleteRegistryManifest: async () => {},
    cleanupBuildWorkspace: async () => {},
    enqueueActivateRelease: async () => {},
    notifyDeploymentResult: async () => {},
    sleep: async () => {},
  };
  return { deps, dockerfiles };
}

async function runPythonJob({ projectId = ALLOWED_PROJECT_ID, pythonVersionFile = null } = {}) {
  const project = await createProject({ _id: projectId, runtimeType: 'PYTHON' });
  const repo = await createRepository(project._id);
  await project.updateOne({ $set: { repositoryId: repo._id } });
  const deployment = await createDeployment(project._id, {
    configurationSnapshot: {
      schemaVersion: 1,
      buildStrategy: 'python_flask_v1',
      runtimeType: 'PYTHON',
      buildConfiguration: {
        applicationRoot: '.',
        buildCommand: null,
        startCommand: null,
        outputDirectory: null,
        applicationPort: 8000,
        healthCheckPath: '/',
        applicationModule: 'app:app',
      },
      projectConfigurationVersion: 1,
      environmentVersion: 1,
      sourceCommit: 'a'.repeat(40),
    },
  });
  const { deps, dockerfiles } = makeDeps(pythonVersionFile);
  await handleBuildDeployment(
    {
      data: {
        version: 2,
        projectId: project._id.toString(),
        deploymentId: deployment._id.toString(),
        correlationId: 'python-test',
      },
    },
    deps,
  );
  const fresh = await Deployment.findById(deployment._id).lean();
  return { deployment: fresh, dockerfiles };
}

describe('build-deployment job — Python strategies', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('builds with the Python version named in the cloned commit', async () => {
    const { dockerfiles } = await runPythonJob({ pythonVersionFile: '3.12.4\n' });
    assert.match(dockerfiles[0], /^FROM python:3\.12-slim-bookworm AS builder/m);
  });

  it('fails Dockerfile generation for an unsupported .python-version', async () => {
    const { deployment } = await runPythonJob({ pythonVersionFile: '3.9\n' });
    assert.deepEqual(
      [deployment.failureCode, /Python 3\.9 is not supported/.test(deployment.failureSummary)],
      ['DOCKERFILE_GENERATION_FAILED', true],
    );
  });

  it('refuses a Python build for a project outside the pilot allowlist', async () => {
    const { deployment } = await runPythonJob({ projectId: new mongoose.Types.ObjectId() });
    assert.equal(deployment.failureCode, 'BUILD_STRATEGY_DISABLED');
  });
});
