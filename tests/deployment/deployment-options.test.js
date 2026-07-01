import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { buildDeploymentJobPayload, parseNoCacheFlag } =
  await import('../../apps/web/src/services/deployment.service.js');

function id(value) {
  return { toString: () => value };
}

describe('deployment option payloads', () => {
  it('parses no-cache form values from deployment requests', () => {
    assert.equal(parseNoCacheFlag('true'), true);
    assert.equal(parseNoCacheFlag('1'), true);
    assert.equal(parseNoCacheFlag('false'), false);
    assert.equal(parseNoCacheFlag(undefined), false);
  });

  it('builds a latest-commit deployment job payload with no-cache enabled', () => {
    const payload = buildDeploymentJobPayload({
      project: { _id: id('project-1') },
      deployment: { _id: id('deployment-1') },
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
      repositoryId: id('repo-1'),
      runtimeType: 'NODE',
      imageTag: 'hello-app-abcdef1-7',
      actorId: 'user-1',
      noCache: true,
      correlationId: 'corr-1',
    });

    assert.deepEqual(payload, {
      version: 1,
      correlationId: 'corr-1',
      actorId: 'user-1',
      actorRole: 'USER',
      projectId: 'project-1',
      deploymentId: 'deployment-1',
      commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
      repositoryId: 'repo-1',
      runtimeType: 'NODE',
      imageTag: 'hello-app-abcdef1-7',
      noCache: true,
    });
  });

  it('builds retry/current-commit payloads with the original commit and cache enabled', () => {
    const payload = buildDeploymentJobPayload({
      project: { _id: id('project-1') },
      deployment: { _id: id('deployment-2') },
      commitSha: '1111111234567890abcdef1234567890abcdef12',
      repositoryId: id('repo-1'),
      runtimeType: 'DOCKERFILE',
      imageTag: 'hello-app-1111111-8',
      actorId: 'user-2',
      noCache: false,
      correlationId: 'corr-2',
    });

    assert.equal(payload.commitSha, '1111111234567890abcdef1234567890abcdef12');
    assert.equal(payload.noCache, false);
    assert.equal(payload.deploymentId, 'deployment-2');
  });
});
