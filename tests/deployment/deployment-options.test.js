import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { buildDeploymentJobPayload, createConfigurationSnapshot, parseNoCacheFlag } =
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
      version: 2,
      correlationId: 'corr-1',
      actorId: 'user-1',
      actorRole: 'USER',
      projectId: 'project-1',
      deploymentId: 'deployment-1',
      noCache: true,
    });
  });

  it('keeps mutable configuration out of retry/current-commit job payloads', () => {
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

    assert.equal(payload.commitSha, undefined);
    assert.equal(payload.repositoryId, undefined);
    assert.equal(payload.runtimeType, undefined);
    assert.equal(payload.imageTag, undefined);
    assert.equal(payload.noCache, false);
    assert.equal(payload.deploymentId, 'deployment-2');
  });

  it('captures an immutable deployment configuration snapshot', () => {
    const snapshot = createConfigurationSnapshot(
      {
        runtimeType: 'NEXTJS',
        buildStrategy: 'next_standard_v1',
        configurationVersion: 7,
        environmentVersion: 4,
        buildConfiguration: {
          applicationRoot: 'apps/web',
          buildCommand: 'npm run build',
          startCommand: 'npm start',
          outputDirectory: '.next',
          applicationPort: 3000,
          healthCheckPath: '/health',
        },
      },
      'abcdef1234567890abcdef1234567890abcdef12',
    );
    assert.deepEqual(snapshot, {
      schemaVersion: 1,
      buildStrategy: 'next_standard_v1',
      runtimeType: 'NEXTJS',
      buildConfiguration: {
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        outputDirectory: '.next',
        applicationPort: 3000,
        healthCheckPath: '/health',
        applicationRoot: 'apps/web',
        applicationModule: null,
      },
      projectConfigurationVersion: 7,
      environmentVersion: 4,
      sourceCommit: 'abcdef1234567890abcdef1234567890abcdef12',
      sourceRepositoryId: null,
    });
  });
});
