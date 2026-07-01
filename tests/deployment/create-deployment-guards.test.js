import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { validateProjectDeploymentEligibility } =
  await import('../../apps/web/src/services/deployment.service.js');
const { DeploymentMode, ProjectStatus } = await import('@hellodeploy/contracts');

describe('deployment creation eligibility guard', () => {
  it('blocks draft projects', () => {
    assert.equal(
      validateProjectDeploymentEligibility({
        status: ProjectStatus.DRAFT,
        deploymentMode: DeploymentMode.MANUAL,
      }),
      'Project must be approved and active before deployment.',
    );
  });

  it('blocks suspended projects', () => {
    assert.equal(
      validateProjectDeploymentEligibility({
        status: ProjectStatus.SUSPENDED,
        deploymentMode: DeploymentMode.MANUAL,
      }),
      'Project must be approved and active before deployment.',
    );
  });

  it('blocks archived projects', () => {
    assert.equal(
      validateProjectDeploymentEligibility({
        status: ProjectStatus.ARCHIVED,
        deploymentMode: DeploymentMode.MANUAL,
      }),
      'Project must be approved and active before deployment.',
    );
  });

  it('blocks active projects that still require approval', () => {
    assert.equal(
      validateProjectDeploymentEligibility({
        status: ProjectStatus.ACTIVE,
        deploymentMode: DeploymentMode.APPROVAL_REQUIRED,
      }),
      'This project requires admin approval before deployments can run.',
    );
  });

  it('allows active projects in manual mode', () => {
    assert.equal(
      validateProjectDeploymentEligibility({
        status: ProjectStatus.ACTIVE,
        deploymentMode: DeploymentMode.MANUAL,
      }),
      null,
    );
  });

  it('allows active projects in automatic mode', () => {
    assert.equal(
      validateProjectDeploymentEligibility({
        status: ProjectStatus.ACTIVE,
        deploymentMode: DeploymentMode.AUTOMATIC,
      }),
      null,
    );
  });
});
