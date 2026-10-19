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
  MULTIRUNTIME_JAVA_V1_ENABLED: 'true',
  MULTIRUNTIME_JAVA_V1_PROJECT_IDS: ALLOWED_PROJECT_ID.toString(),
  MULTIRUNTIME_DOCKERFILE_V1_ENABLED: 'true',
  MULTIRUNTIME_DOCKERFILE_V1_PROJECT_IDS: ALLOWED_PROJECT_ID.toString(),
  MULTIRUNTIME_OCI_V1_ENABLED: 'true',
  MULTIRUNTIME_OCI_V1_PROJECT_IDS: ALLOWED_PROJECT_ID.toString(),
  IMAGE_SCANNER: 'trivy',
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
const GRADLE_SNAPSHOT = {
  buildStrategy: 'java_gradle_v1',
  runtimeType: 'JAVA',
  buildConfiguration: {},
};
const LARAVEL_SNAPSHOT = {
  buildStrategy: 'php_laravel_v1',
  runtimeType: 'PHP',
  buildConfiguration: { outputDirectory: 'public' },
};

const OWNER_DIGEST = `sha256:${'e'.repeat(64)}`;
const DOCKERFILE_SNAPSHOT = {
  buildStrategy: 'dockerfile_v1',
  runtimeType: 'CONTAINER',
  buildConfiguration: { applicationPort: 8080, dockerfilePath: 'Dockerfile' },
};
const OCI_SNAPSHOT = {
  buildStrategy: 'oci_image_v1',
  runtimeType: 'CONTAINER',
  buildConfiguration: { applicationPort: 8080, imageReference: 'nginx:1.27' },
};

function makeDeps(contextFiles, overrides = {}) {
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
    readContainedFile: async (_dir, name) => contextFiles[name] ?? null,
    scanImage: async () => ({ criticalCount: 0, ids: [] }),
    getRuntimePlatform: async () => 'linux/amd64',
    resolveImageDigest: async () => OWNER_DIGEST,
    loadRegistryCredential: async () => null,
    withDockerConfig: async (_registry, _credential, fn) => fn(undefined),
    getProjectEnvVars: async () => ({}),
    writeDockerfile: async (dir, content) => dockerfiles.push(content),
    buildExecutor: { build: async () => ({ imageRef: digest, imageDigest: digest }) },
    removeDockerImage: async () => {},
    deleteRegistryManifest: async () => {},
    cleanupBuildWorkspace: async () => {},
    enqueueActivateRelease: async (payload) => activations.push(payload),
    notifyDeploymentResult: async () => {},
    sleep: async () => {},
    ...overrides,
  };
  return { deps, dockerfiles, activations };
}

async function runVersionedJob(
  snapshot,
  { projectId = ALLOWED_PROJECT_ID, contextFiles = {}, depsOverrides = {} } = {},
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
  const { deps, dockerfiles, activations } = makeDeps(contextFiles, depsOverrides);
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

  it('builds Java with the toolchain version from build.gradle.kts', async () => {
    const { dockerfiles } = await runVersionedJob(GRADLE_SNAPSHOT, {
      contextFiles: {
        'build.gradle.kts': 'java { toolchain { languageVersion = JavaLanguageVersion.of(17) } }',
      },
    });
    assert.match(dockerfiles[0], /^FROM eclipse-temurin:17-jdk AS builder/m);
  });

  it('activates a Java release on the fixed Spring Boot port', async () => {
    const { activations } = await runVersionedJob(GRADLE_SNAPSHOT, {
      contextFiles: { 'build.gradle': "plugins { id 'org.springframework.boot' }" },
    });
    assert.equal(activations[0].targetPort, 8080);
  });

  it('builds the owner Dockerfile unchanged', async () => {
    const dockerfile = 'FROM node:22-slim\nUSER 10001\nCMD ["node", "server.js"]\n';
    const { dockerfiles } = await runVersionedJob(DOCKERFILE_SNAPSHOT, {
      contextFiles: { Dockerfile: dockerfile },
    });
    assert.equal(dockerfiles[0], dockerfile);
  });

  it('fails an owner Dockerfile that breaks the build policy before building', async () => {
    const { deployment, dockerfiles } = await runVersionedJob(DOCKERFILE_SNAPSHOT, {
      contextFiles: { Dockerfile: 'FROM node:22-slim\nVOLUME /data\nUSER 10001\n' },
    });
    assert.deepEqual(
      [deployment.failureCode, dockerfiles.length],
      ['DOCKERFILE_POLICY_VIOLATION', 0],
    );
  });

  it('fails an owner image with fixable critical vulnerabilities', async () => {
    const { deployment } = await runVersionedJob(DOCKERFILE_SNAPSHOT, {
      contextFiles: { Dockerfile: 'FROM node:22-slim\nUSER 10001\n' },
      depsOverrides: { scanImage: async () => ({ criticalCount: 1, ids: ['CVE-2026-0001'] }) },
    });
    assert.deepEqual(
      [deployment.failureCode, /CVE-2026-0001/.test(deployment.failureSummary)],
      ['IMAGE_POLICY_FAILED', true],
    );
  });

  it('locks a prebuilt image tag to its digest and activates it', async () => {
    const { activations } = await runVersionedJob(OCI_SNAPSHOT);
    assert.equal(activations[0].imageId, `docker.io/library/nginx@${OWNER_DIGEST}`);
  });

  it('reports a prebuilt image the registry cannot resolve', async () => {
    const { deployment } = await runVersionedJob(OCI_SNAPSHOT, {
      depsOverrides: {
        resolveImageDigest: async () => {
          throw new Error('The image docker.io/library/nginx:1.27 was not found.');
        },
      },
    });
    assert.equal(deployment.failureCode, 'IMAGE_RESOLUTION_FAILED');
  });

  it("refuses a prebuilt image from the platform's own image repository", async () => {
    const { deployment } = await runVersionedJob({
      ...OCI_SNAPSHOT,
      buildConfiguration: {
        applicationPort: 8080,
        imageReference: `ghcr.io/example/hellodeploy-apps@sha256:${'a'.repeat(64)}`,
      },
    });
    assert.match(deployment.failureSummary, /own image repository/);
  });

  it("refuses an owner Dockerfile built from the platform's own image repository", async () => {
    const { deployment } = await runVersionedJob(DOCKERFILE_SNAPSHOT, {
      contextFiles: {
        Dockerfile: `FROM ghcr.io/example/hellodeploy-apps@sha256:${'a'.repeat(64)}\nUSER 10001\n`,
      },
    });
    assert.equal(deployment.failureCode, 'DOCKERFILE_POLICY_VIOLATION');
  });

  it('builds an owner Dockerfile without the worker registry credentials', async () => {
    const buildOptions = [];
    await runVersionedJob(DOCKERFILE_SNAPSHOT, {
      contextFiles: { Dockerfile: 'FROM node:22-slim\nUSER 10001\n' },
      depsOverrides: {
        buildExecutor: {
          build: async (options) => {
            buildOptions.push(options);
            return {
              imageRef: `ghcr.io/example/hellodeploy-apps:x@sha256:${'c'.repeat(64)}`,
              imageDigest: `sha256:${'c'.repeat(64)}`,
            };
          },
        },
      },
    });
    assert.equal(buildOptions[0]?.isolateRegistryCredentials, true);
  });
});
