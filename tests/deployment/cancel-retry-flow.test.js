import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const { isRetryableDeploymentStatus, buildDeploymentJobPayload } =
  await import('../../apps/web/src/services/deployment.service.js');
const { DeploymentStatus } = await import('@hellodeploy/contracts');

const deploymentService = await readFile(
  new URL('../../apps/web/src/services/deployment.service.js', import.meta.url),
  'utf8',
);

const deploymentViews = {
  list: await readFile(
    new URL('../../apps/web/src/views/pages/projects/deployments.ejs', import.meta.url),
    'utf8',
  ),
  detail: await readFile(
    new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
    'utf8',
  ),
};

const deploymentController = await readFile(
  new URL('../../apps/web/src/controllers/deployment.controller.js', import.meta.url),
  'utf8',
);

function id(value) {
  return { toString: () => value };
}

describe('deployment cancel and retry flows', () => {
  it('allows manual retry only for failed or cancelled deployments', () => {
    assert.equal(isRetryableDeploymentStatus(DeploymentStatus.FAILED), true);
    assert.equal(isRetryableDeploymentStatus(DeploymentStatus.CANCELLED), true);
    assert.equal(isRetryableDeploymentStatus(DeploymentStatus.QUEUED), false);
    assert.equal(isRetryableDeploymentStatus(DeploymentStatus.BUILDING), false);
    assert.equal(isRetryableDeploymentStatus(DeploymentStatus.HEALTHY), false);
  });

  it('uses the exact original commit when queueing a retry deployment', () => {
    const payload = buildDeploymentJobPayload({
      project: { _id: id('project-1') },
      deployment: { _id: id('deployment-retry') },
      commitSha: 'deadbeef34567890abcdef1234567890abcdef12',
      repositoryId: id('repo-1'),
      runtimeType: 'NODE',
      imageTag: 'hello-app-deadbee-12',
      actorId: 'user-1',
      noCache: false,
      correlationId: 'corr-retry',
    });

    assert.equal(payload.commitSha, 'deadbeef34567890abcdef1234567890abcdef12');
    assert.equal(payload.noCache, false);
  });

  it('guards cancellation through active deployment states', () => {
    assert.match(
      deploymentService,
      /export async function cancelDeployment\(deploymentId, projectId, actorId, opts = \{\}\)/,
    );
    assert.match(deploymentService, /Deployment\.findOne\(\{ _id: deploymentId, projectId \}\)/);
    assert.match(deploymentController, /cancelDeployment\(deploymentId, project\._id/);
    assert.match(deploymentService, /if \(!isActive\(deployment\.status\)\)/);
    assert.match(deploymentService, /status: DeploymentStatus\.CANCELLED/);
    assert.match(deploymentService, /action: 'deployment\.cancelled'/);
  });

  it('scopes retry to the current project before enqueueing replacement work', () => {
    assert.match(
      deploymentService,
      /export async function retryDeployment\(deploymentId, projectId, actorId, opts = \{\}\)/,
    );
    assert.match(
      deploymentService,
      /Deployment\.findOne\(\{ _id: deploymentId, projectId \}\)\.lean\(\)/,
    );
    assert.match(deploymentController, /retryDeployment\(deploymentId, project\._id/);
  });

  it('shows cancel and retry actions only in matching UI states', () => {
    assert.match(
      deploymentViews.list,
      /\['QUEUED','VALIDATING','BUILDING','DEPLOYING'\]\.includes\(d\.status\)/,
    );
    assert.match(deploymentViews.list, /\['FAILED','CANCELLED'\]\.includes\(d\.status\)/);
    assert.match(
      deploymentViews.detail,
      /const isActive = \['QUEUED','VALIDATING','BUILDING','DEPLOYING'\]/,
    );
    assert.match(deploymentViews.detail, /const isRetryable = \['FAILED','CANCELLED'\]/);
  });
});
