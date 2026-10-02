import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ApprovalStatus,
  DeploymentStatus,
  DetectionStatus,
  ProjectStatus,
} from '@hellodeploy/contracts';
import { deriveProjectState } from '../../apps/web/src/services/project-discovery.service.js';

const readyProject = {
  status: ProjectStatus.ACTIVE,
  detection: { status: DetectionStatus.READY },
  activeDeploymentId: null,
};
const repository = { accessStatus: 'ACTIVE' };

describe('derived project discovery state', () => {
  it('prioritizes lifecycle and repository access states', () => {
    assert.equal(
      deriveProjectState({ project: { ...readyProject, status: ProjectStatus.ARCHIVED } }).key,
      'archived',
    );
    assert.equal(
      deriveProjectState({ project: readyProject, repository: { accessStatus: 'REVOKED' } }).key,
      'needs_attention',
    );
  });

  it('distinguishes review, deployment, failure, live, and deployable states', () => {
    assert.equal(
      deriveProjectState({
        project: readyProject,
        repository,
        latestApproval: { status: ApprovalStatus.PENDING },
      }).key,
      'awaiting_review',
    );
    assert.equal(
      deriveProjectState({
        project: readyProject,
        repository,
        latestDeployment: { status: DeploymentStatus.BUILDING },
      }).key,
      'deploying',
    );
    assert.equal(
      deriveProjectState({
        project: readyProject,
        repository,
        latestDeployment: { status: DeploymentStatus.FAILED },
      }).key,
      'failed',
    );
    assert.equal(
      deriveProjectState({
        project: { ...readyProject, activeDeploymentId: 'deployment-id' },
        repository,
      }).key,
      'live',
    );
    assert.equal(deriveProjectState({ project: readyProject, repository }).key, 'ready_to_deploy');
  });
});
