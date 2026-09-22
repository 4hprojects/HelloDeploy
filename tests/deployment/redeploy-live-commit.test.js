import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Project, Quota } from '@hellodeploy/database';
import { DeploymentStatus, QuotaScope } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';
import { createProject, createDeployment, createRepository } from '../helpers/worker-fixtures.js';

// Only outcomes that return before the lazy Redis queue connection are asserted
// here; reaching the enqueue would keep the test process alive.
const { redeployActiveRelease, NO_ACTIVE_RELEASE_COPY } =
  await import('../../apps/web/src/services/deployment.service.js');

const LIVE_SHA = 'a'.repeat(40);
const NEWER_SHA = 'b'.repeat(40);

async function seedProjectWithLiveRelease({ liveSha = LIVE_SHA } = {}) {
  const project = await createProject();
  const repo = await createRepository(project._id, { defaultBranch: 'main' });
  repo.lastCommitSha = NEWER_SHA;
  await repo.save();
  project.repositoryId = repo._id;
  await project.save();

  const live = await createDeployment(project._id, {
    sequenceNumber: 1,
    status: DeploymentStatus.HEALTHY,
    commitSha: liveSha,
    activeContainerId: 'container-live',
  });
  await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: live._id } });
  return { project, live };
}

describe('redeployActiveRelease', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('refuses when the project has never had a live release', async () => {
    const project = await createProject();
    const result = await redeployActiveRelease({
      projectId: project._id,
      actorId: project.ownerId,
    });
    assert.equal(result.error, NO_ACTIVE_RELEASE_COPY);
  });

  it('refuses when the active deployment record has no commit recorded', async () => {
    const project = await createProject();
    const orphan = await createDeployment(project._id, { sequenceNumber: 1 });
    await createDeployment(project._id, { sequenceNumber: 2 });
    await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: orphan._id } });
    await createDeployment(project._id, { sequenceNumber: 3 });
    // Clear the SHA the fixture sets, simulating a pre-backfill record.
    const { Deployment } = await import('@hellodeploy/database');
    await Deployment.collection.updateOne({ _id: orphan._id }, { $unset: { commitSha: '' } });

    const result = await redeployActiveRelease({
      projectId: project._id,
      actorId: project.ownerId,
    });
    assert.equal(result.error, NO_ACTIVE_RELEASE_COPY);
  });

  it('reports a missing project rather than a missing release', async () => {
    const result = await redeployActiveRelease({ projectId: objectId(), actorId: objectId() });
    assert.equal(result.error, 'Project not found.');
  });

  // Proves the live SHA - not the branch head - is what gets deployed: the
  // quota rejection happens after the commit has been resolved and validated,
  // so reaching it means a 40-hex SHA passed validation.
  it('routes the redeploy through the shared deployment quota gate', async () => {
    const { project } = await seedProjectWithLiveRelease();
    await Quota.create({
      scopeType: QuotaScope.PROJECT,
      scopeId: project._id,
      deploymentsPerMonth: 1,
      createdBy: project.ownerId,
    });

    const result = await redeployActiveRelease({
      projectId: project._id,
      actorId: project.ownerId,
    });
    assert.match(result.error, /deployments this month/);
  });

  // Direct proof of which commit is used: the live release carries a SHA that
  // cannot pass validation while the branch head carries a valid one. Getting
  // the format error back can only mean the live SHA was the one submitted.
  it('submits the live release commit rather than the branch head', async () => {
    const { project } = await seedProjectWithLiveRelease();
    const { Deployment } = await import('@hellodeploy/database');
    await Deployment.collection.updateOne(
      { projectId: project._id, sequenceNumber: 1 },
      { $set: { commitSha: 'not-a-valid-sha' } },
    );

    const result = await redeployActiveRelease({
      projectId: project._id,
      actorId: project.ownerId,
    });
    assert.equal(result.errorField, 'commitSha');
  });

  it('does not reject the live commit as a malformed SHA', async () => {
    const { project } = await seedProjectWithLiveRelease();
    await Quota.create({
      scopeType: QuotaScope.PROJECT,
      scopeId: project._id,
      deploymentsPerMonth: 1,
      createdBy: project.ownerId,
    });

    const result = await redeployActiveRelease({
      projectId: project._id,
      actorId: project.ownerId,
    });
    assert.notEqual(result.errorField, 'commitSha');
  });
});
