import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment, Project } from '@hellodeploy/database';
import {
  DeploymentStatus,
  DeploymentTrigger,
  DeploymentMode,
  DetectionStatus,
  ProjectStatus,
  RuntimeType,
} from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { assessDeploymentReadiness, CHECK_STATUS } =
  await import('../../apps/web/src/services/deployment-readiness.service.js');

const COMMIT = 'a'.repeat(40);

function projectFixture(overrides = {}) {
  return {
    _id: objectId(),
    slug: 'hellouniversity',
    name: 'Demo',
    status: ProjectStatus.ACTIVE,
    platformSubdomain: 'hellouniversity',
    productionBranch: 'main',
    runtimeType: RuntimeType.NEXTJS,
    deploymentMode: DeploymentMode.MANUAL,
    configurationVersion: 1,
    buildConfiguration: {
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      healthCheckPath: '/',
    },
    detection: { status: DetectionStatus.READY, issues: [], checkedCommitSha: COMMIT },
    ...overrides,
  };
}

function repositoryFixture(projectId, overrides = {}) {
  return {
    _id: objectId(),
    projectId,
    fullName: 'henson/demo',
    defaultBranch: 'main',
    accessStatus: 'ACTIVE',
    lastCommitSha: COMMIT,
    ...overrides,
  };
}

/** A project and repository that agree with each other and pass every check. */
function readyPair(overrides = {}) {
  const project = projectFixture(overrides);
  const repository = repositoryFixture(project._id);
  project.repositoryId = repository._id;
  return { project, repository };
}

const checkFor = (result, key) => result.checks.find((check) => check.key === key);

describe('deployment readiness', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  it('passes a fully configured website', async () => {
    const { project, repository } = readyPair();
    const result = await assessDeploymentReadiness({ project, repository });

    assert.equal(result.isReady, true);
  });

  it('blocks on a missing required setting', async () => {
    const { project, repository } = readyPair();
    const result = await assessDeploymentReadiness({
      project,
      repository,
      missingEnvKeys: ['DATABASE_URL'],
    });

    assert.equal(result.isReady, false);
  });

  it('names the missing setting the way the spec asks', async () => {
    const { project, repository } = readyPair();
    const result = await assessDeploymentReadiness({
      project,
      repository,
      missingEnvKeys: ['DATABASE_URL'],
    });

    assert.equal(
      checkFor(result, 'environment').message,
      'DATABASE_URL is required before this website can start.',
    );
  });

  it('links straight to the field that fixes a missing setting', async () => {
    const { project, repository } = readyPair();
    const result = await assessDeploymentReadiness({
      project,
      repository,
      missingEnvKeys: ['DATABASE_URL'],
    });

    assert.equal(
      checkFor(result, 'environment').action.href,
      '/projects/hellouniversity/setup/environment',
    );
  });

  it('gives every blocking check somewhere to go', async () => {
    const { project, repository } = readyPair({
      detection: { status: DetectionStatus.NOT_RUN, issues: [] },
      runtimeType: RuntimeType.UNKNOWN,
    });
    const result = await assessDeploymentReadiness({ project, repository });

    const actionless = result.checks.filter(
      (check) => check.status === CHECK_STATUS.BLOCKING && !check.action,
    );
    assert.deepEqual(actionless, []);
  });

  it('blocks while another deployment is already running', async () => {
    const { project, repository } = readyPair();
    await Deployment.create({
      projectId: project._id,
      sequenceNumber: 1,
      triggerType: DeploymentTrigger.MANUAL,
      requestedBy: objectId(),
      commitSha: COMMIT,
      configurationVersion: 1,
      status: DeploymentStatus.BUILDING,
    });

    const result = await assessDeploymentReadiness({ project, repository });
    assert.equal(checkFor(result, 'no_active_deployment').status, CHECK_STATUS.BLOCKING);
  });

  it('points at the deployment that is already running', async () => {
    const { project, repository } = readyPair();
    const active = await Deployment.create({
      projectId: project._id,
      sequenceNumber: 1,
      triggerType: DeploymentTrigger.MANUAL,
      requestedBy: objectId(),
      commitSha: COMMIT,
      configurationVersion: 1,
      status: DeploymentStatus.BUILDING,
    });

    const result = await assessDeploymentReadiness({ project, repository });
    assert.match(
      checkFor(result, 'no_active_deployment').action.href,
      new RegExp(String(active._id)),
    );
  });

  it('blocks when the chosen address has been taken since', async () => {
    const { project, repository } = readyPair();
    await Project.create({
      name: 'Other',
      slug: 'other',
      ownerId: objectId(),
      status: ProjectStatus.ACTIVE,
      platformSubdomain: 'hellouniversity',
    });

    const result = await assessDeploymentReadiness({ project, repository });
    assert.equal(checkFor(result, 'website_address').status, CHECK_STATUS.BLOCKING);
  });

  it('never claims a passing check for server capacity, which nothing measures', async () => {
    const { project, repository } = readyPair();
    const result = await assessDeploymentReadiness({ project, repository });

    assert.ok(!result.checks.some((check) => /capacity/i.test(check.label)));
  });

  it('drops the platform vocabulary from a blocking message', async () => {
    const { project, repository } = readyPair({
      detection: { status: DetectionStatus.NOT_RUN, issues: [] },
    });
    const result = await assessDeploymentReadiness({ project, repository });

    assert.doesNotMatch(checkFor(result, 'successful_detection').message, /Check my app/);
  });

  it('flags that a first-time website needs review', async () => {
    const { project, repository } = readyPair({ status: ProjectStatus.DRAFT });
    const result = await assessDeploymentReadiness({ project, repository });

    assert.equal(result.summary.needsReview, true);
  });

  it('shows the address the visitor will use in the summary', async () => {
    const { project, repository } = readyPair();
    const result = await assessDeploymentReadiness({ project, repository });

    assert.equal(result.summary.address, 'hellouniversity');
  });

  it('lists which checks blocked, for later diagnosis', async () => {
    const { project, repository } = readyPair();
    const result = await assessDeploymentReadiness({
      project,
      repository,
      missingEnvKeys: ['DATABASE_URL'],
    });

    assert.deepEqual(result.blocking, ['environment']);
  });
});
