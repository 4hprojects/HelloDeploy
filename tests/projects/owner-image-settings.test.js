import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import mongoose from 'mongoose';

// The web process reads pilot flags at import; only this project is allowlisted.
const PILOT_PROJECT_ID = new mongoose.Types.ObjectId();
Object.assign(process.env, {
  GITHUB_APP_ID: '12345',
  GITHUB_APP_NAME: 'test-app',
  HELLODEPLOY_MASTER_KEY: Buffer.alloc(32, 3).toString('base64'),
  MULTIRUNTIME_OCI_V1_ENABLED: 'true',
  MULTIRUNTIME_OCI_V1_PROJECT_IDS: PILOT_PROJECT_ID.toString(),
});

const { Project } = await import('@hellodeploy/database');
const { startTestDb, stopTestDb, clearTestDb } = await import('../helpers/worker-db.js');
const { createProject } = await import('../helpers/worker-fixtures.js');
const { updateBuildConfiguration } = await import('../../apps/web/src/services/project.service.js');
const { resolveSelectedStrategy, validateUpdateBuildConfiguration } =
  await import('../../apps/web/src/validators/project.validator.js');

async function pythonProject(id = PILOT_PROJECT_ID) {
  return createProject({
    _id: id,
    runtimeType: 'PYTHON',
    detection: { status: 'READY', detectedRuntimeType: 'PYTHON' },
  });
}

function saveImage(projectId, overrides = {}) {
  return updateBuildConfiguration({
    projectId,
    applicationPort: '8080',
    applicationRoot: '.',
    imageReference: 'ghcr.io/owner/app:1.0',
    buildStrategy: 'oci_image_v1',
    actorId: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

describe('owner image build settings', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('switches an allowlisted project to its prebuilt image', async () => {
    await pythonProject();
    await saveImage(PILOT_PROJECT_ID);
    const saved = await Project.findById(PILOT_PROJECT_ID).lean();
    assert.deepEqual(
      [saved.runtimeType, saved.buildStrategy, saved.buildConfiguration.imageReference],
      ['CONTAINER', 'oci_image_v1', 'ghcr.io/owner/app:1.0'],
    );
  });

  it('restores the detected runtime when switching back to a HelloDeploy build', async () => {
    await pythonProject();
    await saveImage(PILOT_PROJECT_ID);
    await saveImage(PILOT_PROJECT_ID, { buildStrategy: 'legacy_generated' });
    const saved = await Project.findById(PILOT_PROJECT_ID).lean();
    assert.deepEqual(
      [saved.runtimeType, saved.buildConfiguration.imageReference],
      ['PYTHON', null],
    );
  });

  it('refuses a prebuilt image for a project outside the pilot', async () => {
    const outsider = new mongoose.Types.ObjectId();
    await pythonProject(outsider);
    const result = await saveImage(outsider);
    assert.match(result.error, /not enabled/);
  });
});

describe('owner image form validation', () => {
  it('lets the deployment source choose a container strategy', () => {
    assert.equal(
      resolveSelectedStrategy({
        deploymentSource: 'oci_image_v1',
        buildStrategy: 'python_flask_v1',
      }),
      'oci_image_v1',
    );
  });

  it('turns a stored container strategy back into a HelloDeploy build', () => {
    assert.equal(
      resolveSelectedStrategy({ deploymentSource: 'platform', buildStrategy: 'dockerfile_v1' }),
      'legacy_generated',
    );
  });

  it('requires a valid image reference for a prebuilt image', () => {
    const { errors } = validateUpdateBuildConfiguration({
      deploymentSource: 'oci_image_v1',
      imageReference: 'quay.io/owner/app:1',
      applicationPort: '8080',
    });
    assert.match(errors.imageReference, /docker\.io, ghcr\.io/);
  });

  it('requires the container port for an owner Dockerfile', () => {
    const { errors } = validateUpdateBuildConfiguration({ deploymentSource: 'dockerfile_v1' });
    assert.match(errors.applicationPort, /port your container listens on/);
  });

  it('rejects a Dockerfile path that leaves the application root', () => {
    const { errors } = validateUpdateBuildConfiguration({
      deploymentSource: 'dockerfile_v1',
      dockerfilePath: '../Dockerfile',
      applicationPort: '8080',
    });
    assert.match(errors.dockerfilePath, /traversal/);
  });
});
