import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import { renderFile } from 'ejs';
import {
  ApprovalStatus,
  DeploymentMode,
  DeploymentStatus,
  ProjectRole,
  ProjectStatus,
} from '@hellodeploy/contracts';

const overviewPath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/show.ejs', import.meta.url),
);
const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

const project = {
  _id: '64b7f8e2a1c9d4f5b6a7c8d8',
  name: 'Sample App',
  slug: 'sample-app',
  status: ProjectStatus.ACTIVE,
  runtimeType: 'NODEJS',
  productionBranch: 'main',
  deploymentMode: DeploymentMode.MANUAL,
  notificationPreference: 'FAILURE_ONLY',
  maintenanceMode: { enabled: false },
};
const repository = {
  fullName: 'a-very-long-organization-name/a-very-long-application-repository-name',
  lastCommitSha: 'a'.repeat(40),
};

function renderOverview(overrides = {}) {
  return renderFile(overviewPath, {
    project: { ...project, ...(overrides.project ?? {}) },
    membership: { role: overrides.role ?? ProjectRole.OWNER },
    repository: overrides.repository === undefined ? repository : overrides.repository,
    deployments: overrides.deployments ?? [],
    activeDeployment: overrides.activeDeployment ?? null,
    latestApproval: overrides.latestApproval ?? null,
    approvalReadiness: overrides.approvalReadiness ?? { isReady: true, findings: [] },
    overviewState: overrides.overviewState,
    approvalErrors: overrides.approvalErrors ?? {},
    approvalValues: overrides.approvalValues ?? { purpose: '' },
    csrfToken: 'test-token',
  });
}

function milestone(label, done, href = null) {
  return { label, done, href };
}

const milestones = [
  milestone('Source connected', true, '/projects/sample-app/repository'),
  milestone('App check passed', true, '/projects/sample-app/detection'),
  milestone('Project approved', true, '#approval-feedback'),
  milestone('App is live', false, '/projects/sample-app/deployments'),
];

describe('guided project overview', () => {
  it('renders one owner setup action, four milestones, and the purpose form in order', async () => {
    const html = await renderOverview({
      project: { status: ProjectStatus.DRAFT },
      overviewState: {
        phase: 'SETUP',
        tone: 'ready',
        eyebrow: 'Ready for review',
        title: 'Your app is ready to submit',
        description: 'Add a short description so an administrator can review the project.',
        primaryAction: {
          label: 'Submit for review',
          href: '#submit-review',
          method: 'GET',
          external: false,
        },
        milestones,
        attentionFindings: [],
        appLive: false,
        appUrl: null,
        canSubmit: true,
      },
    });

    assert.match(html, /data-overview-phase="SETUP"/);
    assert.equal((html.match(/<li class="project-milestone/g) ?? []).length, 4);
    assert.match(html, /What does this application do\?/);
    assert.ok(html.indexOf('Submit for review') < html.indexOf('Project details'));
    assert.doesNotMatch(html, /Quick Links/);
  });

  it('shows requested changes and preserves the administrator note and purpose', async () => {
    const html = await renderOverview({
      project: { status: ProjectStatus.DRAFT },
      latestApproval: {
        status: ApprovalStatus.CHANGES_REQUESTED,
        adminNote: 'Please explain who uses this application and remove the test domain.',
        purpose: 'Tracks support requests for the operations team.',
      },
      approvalValues: { purpose: 'Tracks support requests for the operations team.' },
      overviewState: {
        phase: 'NEEDS_ATTENTION',
        tone: 'attention',
        eyebrow: 'Changes requested',
        title: 'Review the administrator’s feedback',
        description: 'Complete the requested updates, check the app again, and resubmit it.',
        primaryAction: {
          label: 'View requested changes',
          href: '#approval-feedback',
          method: 'GET',
          external: false,
        },
        milestones,
        attentionFindings: [],
        appLive: false,
        appUrl: null,
        canSubmit: true,
      },
    });

    assert.match(html, /Please explain who uses this application/);
    assert.match(html, /Tracks support requests for the operations team/);
    assert.match(html, /Resubmit for review/);
  });

  it('shows a safe live address and recent failed-update guidance', async () => {
    const activeDeployment = {
      _id: '64b7f8e2a1c9d4f5b6a7c803',
      sequenceNumber: 4,
      status: DeploymentStatus.HEALTHY,
      startedAt: new Date('2026-07-30T01:00:00Z'),
    };
    const failedUpdate = {
      _id: '64b7f8e2a1c9d4f5b6a7c804',
      sequenceNumber: 5,
      status: DeploymentStatus.FAILED,
      failureSummary:
        'The application did not become healthy. The previous release remains available.',
      startedAt: new Date('2026-07-30T02:00:00Z'),
    };
    const html = await renderOverview({
      activeDeployment,
      deployments: [failedUpdate, activeDeployment],
      overviewState: {
        phase: 'LIVE',
        tone: 'attention',
        eyebrow: 'App live, update failed',
        title: 'Your app is live on the previous version',
        description: 'Deployment #5 failed, but the previous version is still serving visitors.',
        primaryAction: {
          label: 'View failed update',
          href: `/projects/sample-app/deployments/${failedUpdate._id}`,
          method: 'GET',
          external: false,
        },
        milestones: milestones.map((item) => ({ ...item, done: true })),
        attentionFindings: [],
        appLive: true,
        appUrl: 'https://sample-app.apps.example.com',
        canSubmit: false,
      },
    });

    assert.match(html, /href="https:\/\/sample-app\.apps\.example\.com"/);
    assert.match(html, /target="_blank" rel="noopener noreferrer"/);
    assert.match(html, /The previous release remains available/);
    assert.doesNotMatch(html, /Steps to get the app live/);
  });

  it('allows maintainers to deploy while viewers only receive navigation links', async () => {
    const state = {
      phase: 'READY_TO_DEPLOY',
      tone: 'ready',
      eyebrow: 'Approved',
      title: 'Your app is ready to deploy',
      description: 'Publish the current production branch when you are ready.',
      milestones,
      attentionFindings: [],
      appLive: false,
      appUrl: null,
      canSubmit: false,
    };
    const maintainerHtml = await renderOverview({
      role: ProjectRole.MAINTAINER,
      overviewState: {
        ...state,
        primaryAction: {
          label: 'Deploy my app',
          href: '/projects/sample-app/deployments',
          method: 'POST',
          external: false,
          pendingLabel: 'Deploying...',
        },
      },
    });
    const viewerHtml = await renderOverview({
      role: ProjectRole.VIEWER,
      overviewState: {
        ...state,
        description: 'An owner or maintainer can now publish the app.',
        primaryAction: {
          label: 'View deployments',
          href: '/projects/sample-app/deployments',
          method: 'GET',
          external: false,
        },
      },
    });

    assert.match(maintainerHtml, /method="POST" action="\/projects\/sample-app\/deployments"/);
    assert.doesNotMatch(maintainerHtml, /Project settings/);
    assert.doesNotMatch(viewerHtml, /method="POST"/);
    assert.doesNotMatch(viewerHtml, /Project settings/);
    assert.doesNotMatch(viewerHtml, /Danger zone/);
  });

  it('defines responsive wrapping for long source names, notes, URLs, and activity', () => {
    assert.match(componentsCss, /\.project-home-url__value[\s\S]*overflow-wrap: anywhere/);
    assert.match(componentsCss, /\.project-details-grid dd[\s\S]*overflow-wrap: anywhere/);
    assert.match(componentsCss, /\.project-activity__message[\s\S]*overflow-wrap: anywhere/);
    assert.match(componentsCss, /\.project-details-disclosure > summary:focus-visible/);
    assert.match(componentsCss, /\.approval-note[\s\S]*overflow-wrap: anywhere/);
    assert.match(componentsCss, /@media \(max-width: 48rem\)[\s\S]*\.project-milestones/);
    assert.match(componentsCss, /@media \(max-width: 30rem\)[\s\S]*\.project-activity/);
  });
});
