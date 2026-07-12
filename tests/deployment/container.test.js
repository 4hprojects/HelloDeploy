import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

describe('managed container runtime limits', () => {
  it('bounds Docker json-file log growth', async () => {
    const source = await readFile(
      new URL('../../apps/worker/src/deployment/container.js', import.meta.url),
      'utf8',
    );
    assert.match(source, /'--log-driver',\s*'json-file'/);
    assert.match(source, /'--log-opt',\s*'max-size=10m'/);
    assert.match(source, /'--log-opt',\s*'max-file=3'/);
  });
});
