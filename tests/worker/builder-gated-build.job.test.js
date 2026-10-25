import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import mongoose from 'mongoose';

// The worker reads builder control and pilot flags at import. These values only
// satisfy validation; every boundary that would use them is injected below.
const PILOT_PROJECT_ID = new mongoose.Types.ObjectId();
Object.assign(process.env, {
  BUILD_EXECUTOR: 'local',
  BUILD_BUILDER_NAME: 'hellodeploy-builder',
  BUILDER_CONTROL_ENABLED: 'true',
  BUILDER_CONTROL_BUILDX_NAME: 'hellodeploy-ondemand',
  BUILDER_CONTROL_ENDPOINT: 'unix:///run/hellodeploy-builder/buildkitd.sock',
  USER_IMAGE_REGISTRY: 'ghcr.io/4hprojects/hellodeploy-builds',
  REGISTRY_MANIFEST_DELETE_ENABLED: 'true',
  WORKER_CONCURRENCY: '1',
  MULTIRUNTIME_NEXT_V1_ENABLED: 'true',
  MULTIRUNTIME_NEXT_V1_PROJECT_IDS: PILOT_PROJECT_ID.toString(),
});

const { BuilderState, BUILDER_SETTINGS_KEY, DeploymentStatus, PlatformRole } =
  await import('@hellodeploy/contracts');
const { Deployment, PlatformSetting, User } = await import('@hellodeploy/database');
const { startTestDb, stopTestDb, clearTestDb } = await import('../helpers/worker-db.js');
const { createProject, createDeployment, createRepository } =
  await import('../helpers/worker-fixtures.js');
const { handleBuildDeployment } =
  await import('../../apps/worker/src/jobs/build-deployment.job.js');
const { createBuilderController } =
  await import('../../apps/worker/src/builder/builder-controller.js');

const DIGEST = `sha256:${'c'.repeat(64)}`;
const NEXT_SNAPSHOT = {
  buildStrategy: 'next_standard_v1',
  runtimeType: 'NEXTJS',
  buildConfiguration: { applicationPort: 3000 },
};
const LEGACY_SNAPSHOT = {
  buildStrategy: 'legacy_generated',
  runtimeType: 'NODEJS',
  buildConfiguration: { applicationPort: 3000 },
};

/** A real builder controller over fake systemd, BuildKit, and host readings. */
async function createBuilder({ isStarted = true, memAvailableMb = 4000 } = {}) {
  const unit = {
    unit: 'hellodeploy-buildkitd.service',
    state: 'inactive',
    start: async () => {
      unit.state = 'active';
    },
    stop: async () => {
      unit.state = 'inactive';
    },
    kill: async () => {
      unit.state = 'failed';
    },
    isActive: async () => unit.state,
  };
  const resources = {
    memAvailableMb,
    swapTotalMb: 4096,
    swapFreeMb: 2048,
    memoryPressureSome60: 0,
    memoryPressureFull10: 0,
    appMemoryPressureFull10: 0,
    builderMemoryPressureFull10: 0,
    diskFreeGb: 500,
    storeFreeGb: 25,
  };
  const controller = createBuilderController({
    unitControl: unit,
    verifyBuilder: async () => {
      if (unit.state !== 'active') {
        throw new Error('not running');
      }
    },
    verifyRegistry: async () => {},
    readResources: async () => resources,
    readSettings: async () => ({ idleMinutes: 30 }),
    publishStatus: async () => {},
    writeAudit: async () => {},
    loadActorRole: async () => PlatformRole.SUPER_ADMIN,
    logger: { warn() {}, info() {}, error() {} },
    setRepeating: () => null,
    clearRepeating: () => {},
  });
  if (isStarted) {
    await controller.handleControlJob({ action: 'start', actorId: 'a'.repeat(24) });
    await controller.whenStartSettles();
  }
  // Admission at build time reads the same object.
  return { controller, resources };
}

function makeDeps(builder, overrides = {}) {
  const calls = { clones: [], localBuilds: [], remoteBuilds: [], activations: [] };
  const deps = {
    getInstallationToken: async () => 'ghs_test-token',
    cloneExactCommit: async (opts) => calls.clones.push(opts),
    clonePublicExactCommit: async (opts) => calls.clones.push(opts),
    prepareBuildContext: async () => {},
    resolveApplicationRoot: async (workDir) => workDir,
    resolveBuildProfile: async () => ({ templateVersion: 'legacy', fallbackReason: null }),
    writePlatformDockerignore: async () => {},
    listRootEnvFiles: async () => [],
    readOptionalContextFile: async () => null,
    readContainedFile: async () => null,
    getProjectEnvVars: async () => ({}),
    writeDockerfile: async () => {},
    buildDockerImage: async (opts) => calls.localBuilds.push(opts),
    inspectLocalImageDigest: async () => ({ imageRef: 'local-image', imageDigest: null }),
    buildAndPushDockerImage: async (opts) => {
      calls.remoteBuilds.push(opts);
      return { imageRef: `${opts.imageRef}@${DIGEST}`, imageDigest: DIGEST, childDigests: [] };
    },
    removeDockerImage: async () => {},
    deleteRegistryManifest: async () => {},
    cleanupBuildWorkspace: async () => {},
    enqueueActivateRelease: async (payload) => calls.activations.push(payload),
    notifyDeploymentResult: async () => {},
    getBuilderController: () => builder?.controller ?? null,
    sleep: async () => {},
    ...overrides,
  };
  return { deps, calls };
}

async function seedProject({ ownerRole = PlatformRole.ADMIN, isAllowed = true } = {}) {
  const owner = await User.create({
    firstName: 'Pilot',
    lastName: 'Owner',
    email: `owner-${new mongoose.Types.ObjectId()}@hellodeploy.test`,
    googleSubject: `subject-${new mongoose.Types.ObjectId()}`,
    platformRole: ownerRole,
  });
  await PlatformSetting.create({
    key: BUILDER_SETTINGS_KEY,
    value: {
      idleMinutes: 30,
      runtimes: {
        next: { enabled: true, projectIds: isAllowed ? [PILOT_PROJECT_ID.toString()] : [] },
      },
    },
  });
  const project = await createProject({ _id: PILOT_PROJECT_ID, ownerId: owner._id });
  const repo = await createRepository(project._id);
  await project.updateOne({ $set: { repositoryId: repo._id } });
  return project;
}

async function runJob(project, snapshot, deps) {
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
        healthCheckPath: '/',
        applicationModule: null,
        ...snapshot.buildConfiguration,
      },
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
        correlationId: 'builder-gate-test',
      },
    },
    deps,
  );
  return Deployment.findById(deployment._id).lean();
}

describe('build-deployment job — on-demand builder gate', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('keeps legacy Node builds on the local builder while the build service is stopped', async () => {
    const project = await seedProject();
    const { deps, calls } = makeDeps(await createBuilder({ isStarted: false }));
    await runJob(project, LEGACY_SNAPSHOT, deps);
    assert.deepEqual(
      calls.localBuilds.map((build) => build.builderName),
      ['hellodeploy-builder'],
    );
  });

  it('deploys a legacy Node build while the build service is stopped', async () => {
    const project = await seedProject();
    const { deps } = makeDeps(await createBuilder({ isStarted: false }));
    const deployment = await runJob(project, LEGACY_SNAPSHOT, deps);
    assert.equal(deployment.status, DeploymentStatus.DEPLOYING);
  });

  it('refuses a Next.js build at once while the build service is stopped', async () => {
    const project = await seedProject();
    const { deps } = makeDeps(await createBuilder({ isStarted: false }));
    const deployment = await runJob(project, NEXT_SNAPSHOT, deps);
    assert.equal(deployment.failureCode, 'BUILDER_OFFLINE');
  });

  it('refuses before cloning, so the deployment queue is freed immediately', async () => {
    const project = await seedProject();
    const { deps, calls } = makeDeps(await createBuilder({ isStarted: false }));
    await runJob(project, NEXT_SNAPSHOT, deps);
    assert.deepEqual(calls.clones, []);
  });

  it('refuses when builder control has no controller', async () => {
    const project = await seedProject();
    const { deps } = makeDeps(null);
    const deployment = await runJob(project, NEXT_SNAPSHOT, deps);
    assert.equal(deployment.failureCode, 'BUILDER_OFFLINE');
  });

  it('refuses a project owned by an ordinary user', async () => {
    const project = await seedProject({ ownerRole: PlatformRole.USER });
    const { deps } = makeDeps(await createBuilder());
    const deployment = await runJob(project, NEXT_SNAPSHOT, deps);
    assert.equal(deployment.failureCode, 'BUILDER_PROJECT_NOT_ALLOWED');
  });

  it('refuses a project the database permissions do not allow', async () => {
    const project = await seedProject({ isAllowed: false });
    const { deps } = makeDeps(await createBuilder());
    const deployment = await runJob(project, NEXT_SNAPSHOT, deps);
    assert.equal(deployment.failureCode, 'BUILDER_PROJECT_NOT_ALLOWED');
  });

  it('builds an allowed project on the on-demand builder, not the legacy builder', async () => {
    const project = await seedProject();
    const { deps, calls } = makeDeps(await createBuilder());
    await runJob(project, NEXT_SNAPSHOT, deps);
    assert.deepEqual(
      calls.remoteBuilds.map((build) => build.builderName),
      ['hellodeploy-ondemand'],
    );
  });

  it('pushes the build to the configured private registry', async () => {
    const project = await seedProject();
    const { deps } = makeDeps(await createBuilder());
    const deployment = await runJob(project, NEXT_SNAPSHOT, deps);
    assert.equal(deployment.imageRef.startsWith('ghcr.io/4hprojects/hellodeploy-builds:'), true);
  });

  it('frees the builder after the build', async () => {
    const project = await seedProject();
    const builder = await createBuilder();
    const { deps } = makeDeps(builder);
    await runJob(project, NEXT_SNAPSHOT, deps);
    assert.equal(builder.controller.getSnapshot().state, BuilderState.READY);
  });

  it('refuses the build when the host loses headroom after the build service started', async () => {
    const project = await seedProject();
    const builder = await createBuilder();
    builder.resources.memAvailableMb = 1200;
    const { deps } = makeDeps(builder);
    const deployment = await runJob(project, NEXT_SNAPSHOT, deps);
    assert.equal(deployment.failureCode, 'BUILDER_INSUFFICIENT_RESOURCES');
  });

  it('records an Emergency Stop during the build as a cancelled build', async () => {
    const project = await seedProject();
    const builder = await createBuilder();
    const { deps } = makeDeps(builder, {
      // Like the real client: the build ends when its signal aborts.
      buildAndPushDockerImage: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
          void builder.controller.handleControlJob({
            action: 'emergency-stop',
            actorId: 'a'.repeat(24),
          });
        }),
    });
    const deployment = await runJob(project, NEXT_SNAPSHOT, deps);
    assert.equal(deployment.failureCode, 'BUILD_CANCELLED');
  });

  it('never queues activation for a cancelled build', async () => {
    const project = await seedProject();
    const builder = await createBuilder();
    const { deps, calls } = makeDeps(builder, {
      buildAndPushDockerImage: ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
          void builder.controller.handleControlJob({
            action: 'emergency-stop',
            actorId: 'a'.repeat(24),
          });
        }),
    });
    await runJob(project, NEXT_SNAPSHOT, deps);
    assert.deepEqual(calls.activations, []);
  });
});
