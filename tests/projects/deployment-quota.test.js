import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Quota } from '@hellodeploy/database';
import { DeploymentStatus, QuotaScope } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment, createRepository } from '../helpers/worker-fixtures.js';

// Only rejection paths are exercised here. A request that passes the gate goes
// on to open the lazy Redis queue connection, which would keep the test
// process alive; the accepted path is already covered by tests/deployment.
const { createDeployment: requestDeployment } =
  await import('../../apps/web/src/services/deployment.service.js');

async function seedDeployableProject(ownerId) {
  const project = await createProject(ownerId ? { ownerId } : {});
  const repo = await createRepository(project._id, { defaultBranch: 'main' });
  project.repositoryId = repo._id;
  await project.save();
  return project;
}

function setQuota(project, fields) {
  return Quota.create({
    scopeType: QuotaScope.PROJECT,
    scopeId: project._id,
    createdBy: project.ownerId,
    ...fields,
  });
}

function request(project) {
  return requestDeployment({
    projectId: project._id,
    actorId: project.ownerId,
    commitSha: 'a'.repeat(40),
  });
}

describe('deployment quota enforcement', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('refuses a deployment once the monthly allowance is spent', async () => {
    const project = await seedDeployableProject();
    await setQuota(project, { deploymentsPerMonth: 1 });
    await createDeployment(project._id, { sequenceNumber: 1, status: DeploymentStatus.FAILED });

    assert.equal((await request(project)).success, false);
  });

  it('names the monthly allowance in the rejection', async () => {
    const project = await seedDeployableProject();
    await setQuota(project, { deploymentsPerMonth: 1 });
    await createDeployment(project._id, { sequenceNumber: 1, status: DeploymentStatus.FAILED });

    assert.match((await request(project)).error, /1 of its deployments this month/);
  });

  it('refuses to start a second app when the owner may only run one', async () => {
    const running = await seedDeployableProject();
    await createDeployment(running._id, {
      sequenceNumber: 1,
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'container-live',
    });

    const idle = await seedDeployableProject(running.ownerId);
    await setQuota(idle, { maxRunningApps: 1, deploymentsPerMonth: 50 });

    assert.match((await request(idle)).error, /running/);
  });

  it('does not count a project against its own running-app slot on redeploy', async () => {
    const project = await seedDeployableProject();
    await createDeployment(project._id, {
      sequenceNumber: 1,
      status: DeploymentStatus.HEALTHY,
      activeContainerId: 'container-live',
    });
    await setQuota(project, { maxRunningApps: 1, deploymentsPerMonth: 1 });

    // The monthly limit bites first, proving the running-app check let it past.
    assert.match((await request(project)).error, /deployments this month/);
  });
});
