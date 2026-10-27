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
  toAppUptime,
  toSetupGuide,
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

  it('tells non-owners the app check is waiting on the project owner', () => {
    const state = fixture({
      membershipRole: ProjectRole.VIEWER,
      project: { detection: { status: DetectionStatus.NOT_RUN } },
    });
    assert.equal(state.title, 'Waiting for the project owner');
  });

  it('gives non-owners no app check action they cannot complete', () => {
    const state = fixture({
      membershipRole: ProjectRole.VIEWER,
      project: { detection: { status: DetectionStatus.NOT_RUN } },
    });
    assert.equal(state.primaryAction, null);
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

  it('keeps a live release visible while an update deploys', () => {
    const active = {
      _id: '64b7f8e2a1c9d4f5b6a7c804',
      sequenceNumber: 1,
      status: DeploymentStatus.HEALTHY,
      commitSha: COMMIT,
    };
    const building = {
      _id: '64b7f8e2a1c9d4f5b6a7c805',
      sequenceNumber: 2,
      status: DeploymentStatus.BUILDING,
    };
    const state = fixture({
      project: { status: ProjectStatus.ACTIVE },
      deployments: [building, active],
      activeDeployment: active,
    });
    assert.deepEqual(
      { phase: state.phase, tone: state.tone, title: state.title },
      { phase: 'DEPLOYING', tone: 'live', title: 'Your app is live' },
    );
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

describe('setup guide for project sub-pages', () => {
  const base = '/projects/sample-app';
  const missingVariables = {
    isReady: false,
    findings: [
      {
        code: 'required_environment',
        status: 'BLOCKING',
        message: 'Set the missing variables: API_KEY.',
      },
    ],
  };

  it('is hidden once the app is live', () => {
    const state = fixture({
      project: { status: ProjectStatus.ACTIVE },
      activeDeployment: { _id: 'd1', status: DeploymentStatus.HEALTHY, commitSha: COMMIT },
    });
    assert.equal(toSetupGuide(state, { base, currentPath: `${base}/deployments` }), null);
  });

  it('points to environment variables after the app check passes', () => {
    const guide = toSetupGuide(fixture({ approvalReadiness: missingVariables }), {
      base,
      currentPath: `${base}/detection`,
    });
    assert.equal(guide.nextAction.href, `${base}/environment`);
  });

  it('tells the user when they are already on the next step', () => {
    const state = fixture({ project: { detection: { status: DetectionStatus.NOT_RUN } } });
    const guide = toSetupGuide(state, { base, currentPath: `${base}/detection` });
    assert.equal(guide.isOnNextStep, true);
  });

  it('links overview anchors back to the overview page', () => {
    const guide = toSetupGuide(fixture(), { base, currentPath: `${base}/environment` });
    assert.equal(guide.nextAction.href, `${base}#submit-review`);
  });

  it('highlights the step the next action belongs to', () => {
    const guide = toSetupGuide(fixture(), { base, currentPath: `${base}/environment` });
    assert.equal(guide.milestones[guide.nextStepIndex].key, 'approval');
  });

  it('falls back to the first unfinished step when the action has no step', () => {
    const state = fixture({ project: { deploymentMode: DeploymentMode.APPROVAL_REQUIRED } });
    const guide = toSetupGuide(state, { base, currentPath: `${base}/environment` });
    assert.equal(guide.milestones[guide.nextStepIndex].key, 'approval');
  });

  it('matches the step that belongs to the current page', () => {
    const guide = toSetupGuide(fixture(), { base, currentPath: `${base}/environment` });
    assert.equal(guide.milestones[guide.pageStepIndex].key, 'environment');
  });

  it('names the step after this one when the user is on the next step', () => {
    const state = fixture({ project: { detection: { status: DetectionStatus.NOT_RUN } } });
    const guide = toSetupGuide(state, { base, currentPath: `${base}/detection` });
    assert.deepEqual(guide.afterStep, {
      label: 'Project approved',
      href: `${base}#submit-review`,
    });
  });

  it('counts completed setup steps', () => {
    const guide = toSetupGuide(fixture(), { base, currentPath: `${base}/environment` });
    assert.equal(guide.doneCount, 4);
  });
});

describe('live app uptime', () => {
  const NOW = new Date('2026-10-15T12:00:00Z');
  const STARTED_AT = new Date('2026-10-12T07:48:00Z');
  const liveDeployment = (runtime) => ({
    _id: '64b7f8e2a1c9d4f5b6a7c8e1',
    status: DeploymentStatus.HEALTHY,
    commitSha: COMMIT,
    runtime,
  });
  const freshRunning = {
    containerStartedAt: STARTED_AT,
    isRunning: true,
    checkedAt: new Date('2026-10-15T11:59:00Z'),
  };

  it('shows how long a freshly checked container has been running', () => {
    const uptime = toAppUptime(liveDeployment(freshRunning), NOW);
    assert.equal(uptime.label, 'Running for 3d 4h 12m');
  });

  it('exposes the container start time for the live ticker', () => {
    const uptime = toAppUptime(liveDeployment(freshRunning), NOW);
    assert.equal(uptime.startedAt, STARTED_AT.toISOString());
  });

  it('says a just-started container has run for less than a minute', () => {
    const uptime = toAppUptime(
      liveDeployment({ ...freshRunning, containerStartedAt: new Date('2026-10-15T11:59:30Z') }),
      NOW,
    );
    assert.equal(uptime.label, 'Running for less than a minute');
  });

  it('reports a freshly checked container that is down as not running', () => {
    const uptime = toAppUptime(liveDeployment({ ...freshRunning, isRunning: false }), NOW);
    assert.equal(uptime.state, 'not-running');
  });

  it('hides uptime when the last check is too old to trust', () => {
    const uptime = toAppUptime(
      liveDeployment({ ...freshRunning, checkedAt: new Date('2026-10-15T11:50:00Z') }),
      NOW,
    );
    assert.equal(uptime, null);
  });

  it('hides uptime for a release the worker has never checked', () => {
    assert.equal(toAppUptime(liveDeployment(undefined), NOW), null);
  });

  it('includes uptime in the state of a live project', () => {
    const state = fixture({
      project: { status: ProjectStatus.ACTIVE },
      activeDeployment: liveDeployment({ ...freshRunning, checkedAt: new Date() }),
    });
    assert.equal(state.uptime.state, 'running');
  });

  it('reports the last push that did not start a deployment', () => {
    const state = fixture({
      project: {
        lastTriggerFailure: {
          at: new Date('2026-10-21T00:00:00Z'),
          commitSha: COMMIT,
          reason: 'Quota reached.',
        },
      },
    });
    assert.deepEqual(state.triggerFailure, {
      at: new Date('2026-10-21T00:00:00Z'),
      commitSha: COMMIT,
      reason: 'Quota reached.',
    });
  });
});
