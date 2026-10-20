import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import mongoose from 'mongoose';

// No pilot is enabled in this process.
Object.assign(process.env, {
  GITHUB_APP_ID: '12345',
  GITHUB_APP_NAME: 'test-app',
  HELLODEPLOY_MASTER_KEY: Buffer.alloc(32, 6).toString('base64'),
  MULTIRUNTIME_NEXT_V1_ENABLED: 'false',
});

const { Project } = await import('@hellodeploy/database');
const { startTestDb, stopTestDb, clearTestDb } = await import('../helpers/worker-db.js');
const { createProject } = await import('../helpers/worker-fixtures.js');
const { updateBuildConfiguration } = await import('../../apps/web/src/services/project.service.js');

function save(projectId, overrides = {}) {
  return updateBuildConfiguration({
    projectId,
    applicationRoot: '.',
    healthCheckPath: '/health',
    actorId: new mongoose.Types.ObjectId(),
    ...overrides,
  });
}

describe('build settings after a pilot is turned off', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('still saves settings that keep the stored strategy', async () => {
    const project = await createProject({
      runtimeType: 'NEXTJS',
      buildStrategy: 'next_standard_v1',
    });
    await save(project._id, { buildStrategy: 'next_standard_v1' });
    const saved = await Project.findById(project._id).lean();
    assert.equal(saved.buildConfiguration.healthCheckPath, '/health');
  });

  it('still refuses to switch to a strategy whose pilot is off', async () => {
    const project = await createProject({ runtimeType: 'NEXTJS', buildStrategy: null });
    const result = await save(project._id, { buildStrategy: 'next_standalone_v1' });
    assert.match(result.error, /not enabled/);
  });
});
