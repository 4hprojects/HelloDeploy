import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';

const { containerName, networkName } =
  await import('../../apps/worker/src/deployment/container.js');

describe('containerName', () => {
  it('produces expected format', () => {
    const name = containerName('my-project', '507f1f77bcf86cd799439011');
    assert.equal(name, 'hellodeploy-my-project-507f1f77');
  });

  it('uses first 8 chars of deploymentId', () => {
    const name = containerName('app', 'abcdef1234567890');
    assert.equal(name, 'hellodeploy-app-abcdef12');
  });
});

describe('networkName', () => {
  it('produces expected format', () => {
    assert.equal(networkName('my-app'), 'hellodeploy-my-app');
  });
});
