import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { Deployment, Project, ProjectMembership, User } from '@hellodeploy/database';
import { clearTestDb, startTestDb, stopTestDb } from '../helpers/worker-db.js';

import {
  ApprovalStatus,
  DeploymentStatus,
  DetectionStatus,
  ProjectStatus,
  ProjectRole,
  UserStatus,
} from '@hellodeploy/contracts';
import {
  deriveProjectState,
  getDashboardStatus,
} from '../../apps/web/src/services/project-discovery.service.js';

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

describe('dashboard deployment status polling', () => {
  before(startTestDb);
  beforeEach(clearTestDb);
  after(stopTestDb);

  async function seedDeployment(status, email = 'owner@example.test') {
    const user = await User.create({
      firstName: 'Project',
      lastName: 'Owner',
      email,
      passwordHash: 'test-password-hash',
      status: UserStatus.ACTIVE,
    });
    const project = await Project.create({
      name: 'Status App',
      slug: `status-app-${email.split('@')[0]}`,
      ownerId: user._id,
      status: ProjectStatus.ACTIVE,
    });
    await ProjectMembership.create({
      projectId: project._id,
      userId: user._id,
      role: ProjectRole.OWNER,
      acceptedAt: new Date(),
    });
    const deployment = await Deployment.create({
      projectId: project._id,
      sequenceNumber: 1,
      triggerType: 'MANUAL',
      requestedBy: user._id,
      commitSha: 'a'.repeat(40),
      configurationVersion: 1,
      status,
      currentStage: status === DeploymentStatus.BUILDING ? 'BUILD' : 'COMPLETE',
    });
    return { user, deployment };
  }

  it('returns a requested deployment after it reaches a terminal state', async () => {
    const { user, deployment } = await seedDeployment(DeploymentStatus.HEALTHY);
    const payload = await getDashboardStatus(user._id, deployment._id.toString());

    assert.equal(payload.deployments.length, 1);
    assert.equal(payload.deployments[0].id, deployment._id.toString());
    assert.equal(payload.deployments[0].terminal, true);
    assert.deepEqual(payload.deployments[0].presentation, {
      label: 'Live',
      tone: 'healthy',
      hint: 'This release passed its checks and is serving traffic.',
    });
  });

  it('never returns another user’s requested deployment', async () => {
    const owner = await seedDeployment(DeploymentStatus.HEALTHY, 'owner@example.test');
    const other = await seedDeployment(DeploymentStatus.FAILED, 'other@example.test');
    const payload = await getDashboardStatus(owner.user._id, other.deployment._id.toString());

    assert.deepEqual(payload.deployments, []);
    assert.deepEqual(payload.activeDeployments, []);
  });

  it('bounds and validates requested deployment ids', async () => {
    const { user, deployment } = await seedDeployment(DeploymentStatus.FAILED);
    const invalidIds = Array.from({ length: 20 }, () => 'not-an-object-id').join(',');
    const payload = await getDashboardStatus(
      user._id,
      `${invalidIds},${deployment._id},${deployment._id}`,
    );

    assert.equal(payload.deployments.length, 1);
  });
});
