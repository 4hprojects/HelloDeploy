import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import {
  Deployment,
  DeploymentEvent,
  Project,
  Repository,
  StudyDeployment,
} from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment, createRepository } from '../helpers/worker-fixtures.js';

const { archiveDeploymentsForStudy, MAX_STUDY_LOG_LINES } =
  await import('../../apps/worker/src/jobs/archive-study.job.js');

const NOW = new Date('2026-10-13T12:00:00Z');
const FINISHED = new Date('2026-10-13T11:00:00Z');
const run = () => archiveDeploymentsForStudy({ now: () => NOW });

async function seedFinishedDeployment(overrides = {}) {
  const project = await createProject({ slug: 'helloeventhub', name: 'Hello Event Hub' });
  const repo = await createRepository(project._id, {
    fullName: 'acme-labs/helloeventhub',
    name: 'helloeventhub',
    ownerLogin: 'acme-labs',
  });
  await Project.updateOne({ _id: project._id }, { $set: { repositoryId: repo._id } });
  const deployment = await createDeployment(project._id, {
    status: DeploymentStatus.FAILED,
    failureCode: 'BUILD_FAILED',
    failureSummary: 'npm ci failed in acme-labs/helloeventhub',
    createdAt: new Date('2026-10-13T10:58:00Z'),
    completedAt: FINISHED,
    ...overrides,
  });
  await DeploymentEvent.create([
    {
      deploymentId: deployment._id,
      stage: 'BUILD',
      level: 'INFO',
      messageRedacted: 'Cloning acme-labs/helloeventhub',
    },
    {
      deploymentId: deployment._id,
      stage: 'BUILD',
      level: 'ERROR',
      messageRedacted: 'npm ERR! code E404',
    },
  ]);
  return { project, deployment };
}

describe('archive-study job', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('archives a finished deployment with anonymized logs', async () => {
    await seedFinishedDeployment();
    await run();
    const row = await StudyDeployment.findOne().lean();
    assert.deepEqual(
      row.logs.map((line) => line.message),
      ['Cloning [repo]', 'npm ERR! code E404'],
    );
  });

  it('anonymizes the failure summary', async () => {
    await seedFinishedDeployment();
    await run();
    const row = await StudyDeployment.findOne().lean();
    assert.equal(row.failureSummary, 'npm ci failed in [repo]');
  });

  it('stores no project, deployment, owner, or commit identifiers', async () => {
    const { project, deployment } = await seedFinishedDeployment();
    await run();
    const serialized = JSON.stringify(await StudyDeployment.findOne().lean());
    for (const identifier of [
      project._id.toString(),
      deployment._id.toString(),
      project.ownerId.toString(),
      deployment.commitSha,
    ]) {
      assert.equal(serialized.includes(identifier), false, `leaked ${identifier}`);
    }
  });

  it('skips deployments that are still running', async () => {
    await seedFinishedDeployment({ status: DeploymentStatus.BUILDING, completedAt: null });
    await run();
    assert.equal(await StudyDeployment.countDocuments(), 0);
  });

  it('waits until a deployment has settled for ten minutes', async () => {
    await seedFinishedDeployment({ completedAt: new Date(NOW.getTime() - 60_000) });
    await run();
    assert.equal(await StudyDeployment.countDocuments(), 0);
  });

  it('archives each deployment once, even across repeated sweeps', async () => {
    await seedFinishedDeployment();
    await run();
    await Deployment.updateMany({}, { $set: { studyArchivedAt: null } });
    await run();
    assert.equal(await StudyDeployment.countDocuments(), 1);
  });

  it('keeps the study row after the project and its deployments are deleted', async () => {
    const { project } = await seedFinishedDeployment();
    await run();
    await Deployment.deleteMany({ projectId: project._id });
    await Project.deleteOne({ _id: project._id });
    assert.equal(await StudyDeployment.countDocuments(), 1);
  });

  it('groups a project’s deployments under one study project key', async () => {
    const { project } = await seedFinishedDeployment();
    await createDeployment(project._id, {
      sequenceNumber: 2,
      status: DeploymentStatus.HEALTHY,
      completedAt: FINISHED,
    });
    await run();
    const keys = await StudyDeployment.distinct('studyProjectKey');
    assert.equal(keys.length, 1);
  });

  it('caps the archived log lines per deployment', async () => {
    const { deployment } = await seedFinishedDeployment();
    await DeploymentEvent.insertMany(
      Array.from({ length: MAX_STUDY_LOG_LINES }, (_, index) => ({
        deploymentId: deployment._id,
        stage: 'BUILD',
        level: 'INFO',
        messageRedacted: `line ${index}`,
      })),
    );
    await run();
    const row = await StudyDeployment.findOne().lean();
    assert.equal(row.logs.length, MAX_STUDY_LOG_LINES);
  });

  it('records the full log line count even when lines are capped', async () => {
    const { deployment } = await seedFinishedDeployment();
    await DeploymentEvent.insertMany(
      Array.from({ length: MAX_STUDY_LOG_LINES }, (_, index) => ({
        deploymentId: deployment._id,
        stage: 'BUILD',
        level: 'INFO',
        messageRedacted: `line ${index}`,
      })),
    );
    await run();
    const row = await StudyDeployment.findOne().lean();
    assert.equal(row.logLineCount, MAX_STUDY_LOG_LINES + 2);
  });

  it('measures total deployment time', async () => {
    await seedFinishedDeployment();
    await run();
    const row = await StudyDeployment.findOne().lean();
    assert.equal(row.totalMs, 2 * 60 * 1000);
  });
});

describe('archive-study job — repository lookups', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('archives a project that has no connected repository', async () => {
    const project = await createProject({ slug: 'no-repo-app' });
    await createDeployment(project._id, {
      status: DeploymentStatus.CANCELLED,
      completedAt: FINISHED,
    });
    await Repository.deleteMany({});
    await run();
    assert.equal(await StudyDeployment.countDocuments(), 1);
  });
});
