import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { validateProjectDeploymentEligibility, validateBuildStrategyReadiness } =
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

describe('build strategy readiness guard', () => {
  const pythonEnabled = () => true;
  const legacyOnly = (strategy) => !strategy || strategy === 'legacy_generated';
  const pythonProject = (overrides = {}) => ({
    _id: 'p1',
    runtimeType: 'PYTHON',
    buildStrategy: 'python_flask_v1',
    buildConfiguration: { applicationModule: 'app:app' },
    ...overrides,
  });

  it('allows a confirmed Python strategy', () => {
    assert.equal(validateBuildStrategyReadiness(pythonProject(), pythonEnabled), null);
  });

  it('blocks a strategy that is not enabled for the project', () => {
    assert.match(
      validateBuildStrategyReadiness(pythonProject(), legacyOnly),
      /not enabled for this project/,
    );
  });

  it('asks an enabled Python project to save its framework first', () => {
    assert.match(
      validateBuildStrategyReadiness(pythonProject({ buildStrategy: null }), pythonEnabled),
      /Choose the Python framework/,
    );
  });

  it('explains the pilot to a Python project outside it', () => {
    assert.match(
      validateBuildStrategyReadiness(pythonProject({ buildStrategy: null }), legacyOnly),
      /limited pilot/,
    );
  });

  it('blocks a Python strategy without a valid application module', () => {
    assert.match(
      validateBuildStrategyReadiness(
        pythonProject({ buildConfiguration: { applicationModule: null } }),
        pythonEnabled,
      ),
      /Confirm the application module/,
    );
  });

  it('asks an enabled PHP project to save its app type first', () => {
    assert.match(
      validateBuildStrategyReadiness(
        { _id: 'p3', runtimeType: 'PHP', buildStrategy: null },
        pythonEnabled,
      ),
      /Choose the PHP app type/,
    );
  });

  it('allows a saved PHP strategy', () => {
    assert.equal(
      validateBuildStrategyReadiness(
        { _id: 'p3', runtimeType: 'PHP', buildStrategy: 'php_laravel_v1' },
        pythonEnabled,
      ),
      null,
    );
  });

  it('leaves legacy Node projects unaffected', () => {
    assert.equal(
      validateBuildStrategyReadiness(
        { _id: 'p2', runtimeType: 'NODEJS', buildStrategy: null },
        legacyOnly,
      ),
      null,
    );
  });
});
