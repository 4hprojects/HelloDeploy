import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

import { DeploymentEvent } from '@hellodeploy/database';
import { DeploymentStatus } from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, objectId } from '../helpers/worker-db.js';

const { setWorkerRedis } = await import('../../apps/worker/src/queue/worker-redis.js');
const { logEvent, updateStatus } = await import('../../apps/worker/src/deployment/pipeline.js');
const { createProject, createDeployment } = await import('../helpers/worker-fixtures.js');

function makeFakePublisher() {
  const published = [];
  return {
    published,
    status: 'ready',
    async publish(channel, raw) {
      published.push({ channel, payload: JSON.parse(raw) });
    },
  };
}

describe('worker deploy-log pub/sub publishing', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    setWorkerRedis(null);
    await stopTestDb();
  });

  it('publishes each log event to the deployment channel', async () => {
    const publisher = makeFakePublisher();
    setWorkerRedis(publisher);
    const deploymentId = objectId();
    await logEvent(deploymentId, 'DEPLOY', 'INFO', 'Allocated port 10001.', 'corr-1');
    const msg = publisher.published[0];
    assert.equal(msg.channel, `deploy-logs:${deploymentId}`);
    assert.equal(msg.payload.type, 'log');
    assert.equal(msg.payload.stage, 'DEPLOY');
    assert.equal(msg.payload.message, 'Allocated port 10001.');
  });

  it('publishes the stored redacted text, never the raw input', async () => {
    const publisher = makeFakePublisher();
    setWorkerRedis(publisher);
    const deploymentId = objectId();
    await logEvent(deploymentId, 'DEPLOY', 'INFO', 'connecting with password=hunter2', 'corr-2');
    const msg = publisher.published[0];
    const stored = await DeploymentEvent.findById(msg.payload.id).lean();
    assert.equal(msg.payload.message, stored.messageRedacted);
  });

  it('publishes a status message on terminal transitions', async () => {
    const publisher = makeFakePublisher();
    setWorkerRedis(publisher);
    const project = await createProject();
    const deployment = await createDeployment(project._id, { status: DeploymentStatus.DEPLOYING });
    await updateStatus(deployment._id, DeploymentStatus.FAILED, { completedAt: new Date() });
    const statusMsg = publisher.published.find((m) => m.payload.type === 'status');
    assert.deepEqual(statusMsg.payload, { type: 'status', status: DeploymentStatus.FAILED });
  });

  it('skips publishing (without throwing) when the connection is not ready', async () => {
    const publisher = makeFakePublisher();
    publisher.status = 'connecting';
    setWorkerRedis(publisher);
    await logEvent(objectId(), 'DEPLOY', 'INFO', 'hello', 'corr-3');
    assert.equal(publisher.published.length, 0);
  });
});
