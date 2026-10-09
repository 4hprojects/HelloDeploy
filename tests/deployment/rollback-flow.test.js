import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { Deployment } from '@hellodeploy/database';

const { buildRollbackReleaseJobPayload, buildRollbackTargetQuery, isRollbackTargetEligible } =
  await import('../../apps/web/src/services/deployment.service.js');
const { DeploymentStatus } = await import('@hellodeploy/contracts');
const deploymentService = await readFile(
  new URL('../../apps/web/src/services/deployment.service.js', import.meta.url),
  'utf8',
);
const deploymentDetail = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
  'utf8',
);

function id(value) {
  return { toString: () => value };
}

describe('deployment rollback flow', () => {
  it('selects retained healthy deployments while excluding the active deployment', () => {
    const query = buildRollbackTargetQuery(id('project-1'), id('deployment-active'));

    assert.equal(query.projectId.toString(), 'project-1');
    assert.equal(query.status, DeploymentStatus.HEALTHY);
    assert.equal(query._id.$ne.toString(), 'deployment-active');
  });

  it('accepts only healthy non-active targets with an available image', () => {
    const target = {
      _id: id('deployment-old'),
      projectId: id('project-1'),
      status: DeploymentStatus.HEALTHY,
      imageTag: 'hello-app-old',
    };

    assert.equal(isRollbackTargetEligible(target, id('project-1'), id('deployment-active')), true);
    assert.equal(isRollbackTargetEligible(target, id('project-1'), id('deployment-old')), false);
    assert.equal(
      isRollbackTargetEligible({ ...target, status: DeploymentStatus.FAILED }, id('project-1')),
      false,
    );
    assert.equal(isRollbackTargetEligible({ ...target, imageTag: null }, id('project-1')), false);
    assert.equal(
      isRollbackTargetEligible({ ...target, projectId: id('project-2') }, id('project-1')),
      false,
    );
  });

  it('builds rollback queue payloads from the new rollback deployment and source target', () => {
    assert.deepEqual(
      buildRollbackReleaseJobPayload({
        projectId: id('project-1'),
        deployment: { _id: id('deployment-rollback') },
        targetDeploymentId: id('deployment-source'),
        actorId: 'user-1',
        correlationId: 'corr-rollback',
      }),
      {
        version: 1,
        correlationId: 'corr-rollback',
        actorId: 'user-1',
        actorRole: 'USER',
        projectId: 'project-1',
        deploymentId: 'deployment-rollback',
        sourceDeploymentId: 'deployment-source',
      },
    );
  });

  it('records and renders both the replaced release and rollback target', () => {
    assert.ok(Deployment.schema.path('replacedDeploymentId'));
    assert.match(deploymentService, /replacedDeploymentId: project\.activeDeploymentId \?\? null/);
    assert.match(deploymentDetail, /replacedDeployment\.sequenceNumber/);
    assert.match(deploymentDetail, /rollbackSource\.sequenceNumber/);
    assert.match(deploymentDetail, /details unavailable/);
  });
});
