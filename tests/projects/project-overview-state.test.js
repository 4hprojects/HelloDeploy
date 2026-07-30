import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ApprovalStatus,
  DeploymentMode,
  DeploymentStatus,
  DetectionStatus,
  ProjectRole,
  ProjectStatus,
} from '@hellodeploy/contracts';
import {
  buildApplicationUrl,
  buildProjectOverviewState,
} from '../../apps/web/src/services/project-overview.service.js';

const COMMIT = 'a'.repeat(40);
const REPOSITORY_ID = '64b7f8e2a1c9d4f5b6a7c8d9';

function fixture(overrides = {}) {
  const project = {
    _id: '64b7f8e2a1c9d4f5b6a7c8d8',
    slug: 'sample-app',
    status: ProjectStatus.DRAFT,
    repositoryId: REPOSITORY_ID,
    deploymentMode: DeploymentMode.MANUAL,
    detection: {
      status: DetectionStatus.READY,
      checkedCommitSha: COMMIT,
      checkedAt: new Date(),
    },
    ...overrides.project,
  };
  const repository =
    overrides.repository === null
      ? null
      : {
          _id: REPOSITORY_ID,
          accessStatus: 'ACTIVE',
          lastCommitSha: COMMIT,
          ...overrides.repository,
        };
  return buildProjectOverviewState({
    project,
    repository,
    deployments: overrides.deployments ?? [],
    activeDeployment: overrides.activeDeployment ?? null,
    latestApproval: overrides.latestApproval ?? null,
    approvalReadiness: overrides.approvalReadiness ?? { isReady: true, findings: [] },
    membershipRole: overrides.membershipRole ?? ProjectRole.OWNER,
    appUrl: overrides.appUrl ?? null,
  });
}

describe('project overview lifecycle state', () => {
  it('guides missing and inaccessible repositories', () => {
    const missing = fixture({ project: { repositoryId: null }, repository: null });
    assert.equal(missing.phase, 'SETUP');
    assert.equal(missing.primaryAction.label, 'Connect repository');

    const inaccessible = fixture({ repository: { accessStatus: 'REVOKED' } });
    assert.equal(inaccessible.phase, 'NEEDS_ATTENTION');
    assert.match(inaccessible.title, /Repository access/);
  });

  it('distinguishes unchecked, failed, and stale app checks', () => {
    const unchecked = fixture({
      project: { detection: { status: DetectionStatus.NOT_RUN } },
    });
    assert.equal(unchecked.phase, 'SETUP');
    assert.equal(unchecked.primaryAction.label, 'Check my app');

    const failed = fixture({
      project: {
        detection: {
          status: DetectionStatus.NEEDS_ATTENTION,
          checkedCommitSha: COMMIT,
          checkedAt: new Date(),
        },
      },
    });
    assert.equal(failed.phase, 'NEEDS_ATTENTION');

    const stale = fixture({ repository: { lastCommitSha: 'b'.repeat(40) } });
    assert.equal(stale.phase, 'NEEDS_ATTENTION');
    assert.equal(stale.milestones.find((item) => item.key === 'check').done, false);
  });

  it('blocks the unsupported legacy deployment mode', () => {
    const state = fixture({
      project: { deploymentMode: DeploymentMode.APPROVAL_REQUIRED },
    });
    assert.equal(state.phase, 'NEEDS_ATTENTION');
    assert.equal(state.primaryAction.label, 'Review settings');
  });

  it('shows ready, pending, and changes-requested review states', () => {
    const ready = fixture();
    assert.equal(ready.canSubmit, true);
    assert.equal(ready.primaryAction.label, 'Submit for review');

    const pending = fixture({
      latestApproval: { status: ApprovalStatus.PENDING },
    });
    assert.equal(pending.phase, 'PENDING_REVIEW');
    assert.equal(pending.canSubmit, false);

    const changes = fixture({
      latestApproval: { status: ApprovalStatus.CHANGES_REQUESTED },
    });
    assert.equal(changes.phase, 'NEEDS_ATTENTION');
    assert.equal(changes.primaryAction.label, 'View requested changes');

    const viewerPending = fixture({
      membershipRole: ProjectRole.VIEWER,
      latestApproval: { status: ApprovalStatus.PENDING },
    });
    assert.equal(viewerPending.phase, 'PENDING_REVIEW');
    assert.equal(viewerPending.primaryAction, null);
    assert.equal(viewerPending.milestones.find((item) => item.key === 'approval').href, null);
  });

  it('surfaces blocking readiness without successful findings', () => {
    const state = fixture({
      approvalReadiness: {
        isReady: false,
        findings: [
          { code: 'repository_access', status: 'PASS', message: 'Ready.' },
          {
            code: 'runtime_configuration',
            status: 'BLOCKING',
            message: 'Review the app settings.',
          },
          { code: 'detection_warning', status: 'WARNING', message: 'Add a lock file.' },
        ],
      },
    });
    assert.equal(state.phase, 'NEEDS_ATTENTION');
    assert.equal(state.attentionFindings.length, 2);
    assert.equal(state.primaryAction.label, 'Review settings');
  });

  it('shows approved projects as ready to deploy with role-aware actions', () => {
    const owner = fixture({ project: { status: ProjectStatus.ACTIVE } });
    assert.equal(owner.phase, 'READY_TO_DEPLOY');
    assert.equal(owner.primaryAction.method, 'POST');

    const viewer = fixture({
      project: { status: ProjectStatus.ACTIVE },
      membershipRole: ProjectRole.VIEWER,
    });
    assert.equal(viewer.primaryAction.method, 'GET');
    assert.equal(viewer.primaryAction.label, 'View deployments');
  });

  it('requires a current app check before the first deployment', () => {
    const stale = fixture({
      project: { status: ProjectStatus.ACTIVE },
      repository: { lastCommitSha: 'b'.repeat(40) },
    });
    assert.equal(stale.phase, 'NEEDS_ATTENTION');
    assert.equal(stale.primaryAction.label, 'Check again');
    assert.equal(stale.milestones.find((item) => item.key === 'check').done, false);
  });

  it('prioritizes an in-progress deployment', () => {
    const deployment = {
      _id: '64b7f8e2a1c9d4f5b6a7c801',
      sequenceNumber: 2,
      status: DeploymentStatus.BUILDING,
    };
    const state = fixture({
      project: { status: ProjectStatus.ACTIVE },
      deployments: [deployment],
    });
    assert.equal(state.phase, 'DEPLOYING');
    assert.match(state.primaryAction.href, /deployments\/64b7/);
  });

  it('guides a failed first deployment and restricts retry by role', () => {
    const failed = {
      _id: '64b7f8e2a1c9d4f5b6a7c802',
      sequenceNumber: 1,
      status: DeploymentStatus.FAILED,
      failureSummary: 'The app did not start.',
    };
    const owner = fixture({
      project: { status: ProjectStatus.ACTIVE },
      deployments: [failed],
    });
    assert.equal(owner.phase, 'NEEDS_ATTENTION');
    assert.equal(owner.primaryAction.method, 'POST');

    const viewer = fixture({
      project: { status: ProjectStatus.ACTIVE },
      deployments: [failed],
      membershipRole: ProjectRole.VIEWER,
    });
    assert.equal(viewer.primaryAction.method, 'GET');
  });

  it('shows live, update-ready, and failed-update states without hiding the live release', () => {
    const active = {
      _id: '64b7f8e2a1c9d4f5b6a7c803',
      sequenceNumber: 2,
      status: DeploymentStatus.HEALTHY,
      commitSha: COMMIT,
    };
    const live = fixture({
      project: { status: ProjectStatus.ACTIVE },
      deployments: [active],
      activeDeployment: active,
      appUrl: 'https://sample-app.apps.example.com',
    });
    assert.equal(live.phase, 'LIVE');
    assert.equal(live.primaryAction.label, 'Open app');

    const update = fixture({
      project: { status: ProjectStatus.ACTIVE },
      repository: { lastCommitSha: 'b'.repeat(40) },
      deployments: [active],
      activeDeployment: active,
      appUrl: 'https://sample-app.apps.example.com',
    });
    assert.equal(update.phase, 'LIVE');
    assert.equal(update.primaryAction.label, 'Deploy update');

    const failedUpdate = {
      _id: '64b7f8e2a1c9d4f5b6a7c804',
      sequenceNumber: 3,
      status: DeploymentStatus.FAILED,
    };
    const protectedLive = fixture({
      project: { status: ProjectStatus.ACTIVE },
      deployments: [failedUpdate, active],
      activeDeployment: active,
      appUrl: 'https://sample-app.apps.example.com',
    });
    assert.equal(protectedLive.phase, 'LIVE');
    assert.match(protectedLive.title, /previous version/);
  });

  it('keeps a healthy release live when its URL or repository access is unavailable', () => {
    const active = {
      _id: '64b7f8e2a1c9d4f5b6a7c805',
      sequenceNumber: 2,
      status: DeploymentStatus.HEALTHY,
      commitSha: COMMIT,
    };
    const missingUrl = fixture({
      project: { status: ProjectStatus.ACTIVE },
      deployments: [active],
      activeDeployment: active,
    });
    assert.equal(missingUrl.phase, 'LIVE');
    assert.equal(missingUrl.primaryAction.label, 'View deployment');

    const inaccessibleSource = fixture({
      project: { status: ProjectStatus.ACTIVE },
      repository: { accessStatus: 'REVOKED' },
      deployments: [active],
      activeDeployment: active,
      appUrl: 'https://sample-app.apps.example.com',
    });
    assert.equal(inaccessibleSource.phase, 'LIVE');
    assert.equal(inaccessibleSource.primaryAction.label, 'Check repository');
  });

  it('handles suspended and archived projects before other states', () => {
    for (const status of [ProjectStatus.SUSPENDED, ProjectStatus.ARCHIVED]) {
      const active = {
        _id: '64b7f8e2a1c9d4f5b6a7c806',
        status: DeploymentStatus.HEALTHY,
        commitSha: COMMIT,
      };
      const state = fixture({
        project: { status },
        activeDeployment: active,
        appUrl: 'https://sample-app.apps.example.com',
      });
      assert.equal(state.phase, 'SUSPENDED');
      assert.equal(state.primaryAction, null);
      assert.equal(state.appUrl, null);
      assert.equal(state.showMilestones, false);
    }
  });

  it('builds only safe canonical application URLs', () => {
    assert.equal(
      buildApplicationUrl({
        subdomain: 'sample-app',
        deploymentDomain: 'apps.example.com',
      }),
      'https://sample-app.apps.example.com',
    );
    assert.equal(
      buildApplicationUrl({
        subdomain: 'sample-app.example.com',
        deploymentDomain: 'apps.example.com',
      }),
      null,
    );
    assert.equal(
      buildApplicationUrl({
        subdomain: 'sample-app',
        deploymentDomain: 'javascript:alert(1)',
      }),
      null,
    );
  });
});
