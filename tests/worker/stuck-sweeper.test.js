import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb } from '../helpers/worker-db.js';
import { createProject, createDeployment } from '../helpers/worker-fixtures.js';

const { sweepStuckDeployments } = await import('../../apps/worker/src/deployment/stuck-sweeper.js');

const HOUR_MS = 60 * 60 * 1000;

async function seedAged(projectId, status, ageMs, sequenceNumber = 1) {
  const deployment = await createDeployment(projectId, { status, sequenceNumber });
  // timestamps:true manages updatedAt, so age it past the sweeper's cutoff.
  await Deployment.collection.updateOne(
    { _id: deployment._id },
    { $set: { updatedAt: new Date(Date.now() - ageMs) } },
  );
  return deployment;
}

async function statusOf(id) {
  return (await Deployment.findById(id).lean()).status;
}

describe('stuck deployment sweeper', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('fails a deployment abandoned while building', async () => {
    const project = await createProject();
    const deployment = await seedAged(project._id, DeploymentStatus.BUILDING, 3 * HOUR_MS);
    await sweepStuckDeployments();
    assert.equal(await statusOf(deployment._id), DeploymentStatus.FAILED);
  });

  it('cancels rather than fails a deployment abandoned while queued', async () => {
    const project = await createProject();
    const deployment = await seedAged(project._id, DeploymentStatus.QUEUED, 3 * HOUR_MS);
    await sweepStuckDeployments();
    assert.equal(await statusOf(deployment._id), DeploymentStatus.CANCELLED);
  });

  it('leaves a recent in-flight deployment alone', async () => {
    const project = await createProject();
    const deployment = await seedAged(project._id, DeploymentStatus.BUILDING, 5 * 60 * 1000);
    await sweepStuckDeployments();
    assert.equal(await statusOf(deployment._id), DeploymentStatus.BUILDING);
  });

  it('leaves an already terminal deployment alone', async () => {
    const project = await createProject();
    const deployment = await seedAged(project._id, DeploymentStatus.HEALTHY, 3 * HOUR_MS);
    await sweepStuckDeployments();
    assert.equal(await statusOf(deployment._id), DeploymentStatus.HEALTHY);
  });

  it('stamps a failure code the user-facing copy table can explain', async () => {
    const project = await createProject();
    const deployment = await seedAged(project._id, DeploymentStatus.DEPLOYING, 3 * HOUR_MS);
    await sweepStuckDeployments();
    const fresh = await Deployment.findById(deployment._id).lean();
    assert.equal(fresh.failureCode, 'DEPLOYMENT_ABANDONED');
  });

  it('reports how many deployments it resolved', async () => {
    const project = await createProject();
    await seedAged(project._id, DeploymentStatus.BUILDING, 3 * HOUR_MS, 1);
    await seedAged(project._id, DeploymentStatus.DEPLOYING, 3 * HOUR_MS, 2);
    assert.equal(await sweepStuckDeployments(), 2);
  });

  it('honours a caller-supplied age threshold', async () => {
    const project = await createProject();
    const deployment = await seedAged(project._id, DeploymentStatus.BUILDING, 30 * 60 * 1000);
    await sweepStuckDeployments({ maxAgeMs: 10 * 60 * 1000 });
    assert.equal(await statusOf(deployment._id), DeploymentStatus.FAILED);
  });
});
