import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';

import { Deployment, Project, Repository } from '@hellodeploy/database';
import {
  DeploymentStage,
  DeploymentStatus,
  DeploymentTrigger,
  FailureCode,
  ProjectStatus,
  RepositoryProvider,
  RepositorySourceType,
} from '@hellodeploy/contracts';
import { startTestDb, stopTestDb, clearTestDb, objectId } from '../helpers/worker-db.js';

const { recordStage, updateStatus } = await import('../../apps/worker/src/deployment/pipeline.js');
const { createDeployment } = await import('../../apps/web/src/services/deployment.service.js');

/**
 * The guarantee a project owner is actually relying on when they turn automatic
 * publishing on: a push that breaks the build must not take their website down.
 *
 * Exercised against the real pipeline helpers and database rather than mocks,
 * because the promise rests on which write happens when.
 */
describe('a failed automatic publish never replaces the live website', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function projectWithLiveRelease() {
    const project = await Project.create({
      name: 'HelloUniversity',
      slug: 'hellouniversity',
      ownerId: objectId(),
      status: ProjectStatus.ACTIVE,
      platformSubdomain: 'hellouniversity',
      productionBranch: 'main',
    });

    const live = await Deployment.create({
      projectId: project._id,
      sequenceNumber: 1,
      triggerType: DeploymentTrigger.MANUAL,
      requestedBy: project.ownerId,
      commitSha: 'a'.repeat(40),
      configurationVersion: 1,
      status: DeploymentStatus.HEALTHY,
      imageTag: 'hellouniversity-aaaaaaa-1',
    });

    await Project.updateOne({ _id: project._id }, { $set: { activeDeploymentId: live._id } });
    return { project, live };
  }

  /** A push arrives, builds, and fails before ever becoming healthy. */
  async function failedAutomaticPublish(project) {
    const attempt = await Deployment.create({
      projectId: project._id,
      sequenceNumber: 2,
      triggerType: DeploymentTrigger.AUTOMATIC,
      requestedBy: project.ownerId,
      commitSha: 'b'.repeat(40),
      commitMessage: 'Break the build',
      configurationVersion: 1,
      status: DeploymentStatus.QUEUED,
    });

    await recordStage(attempt._id, DeploymentStage.PREPARING);
    await recordStage(attempt._id, DeploymentStage.BUILDING);
    await updateStatus(attempt._id, DeploymentStatus.FAILED, {
      failureCode: FailureCode.BUILD_FAILED,
      failureSummary: 'npm ERR! build failed',
      completedAt: new Date(),
    });

    return attempt;
  }

  it('leaves the live release pointer untouched', async () => {
    const { project, live } = await projectWithLiveRelease();
    await failedAutomaticPublish(project);

    const reloaded = await Project.findById(project._id).lean();
    assert.equal(String(reloaded.activeDeploymentId), String(live._id));
  });

  it('leaves the previously live release healthy', async () => {
    const { project, live } = await projectWithLiveRelease();
    await failedAutomaticPublish(project);

    const reloaded = await Deployment.findById(live._id).lean();
    assert.equal(reloaded.status, DeploymentStatus.HEALTHY);
  });

  it('keeps the working image, so restoring needs no rebuild', async () => {
    const { project, live } = await projectWithLiveRelease();
    await failedAutomaticPublish(project);

    const reloaded = await Deployment.findById(live._id).lean();
    assert.equal(reloaded.imageTag, 'hellouniversity-aaaaaaa-1');
  });

  it('records the failed attempt as its own deployment', async () => {
    const { project } = await projectWithLiveRelease();
    const attempt = await failedAutomaticPublish(project);

    const reloaded = await Deployment.findById(attempt._id).lean();
    assert.equal(reloaded.status, DeploymentStatus.FAILED);
  });

  it('attributes the attempt to the push that caused it', async () => {
    const { project } = await projectWithLiveRelease();
    const attempt = await failedAutomaticPublish(project);

    const reloaded = await Deployment.findById(attempt._id).lean();
    assert.equal(reloaded.commitSha, 'b'.repeat(40));
  });

  it('keeps the commit message so the owner knows which change broke it', async () => {
    const { project } = await projectWithLiveRelease();
    const attempt = await failedAutomaticPublish(project);

    const reloaded = await Deployment.findById(attempt._id).lean();
    assert.equal(reloaded.commitMessage, 'Break the build');
  });

  it('marks it as automatic, not as something the owner did', async () => {
    const { project } = await projectWithLiveRelease();
    const attempt = await failedAutomaticPublish(project);

    const reloaded = await Deployment.findById(attempt._id).lean();
    assert.equal(reloaded.triggerType, DeploymentTrigger.AUTOMATIC);
  });

  it('does not leave the history without a healthy release to restore', async () => {
    const { project } = await projectWithLiveRelease();
    await failedAutomaticPublish(project);

    const healthy = await Deployment.countDocuments({
      projectId: project._id,
      status: DeploymentStatus.HEALTHY,
    });

    assert.equal(healthy, 1);
  });
});

/**
 * Automatic publishing invites bursts — a branch pushed twice in a minute, or a
 * merge right after a commit. Only one release may be in flight per website, or
 * two builds race to claim the same address.
 */
describe('a second push while one is still publishing', () => {
  before(async () => {
    await startTestDb();
  });
  after(async () => {
    await stopTestDb();
  });
  beforeEach(async () => {
    await clearTestDb();
  });

  async function projectMidPublish() {
    const ownerId = objectId();
    const project = await Project.create({
      name: 'HelloUniversity',
      slug: 'hellouniversity',
      ownerId,
      status: ProjectStatus.ACTIVE,
      platformSubdomain: 'hellouniversity',
      productionBranch: 'main',
      deploymentMode: 'AUTOMATIC',
      // Fully deploy-ready, so the refusal comes from the overlap guard rather
      // than from an earlier eligibility check.
      runtimeType: 'NEXTJS',
      buildConfiguration: {
        buildCommand: 'npm run build',
        startCommand: 'npm start',
        healthCheckPath: '/',
      },
      detection: {
        status: 'READY',
        issues: [],
        checkedCommitSha: 'a'.repeat(40),
        checkedAt: new Date(),
      },
    });

    const repository = await Repository.create({
      projectId: project._id,
      sourceType: RepositorySourceType.GITHUB_APP,
      provider: RepositoryProvider.GITHUB,
      installationId: 1234,
      githubRepoId: 5678,
      nodeId: 'R_node',
      fullName: 'henson/hellouniversity',
      name: 'hellouniversity',
      ownerLogin: 'henson',
      defaultBranch: 'main',
      visibility: 'private',
      accessStatus: 'ACTIVE',
      lastCommitSha: 'a'.repeat(40),
    });
    await Project.updateOne({ _id: project._id }, { $set: { repositoryId: repository._id } });

    await Deployment.create({
      projectId: project._id,
      sequenceNumber: 1,
      triggerType: DeploymentTrigger.AUTOMATIC,
      requestedBy: ownerId,
      commitSha: 'a'.repeat(40),
      configurationVersion: 1,
      status: DeploymentStatus.BUILDING,
    });

    return { project, ownerId };
  }

  it('is refused rather than started alongside the first', async () => {
    const { project, ownerId } = await projectMidPublish();

    const result = await createDeployment({
      projectId: project._id,
      requestedBy: ownerId,
      triggerType: DeploymentTrigger.AUTOMATIC,
    });

    assert.equal(result.success, false);
  });

  it('says what is happening rather than failing silently', async () => {
    const { project, ownerId } = await projectMidPublish();

    const result = await createDeployment({
      projectId: project._id,
      requestedBy: ownerId,
      triggerType: DeploymentTrigger.AUTOMATIC,
    });

    assert.match(result.error, /already in progress/i);
  });

  it('creates no second deployment record', async () => {
    const { project, ownerId } = await projectMidPublish();

    await createDeployment({
      projectId: project._id,
      requestedBy: ownerId,
      triggerType: DeploymentTrigger.AUTOMATIC,
    });

    assert.equal(await Deployment.countDocuments({ projectId: project._id }), 1);
  });
});
