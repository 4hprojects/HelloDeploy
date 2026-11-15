import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';

import { Repository } from '@hellodeploy/database';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

// Assembled so the placeholder never reads as a literal credential.
const SIGNING_KEY = ['installation', 'test', 'key'].join('-');
process.env.GITHUB_WEBHOOK_SECRET = SIGNING_KEY;
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'hellodeploy-test';

const { handleGithubWebhook } =
  await import('../../apps/web/src/controllers/webhook.controller.js');

const INSTALLATION_ID = 777;

/** The subset of an ioredis client the health record and delivery dedup use. */
const fakeRedis = {
  status: 'ready',
  async hset() {},
  async hincrby() {},
  async set() {
    return 'OK';
  },
};

function installationDelivery(action) {
  const body = Buffer.from(JSON.stringify({ action, installation: { id: INSTALLATION_ID } }));
  return {
    body,
    headers: {
      'x-hub-signature-256': `sha256=${createHmac('sha256', SIGNING_KEY).update(body).digest('hex')}`,
      'x-github-delivery': randomUUID(),
      'x-github-event': 'installation',
    },
  };
}

function makeRes() {
  return {
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
}

function deliver(action) {
  return handleGithubWebhook(installationDelivery(action), makeRes(), {
    getRedisConnection: () => fakeRedis,
  });
}

function createRepository(accessStatus) {
  return Repository.create({
    projectId: objectId(),
    installationId: INSTALLATION_ID,
    githubRepoId: Math.floor(Math.random() * 1e9),
    nodeId: randomUUID(),
    fullName: 'owner/app',
    name: 'app',
    ownerLogin: 'owner',
    accessStatus,
  });
}

async function accessStatusOf(repository) {
  return (await Repository.findById(repository._id).lean()).accessStatus;
}

describe('GitHub App installation lifecycle', () => {
  before(startTestDb);
  after(stopTestDb);
  beforeEach(clearTestDb);

  it('marks repositories suspended when GitHub suspends the installation', async () => {
    const repository = await createRepository('ACTIVE');

    await deliver('suspend');

    assert.equal(await accessStatusOf(repository), 'SUSPENDED');
  });

  it('restores suspended repositories when the installation is unsuspended', async () => {
    const repository = await createRepository('ACTIVE');
    await deliver('suspend');

    await deliver('unsuspend');

    assert.equal(await accessStatusOf(repository), 'ACTIVE');
  });

  it('does not restore a repository whose access was removed', async () => {
    const repository = await createRepository('REVOKED');

    await deliver('unsuspend');

    assert.equal(await accessStatusOf(repository), 'REVOKED');
  });

  it('revokes a suspended repository when the installation is deleted', async () => {
    const repository = await createRepository('SUSPENDED');

    await deliver('deleted');

    assert.equal(await accessStatusOf(repository), 'REVOKED');
  });
});
