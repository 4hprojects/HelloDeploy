import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ApprovalRequest, Project, Repository } from '@hellodeploy/database';
import {
  ApprovalStatus,
  DetectionStatus,
  DeploymentMode,
  ProjectStatus,
  RuntimeType,
} from '@hellodeploy/contracts';
import {
  clearApprovalTestDb,
  approvalObjectId,
  startApprovalTestDb,
  stopApprovalTestDb,
} from '../helpers/approval-db.js';
import {
  getLatestApprovalRequest,
  submitForReview,
} from '../../apps/web/src/services/project.service.js';
import {
  getApprovalRequests,
  reviewApprovalRequest,
} from '../../apps/web/src/services/admin.service.js';

const COMMIT = 'a'.repeat(40);

async function createReadyProject(overrides = {}) {
  const project = await Project.create({
    name: 'Customer Portal',
    slug: `customer-portal-${approvalObjectId()}`,
    ownerId: approvalObjectId(),
    status: ProjectStatus.DRAFT,
    runtimeType: RuntimeType.NODEJS,
    productionBranch: 'main',
    deploymentMode: DeploymentMode.MANUAL,
    buildConfiguration: {
      buildCommand: 'npm run build',
      startCommand: 'npm start',
      applicationPort: 3000,
      healthCheckPath: '/',
    },
    configurationVersion: 4,
    detection: {
      status: DetectionStatus.READY,
      issues: [],
      checkedCommitSha: COMMIT,
      checkedAt: new Date(),
    },
    ...overrides,
  });
  const repository = await Repository.create({
    projectId: project._id,
    installationId: 123,
    githubRepoId: Number(String(Date.now()).slice(-8)),
    nodeId: `R_${project._id}`,
    fullName: 'owner/customer-portal',
    name: 'customer-portal',
    ownerLogin: 'owner',
    defaultBranch: 'main',
    accessStatus: 'ACTIVE',
    lastCommitSha: COMMIT,
  });
  project.repositoryId = repository._id;
  await project.save();
  return { project, repository };
}

async function submitReadyProject(project) {
  return submitForReview({
    projectId: project._id,
    actorId: project.ownerId,
    purpose: 'Lets customers view and manage their support requests.',
  });
}

describe('initial project approval workflow', () => {
  before(startApprovalTestDb);
  after(stopApprovalTestDb);
  beforeEach(clearApprovalTestDb);

  it('requires a purpose and current successful readiness checks', async () => {
    const { project, repository } = await createReadyProject();

    const missingPurpose = await submitForReview({
      projectId: project._id,
      actorId: project.ownerId,
      purpose: 'Short',
    });
    assert.equal(missingPurpose.success, false);
    assert.equal(missingPurpose.field, 'purpose');

    repository.lastCommitSha = 'b'.repeat(40);
    await repository.save();
    const stale = await submitReadyProject(project);
    assert.equal(stale.success, false);
    assert.equal(stale.readiness.isReady, false);
    assert.ok(
      stale.readiness.findings.some(
        (finding) => finding.code === 'current_detection' && finding.status === 'BLOCKING',
      ),
    );
  });

  it('blocks failed detection, unsupported runtimes, and the legacy deployment mode', async () => {
    const { project } = await createReadyProject();
    project.runtimeType = RuntimeType.UNKNOWN;
    project.deploymentMode = DeploymentMode.APPROVAL_REQUIRED;
    project.detection = {
      status: DetectionStatus.NEEDS_ATTENTION,
      issues: [{ level: 'ERROR', message: 'The application type could not be identified.' }],
      checkedCommitSha: COMMIT,
      checkedAt: new Date(),
    };
    await project.save();

    const submitted = await submitReadyProject(project);
    assert.equal(submitted.success, false);
    for (const code of ['supported_runtime', 'successful_detection', 'deployment_mode']) {
      assert.ok(
        submitted.readiness.findings.some(
          (finding) => finding.code === code && finding.status === 'BLOCKING',
        ),
      );
    }
  });

  it('snapshots safe review details and prevents duplicate pending submissions', async () => {
    const { project } = await createReadyProject();
    const submitted = await submitReadyProject(project);
    assert.equal(submitted.success, true);

    const request = await getLatestApprovalRequest(project._id);
    assert.equal(request.purpose, 'Lets customers view and manage their support requests.');
    assert.equal(request.snapshotConfigurationVersion, project.configurationVersion);
    assert.equal(request.snapshotCommitSha, COMMIT);
    assert.ok(request.validationFindings.every((finding) => !('value' in finding)));

    const queue = await getApprovalRequests();
    assert.equal(queue.requests[0].snapshotState.isCurrent, true);
    assert.equal(queue.requests[0].projectId.repositoryId.fullName, 'owner/customer-portal');

    const duplicate = await submitReadyProject(project);
    assert.equal(duplicate.success, false);
    assert.match(duplicate.error, /already pending/i);
  });

  it('approves a current snapshot and activates the project atomically', async () => {
    const { project } = await createReadyProject();
    const submitted = await submitReadyProject(project);
    const reviewed = await reviewApprovalRequest({
      requestId: submitted.request._id,
      decision: ApprovalStatus.APPROVED,
      note: '',
      adminId: approvalObjectId(),
      adminRole: 'ADMIN',
    });

    assert.equal(reviewed.success, true);
    const [savedProject, savedRequest] = await Promise.all([
      Project.findById(project._id).lean(),
      ApprovalRequest.findById(submitted.request._id).lean(),
    ]);
    assert.equal(savedProject.status, ProjectStatus.ACTIVE);
    assert.equal(savedRequest.status, ApprovalStatus.APPROVED);
  });

  it('blocks approval after repository or configuration changes', async () => {
    const first = await createReadyProject();
    const firstSubmission = await submitReadyProject(first.project);
    first.repository.lastCommitSha = 'b'.repeat(40);
    await first.repository.save();
    const repositoryChanged = await reviewApprovalRequest({
      requestId: firstSubmission.request._id,
      decision: ApprovalStatus.APPROVED,
      adminId: approvalObjectId(),
      adminRole: 'ADMIN',
    });
    assert.equal(repositoryChanged.success, false);
    assert.match(repositoryChanged.error, /changed after submission/i);

    await clearApprovalTestDb();
    const second = await createReadyProject();
    const secondSubmission = await submitReadyProject(second.project);
    await Project.updateOne({ _id: second.project._id }, { $inc: { configurationVersion: 1 } });
    const configurationChanged = await reviewApprovalRequest({
      requestId: secondSubmission.request._id,
      decision: ApprovalStatus.APPROVED,
      adminId: approvalObjectId(),
      adminRole: 'ADMIN',
    });
    assert.equal(configurationChanged.success, false);
    assert.match(configurationChanged.error, /changed after submission/i);
  });

  it('requires a note for changes and allows the owner to resubmit', async () => {
    const { project } = await createReadyProject();
    const submitted = await submitReadyProject(project);
    const missingNote = await reviewApprovalRequest({
      requestId: submitted.request._id,
      decision: ApprovalStatus.CHANGES_REQUESTED,
      note: '',
      adminId: approvalObjectId(),
      adminRole: 'ADMIN',
    });
    assert.equal(missingNote.success, false);

    const changed = await reviewApprovalRequest({
      requestId: submitted.request._id,
      decision: ApprovalStatus.CHANGES_REQUESTED,
      note: 'Add a clear health endpoint and check the app again.',
      adminId: approvalObjectId(),
      adminRole: 'ADMIN',
    });
    assert.equal(changed.success, true);

    const resubmitted = await submitReadyProject(project);
    assert.equal(resubmitted.success, true);
    assert.notEqual(resubmitted.request._id.toString(), submitted.request._id.toString());
  });

  it('returns legacy and missing-project requests but never approves them', async () => {
    const legacy = await ApprovalRequest.create({
      projectId: approvalObjectId(),
      requestedBy: approvalObjectId(),
    });
    const approval = await reviewApprovalRequest({
      requestId: legacy._id,
      decision: ApprovalStatus.APPROVED,
      adminId: approvalObjectId(),
      adminRole: 'SUPER_ADMIN',
    });
    assert.equal(approval.success, false);

    const returned = await reviewApprovalRequest({
      requestId: legacy._id,
      decision: ApprovalStatus.CHANGES_REQUESTED,
      note: 'Reconnect the project and submit a fresh review.',
      adminId: approvalObjectId(),
      adminRole: 'SUPER_ADMIN',
    });
    assert.equal(returned.success, true);
  });

  it('allows only one simultaneous admin decision', async () => {
    const { project } = await createReadyProject();
    const submitted = await submitReadyProject(project);
    const decisions = await Promise.all([
      reviewApprovalRequest({
        requestId: submitted.request._id,
        decision: ApprovalStatus.APPROVED,
        adminId: approvalObjectId(),
        adminRole: 'ADMIN',
      }),
      reviewApprovalRequest({
        requestId: submitted.request._id,
        decision: ApprovalStatus.CHANGES_REQUESTED,
        note: 'Please check the production settings again.',
        adminId: approvalObjectId(),
        adminRole: 'ADMIN',
      }),
    ]);
    assert.equal(decisions.filter((decision) => decision.success).length, 1);

    const [savedProject, savedRequest] = await Promise.all([
      Project.findById(project._id).lean(),
      ApprovalRequest.findById(submitted.request._id).lean(),
    ]);
    if (savedRequest.status === ApprovalStatus.APPROVED) {
      assert.equal(savedProject.status, ProjectStatus.ACTIVE);
    } else {
      assert.equal(savedRequest.status, ApprovalStatus.CHANGES_REQUESTED);
      assert.equal(savedProject.status, ProjectStatus.DRAFT);
    }
  });
});
