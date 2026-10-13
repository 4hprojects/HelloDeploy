import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ApprovalRequest, Project, Quota, Repository, User } from '@hellodeploy/database';
import {
  ApprovalStatus,
  DeploymentMode,
  DetectionStatus,
  ProjectStatus,
  QuotaScope,
  RuntimeType,
  buildEmailContent,
} from '@hellodeploy/contracts';

import {
  approvalObjectId,
  clearApprovalTestDb,
  startApprovalTestDb,
  stopApprovalTestDb,
} from '../helpers/approval-db.js';
import { submitForReview } from '../../apps/web/src/services/project.service.js';
import {
  approveOverdueRequests,
  notifyAdminsOfPendingReview,
} from '../../apps/web/src/services/provisional-approval.service.js';
import {
  getApprovalRequests,
  reviewProvisionalApproval,
} from '../../apps/web/src/services/admin.service.js';

const COMMIT = 'd'.repeat(40);
const THIRTY_ONE_MINUTES_MS = 31 * 60 * 1000;
const NO_QUEUE = { getDeploymentQueue: () => null };

async function createUser(overrides = {}) {
  return User.create({
    firstName: 'Grace',
    lastName: 'User',
    email: `user-${approvalObjectId()}@example.com`,
    passwordHash: 'hash',
    status: 'ACTIVE',
    ...overrides,
  });
}

async function createQueuedProject() {
  const owner = await createUser();
  const project = await Project.create({
    name: 'Ticket Desk',
    slug: `ticket-desk-${approvalObjectId()}`,
    ownerId: owner._id,
    status: ProjectStatus.DRAFT,
    runtimeType: RuntimeType.NODEJS,
    productionBranch: 'main',
    deploymentMode: DeploymentMode.MANUAL,
    buildConfiguration: { startCommand: 'npm start', applicationPort: 3000, healthCheckPath: '/' },
    configurationVersion: 3,
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

  await submitForReview(
    {
      projectId: project._id,
      actorId: owner._id,
      purpose: 'Tracks support tickets for a small help desk.',
    },
    { isAutoApprovalEnabled: true },
  );
  const request = await ApprovalRequest.findOne({ projectId: project._id });
  return { project, repository, request };
}

function overdueNow() {
  return new Date(Date.now() + THIRTY_ONE_MINUTES_MS);
}

async function projectStatus(project) {
  return (await Project.findById(project._id).lean()).status;
}

async function provisionallyApprove() {
  const queued = await createQueuedProject();
  await approveOverdueRequests({ now: overdueNow() });
  const request = await ApprovalRequest.findById(queued.request._id).lean();
  return { ...queued, request };
}

// Create admins only after submitting: an admin in the db makes submission queue real email.
async function settle(request, admin, decision, note = '') {
  return reviewProvisionalApproval(
    {
      requestId: request._id.toString(),
      decision,
      note,
      adminId: admin._id.toString(),
      adminRole: 'ADMIN',
    },
    NO_QUEUE,
  );
}

describe('provisional approval sweep', () => {
  before(startApprovalTestDb);
  after(stopApprovalTestDb);
  beforeEach(clearApprovalTestDb);

  it('leaves a request younger than 30 minutes pending', async () => {
    const { project } = await createQueuedProject();

    await approveOverdueRequests({ now: new Date() });

    assert.equal(await projectStatus(project), ProjectStatus.DRAFT);
  });

  it('activates a project nobody reviewed for 30 minutes', async () => {
    const { project } = await provisionallyApprove();

    assert.equal(await projectStatus(project), ProjectStatus.ACTIVE);
  });

  it('marks the request provisional with a review-timeout reason', async () => {
    const { request } = await provisionallyApprove();

    assert.deepEqual(
      {
        status: request.status,
        isProvisional: request.isProvisional,
        reasons: request.autoApprovalReasons,
      },
      { status: ApprovalStatus.APPROVED, isProvisional: true, reasons: ['review_timeout'] },
    );
  });

  it('applies reduced limits through a project quota override', async () => {
    const { project } = await provisionallyApprove();

    const quota = await Quota.findOne({
      scopeType: QuotaScope.PROJECT,
      scopeId: project._id,
    }).lean();
    assert.deepEqual(
      {
        memoryMb: quota.memoryMb,
        cpuCores: quota.cpuCores,
        maxCustomDomains: quota.maxCustomDomains,
      },
      { memoryMb: 256, cpuCores: 0.25, maxCustomDomains: 0 },
    );
  });

  it('keeps waiting when the repository changed after submission', async () => {
    const { project, repository } = await createQueuedProject();
    repository.lastCommitSha = 'e'.repeat(40);
    await repository.save();

    await approveOverdueRequests({ now: overdueNow() });

    assert.equal(await projectStatus(project), ProjectStatus.DRAFT);
  });

  it('keeps an existing admin quota override', async () => {
    const { project } = await createQueuedProject();
    await Quota.create({ scopeType: QuotaScope.PROJECT, scopeId: project._id, memoryMb: 1024 });

    await approveOverdueRequests({ now: overdueNow() });

    const quotas = await Quota.find({ scopeType: QuotaScope.PROJECT, scopeId: project._id }).lean();
    assert.deepEqual(
      quotas.map((quota) => quota.memoryMb),
      [1024],
    );
  });

  it('lists provisional approvals in the admin queue', async () => {
    const { request } = await provisionallyApprove();

    const queue = await getApprovalRequests();
    assert.deepEqual(
      queue.requests.map((item) => item._id.toString()),
      [request._id.toString()],
    );
  });
});

describe('admin decision on a provisional approval', () => {
  before(startApprovalTestDb);
  after(stopApprovalTestDb);
  beforeEach(clearApprovalTestDb);

  it('removes the provisional limits on confirm', async () => {
    const { project, request } = await provisionallyApprove();
    const admin = await createUser({ platformRole: 'ADMIN' });

    await settle(request, admin, 'CONFIRM');

    assert.equal(await Quota.exists({ scopeType: QuotaScope.PROJECT, scopeId: project._id }), null);
  });

  it('closes the provisional state on confirm', async () => {
    const { request } = await provisionallyApprove();
    const admin = await createUser({ platformRole: 'ADMIN' });

    await settle(request, admin, 'CONFIRM');

    const saved = await ApprovalRequest.findById(request._id).lean();
    assert.deepEqual(
      { status: saved.status, isProvisional: saved.isProvisional },
      { status: ApprovalStatus.APPROVED, isProvisional: false },
    );
  });

  it('suspends the project when the admin rejects it', async () => {
    const { project, request } = await provisionallyApprove();
    const admin = await createUser({ platformRole: 'ADMIN' });

    await settle(request, admin, 'SUSPEND', 'Looks like a credential phishing page.');

    assert.equal(await projectStatus(project), ProjectStatus.SUSPENDED);
  });

  it('requires a note to suspend', async () => {
    const { request } = await provisionallyApprove();
    const admin = await createUser({ platformRole: 'ADMIN' });

    const result = await settle(request, admin, 'SUSPEND');

    assert.equal(result.error, 'Explain why the project is being suspended.');
  });
});

describe('admin review notification', () => {
  before(startApprovalTestDb);
  after(stopApprovalTestDb);
  beforeEach(clearApprovalTestDb);

  it('emails every active admin and no regular users', async () => {
    const admin = await createUser({ platformRole: 'ADMIN' });
    const superAdmin = await createUser({ platformRole: 'SUPER_ADMIN' });
    await createUser({ platformRole: 'ADMIN', status: 'SUSPENDED' });
    await createUser();
    const recipients = [];

    await notifyAdminsOfPendingReview(
      { project: { _id: approvalObjectId(), name: 'Ticket Desk' } },
      { queueEmailNotification: async ({ userId }) => recipients.push(userId.toString()) },
    );

    assert.deepEqual(recipients.sort(), [admin._id.toString(), superAdmin._id.toString()].sort());
  });

  it('escapes the project name in the email body', () => {
    const content = buildEmailContent('approval-requested', {
      firstName: 'Grace',
      projectName: '<script>x</script>',
      reviewUrl: 'https://example.com/admin/approval-requests',
      provisionalAfterMinutes: 30,
    });

    assert.equal(content.html.includes('<script>'), false);
  });
});

describe('approval queue views', () => {
  before(startApprovalTestDb);
  after(stopApprovalTestDb);
  beforeEach(clearApprovalTestDb);

  it('lists only provisional approvals in the provisional view', async () => {
    const { request } = await provisionallyApprove();
    await createQueuedProject();

    const queue = await getApprovalRequests({ view: 'provisional' });
    assert.deepEqual(
      queue.requests.map((item) => item._id.toString()),
      [request._id.toString()],
    );
  });

  it('counts each view', async () => {
    await provisionallyApprove();
    await createQueuedProject();

    const { counts } = await getApprovalRequests();
    assert.deepEqual(counts, { open: 2, pending: 1, provisional: 1, decided: 0 });
  });

  it('leaves decisions older than 7 days out of the decided view', async () => {
    const { request } = await createQueuedProject();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await ApprovalRequest.updateOne(
      { _id: request._id },
      { $set: { status: ApprovalStatus.CHANGES_REQUESTED, reviewedAt: eightDaysAgo } },
    );

    const queue = await getApprovalRequests({ view: 'decided' });
    assert.equal(queue.total, 0);
  });

  it("does not count the reviewed project among the owner's other live projects", async () => {
    await provisionallyApprove();

    const queue = await getApprovalRequests({ view: 'provisional' });
    assert.equal(queue.requests[0].otherLiveProjects, 0);
  });
});
