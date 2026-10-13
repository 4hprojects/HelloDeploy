import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ApprovalRequest, AuditEvent, Project, Repository, User } from '@hellodeploy/database';
import {
  AccountTier,
  ApprovalStatus,
  DeploymentMode,
  DetectionStatus,
  ProjectStatus,
  RuntimeType,
} from '@hellodeploy/contracts';
import { configureAuditService } from '@hellodeploy/observability';

import {
  approvalObjectId,
  clearApprovalTestDb,
  startApprovalTestDb,
  stopApprovalTestDb,
} from '../helpers/approval-db.js';
import { submitForReview } from '../../apps/web/src/services/project.service.js';
import { updateUserApprovalTrust } from '../../apps/web/src/services/admin.service.js';

const COMMIT = 'c'.repeat(40);
const PURPOSE = 'Shows the opening hours and menu for a neighbourhood cafe.';

async function createOwner(overrides = {}) {
  return User.create({
    firstName: 'Ada',
    lastName: 'Owner',
    email: `owner-${approvalObjectId()}@example.com`,
    passwordHash: 'hash',
    status: 'ACTIVE',
    ...overrides,
  });
}

async function createReadyProject({
  ownerId,
  runtimeType = RuntimeType.NODEJS,
  status = ProjectStatus.DRAFT,
}) {
  const isServer = runtimeType === RuntimeType.NODEJS;
  const project = await Project.create({
    name: 'Cafe Site',
    slug: `cafe-${approvalObjectId()}`,
    ownerId,
    status,
    runtimeType,
    productionBranch: 'main',
    deploymentMode: DeploymentMode.MANUAL,
    buildConfiguration: isServer
      ? { startCommand: 'npm start', applicationPort: 3000, healthCheckPath: '/' }
      : { outputDirectory: 'public', healthCheckPath: '/' },
    configurationVersion: 2,
    detection: {
      status: DetectionStatus.READY,
      issues: [],
      checkedCommitSha: COMMIT,
      checkedAt: new Date(),
    },
  });
  const repository = await Repository.create({
    projectId: project._id,
    installationId: 123,
    githubRepoId: Math.floor(Math.random() * 1e9),
    nodeId: `R_${project._id}`,
    fullName: `owner/${project.slug}`,
    name: project.slug,
    ownerLogin: 'owner',
    defaultBranch: 'main',
    accessStatus: 'ACTIVE',
    lastCommitSha: COMMIT,
  });
  project.repositoryId = repository._id;
  await project.save();
  return project;
}

function submit(project, deps = { isAutoApprovalEnabled: true }) {
  return submitForReview(
    { projectId: project._id, actorId: project.ownerId, purpose: PURPOSE },
    deps,
  );
}

async function projectStatus(project) {
  return (await Project.findById(project._id).lean()).status;
}

describe('automatic project approval on submit', () => {
  before(async () => {
    await startApprovalTestDb();
    configureAuditService(AuditEvent);
  });
  after(async () => {
    configureAuditService(null);
    await stopApprovalTestDb();
  });
  beforeEach(clearApprovalTestDb);

  it('activates a static site from a first-time free owner', async () => {
    const owner = await createOwner();
    const project = await createReadyProject({
      ownerId: owner._id,
      runtimeType: RuntimeType.STATIC,
    });

    await submit(project);

    assert.equal(await projectStatus(project), ProjectStatus.ACTIVE);
  });

  it('records the automatic approval on the request without a reviewer', async () => {
    const owner = await createOwner();
    const project = await createReadyProject({
      ownerId: owner._id,
      runtimeType: RuntimeType.STATIC,
    });

    await submit(project);

    const request = await ApprovalRequest.findOne({ projectId: project._id }).lean();
    assert.deepEqual(
      {
        status: request.status,
        isAutoApproved: request.isAutoApproved,
        reviewedBy: request.reviewedBy,
        reasons: request.autoApprovalReasons,
      },
      {
        status: ApprovalStatus.APPROVED,
        isAutoApproved: true,
        reviewedBy: null,
        reasons: ['low_risk_runtime'],
      },
    );
  });

  it('writes an auto-approval audit event with the reasons', async () => {
    const owner = await createOwner({ accountTier: AccountTier.PREMIUM });
    const project = await createReadyProject({ ownerId: owner._id });

    await submit(project);

    const event = await AuditEvent.findOne({ action: 'project.auto_approved' }).lean();
    assert.deepEqual(event.metadata.reasons, ['premium_account']);
  });

  it('activates a server app from a premium owner', async () => {
    const owner = await createOwner({ accountTier: AccountTier.PREMIUM });
    const project = await createReadyProject({ ownerId: owner._id });

    const result = await submit(project);

    assert.equal(result.isAutoApproved, true);
  });

  it('activates a server app from an owner with an earlier approved project', async () => {
    const owner = await createOwner();
    const earlier = await createReadyProject({ ownerId: owner._id, status: ProjectStatus.ACTIVE });
    await ApprovalRequest.create({
      projectId: earlier._id,
      requestedBy: owner._id,
      status: ApprovalStatus.APPROVED,
    });
    const project = await createReadyProject({ ownerId: owner._id });

    await submit(project);

    assert.equal(await projectStatus(project), ProjectStatus.ACTIVE);
  });

  it('queues a server app from a first-time free owner', async () => {
    const owner = await createOwner();
    const project = await createReadyProject({ ownerId: owner._id });

    await submit(project);

    const request = await ApprovalRequest.findOne({ projectId: project._id }).lean();
    assert.equal(request.status, ApprovalStatus.PENDING);
  });

  it('queues every submission when automatic approval is off', async () => {
    const owner = await createOwner({ accountTier: AccountTier.PREMIUM });
    const project = await createReadyProject({
      ownerId: owner._id,
      runtimeType: RuntimeType.STATIC,
    });

    await submit(project, { isAutoApprovalEnabled: false });

    assert.equal(await projectStatus(project), ProjectStatus.DRAFT);
  });
});

describe('admin auto-approval trust settings', () => {
  before(startApprovalTestDb);
  after(stopApprovalTestDb);
  beforeEach(clearApprovalTestDb);

  it('saves the premium tier and trusted flag', async () => {
    const admin = await createOwner({ platformRole: 'ADMIN' });
    const target = await createOwner();

    await updateUserApprovalTrust({
      userId: target._id.toString(),
      accountTier: AccountTier.PREMIUM,
      isTrusted: true,
      adminId: admin._id.toString(),
      adminRole: 'ADMIN',
    });

    const saved = await User.findById(target._id).lean();
    assert.deepEqual(
      { accountTier: saved.accountTier, isTrusted: saved.isTrustedForAutoApproval },
      { accountTier: AccountTier.PREMIUM, isTrusted: true },
    );
  });

  it('rejects an unknown account tier', async () => {
    const admin = await createOwner({ platformRole: 'ADMIN' });
    const target = await createOwner();

    const result = await updateUserApprovalTrust({
      userId: target._id.toString(),
      accountTier: 'GOLD',
      isTrusted: false,
      adminId: admin._id.toString(),
      adminRole: 'ADMIN',
    });

    assert.equal(result.error, 'Invalid account tier.');
  });
});
