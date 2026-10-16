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
  MULTIRUNTIME_PHP_V1_ENABLED: 'true',
  MULTIRUNTIME_PHP_V1_PROJECT_IDS: ALLOWED_PROJECT_ID.toString(),
});

const { Deployment } = await import('@hellodeploy/database');
const { startTestDb, stopTestDb, clearTestDb } = await import('../helpers/worker-db.js');
const { createProject, createDeployment, createRepository } =
  await import('../helpers/worker-fixtures.js');
const { handleBuildDeployment } =
  await import('../../apps/worker/src/jobs/build-deployment.job.js');

const PYTHON_SNAPSHOT = {
  buildStrategy: 'python_flask_v1',
  runtimeType: 'PYTHON',
  buildConfiguration: { applicationPort: 8000, applicationModule: 'app:app' },
};
const LARAVEL_SNAPSHOT = {
  buildStrategy: 'php_laravel_v1',
  runtimeType: 'PHP',
  buildConfiguration: { outputDirectory: 'public' },
};

function makeDeps(contextFiles) {
  const dockerfiles = [];
  const activations = [];
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
    readOptionalContextFile: async (_dir, name) => contextFiles[name] ?? null,
    getProjectEnvVars: async () => ({}),
    writeDockerfile: async (dir, content) => dockerfiles.push(content),
    buildExecutor: { build: async () => ({ imageRef: digest, imageDigest: digest }) },
    removeDockerImage: async () => {},
    deleteRegistryManifest: async () => {},
    cleanupBuildWorkspace: async () => {},
    enqueueActivateRelease: async (payload) => activations.push(payload),
    notifyDeploymentResult: async () => {},
    sleep: async () => {},
  };
  return { deps, dockerfiles, activations };
}

async function runVersionedJob(
  snapshot,
  { projectId = ALLOWED_PROJECT_ID, contextFiles = {} } = {},
) {
  const project = await createProject({ _id: projectId, runtimeType: snapshot.runtimeType });
  const repo = await createRepository(project._id);
  await project.updateOne({ $set: { repositoryId: repo._id } });
  const deployment = await createDeployment(project._id, {
    configurationSnapshot: {
      schemaVersion: 1,
      buildStrategy: snapshot.buildStrategy,
      runtimeType: snapshot.runtimeType,
      buildConfiguration: {
        applicationRoot: '.',
        buildCommand: null,
        startCommand: null,
        outputDirectory: null,
        applicationPort: null,
        healthCheckPath: '/',
        applicationModule: null,
        ...snapshot.buildConfiguration,
      },
      projectConfigurationVersion: 1,
      environmentVersion: 1,
      sourceCommit: 'a'.repeat(40),
    },
  });
  const { deps, dockerfiles, activations } = makeDeps(contextFiles);
  await handleBuildDeployment(
    {
      data: {
        version: 2,
        projectId: project._id.toString(),
        deploymentId: deployment._id.toString(),
        correlationId: 'versioned-build-test',
      },
    },
    deps,
  );
  const fresh = await Deployment.findById(deployment._id).lean();
  return { deployment: fresh, dockerfiles, activations };
}

describe('build-deployment job — versioned runtime strategies', () => {
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
    const { dockerfiles } = await runVersionedJob(PYTHON_SNAPSHOT, {
      contextFiles: { '.python-version': '3.12.4\n' },
    });
    assert.match(dockerfiles[0], /^FROM python:3\.12-slim-bookworm AS builder/m);
  });

  it('fails Dockerfile generation for an unsupported .python-version', async () => {
    const { deployment } = await runVersionedJob(PYTHON_SNAPSHOT, {
      contextFiles: { '.python-version': '3.9\n' },
    });
    assert.deepEqual(
      [deployment.failureCode, /Python 3\.9 is not supported/.test(deployment.failureSummary)],
      ['DOCKERFILE_GENERATION_FAILED', true],
    );
  });

  it('refuses a Python build for a project outside the pilot allowlist', async () => {
    const { deployment } = await runVersionedJob(PYTHON_SNAPSHOT, {
      projectId: new mongoose.Types.ObjectId(),
    });
    assert.equal(deployment.failureCode, 'BUILD_STRATEGY_DISABLED');
  });

  it('builds PHP with the newest version composer.json allows', async () => {
    const { dockerfiles } = await runVersionedJob(LARAVEL_SNAPSHOT, {
      contextFiles: { 'composer.json': JSON.stringify({ require: { php: '^8.2' } }) },
    });
    assert.match(dockerfiles[0], /^FROM php:8\.4-apache-bookworm AS vendor/m);
  });

  it('activates a PHP release on the fixed web server port', async () => {
    const { activations } = await runVersionedJob(LARAVEL_SNAPSHOT, {
      contextFiles: { 'composer.json': '{}' },
    });
    assert.equal(activations[0].targetPort, 8080);
  });

  it('fails Dockerfile generation when composer.json rules out every PHP version', async () => {
    const { deployment } = await runVersionedJob(LARAVEL_SNAPSHOT, {
      contextFiles: { 'composer.json': JSON.stringify({ require: { php: '^7.4' } }) },
    });
    assert.equal(deployment.failureCode, 'DOCKERFILE_GENERATION_FAILED');
  });
});
