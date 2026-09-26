import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { DeploymentMode, DeploymentStatus, DomainStatus } from '@hellodeploy/contracts';

import {
  buildOverviewCards,
  relativeTime,
} from '../../apps/web/src/services/project-overview-cards.service.js';
import { buildUsageRows } from '../../apps/web/src/services/usage-view.service.js';

const { renderFile } = ejs;
const view = (name) =>
  fileURLToPath(new URL(`../../apps/web/src/views/pages/projects/${name}`, import.meta.url));

const project = {
  slug: 'hellouniversity',
  name: 'HelloUniversity',
  status: 'ACTIVE',
  productionBranch: 'main',
  deploymentMode: DeploymentMode.AUTOMATIC,
  runtimeType: 'NEXTJS',
  maintenanceMode: { enabled: false },
  activeDeploymentId: 'd9',
  buildConfiguration: {},
};
const repository = { fullName: 'henson/hellouniversity', defaultBranch: 'main' };
const activeDeployment = {
  _id: 'd9',
  status: DeploymentStatus.HEALTHY,
  completedAt: new Date(Date.now() - 2 * 60 * 1000),
  sequenceNumber: 9,
};
const domains = [
  {
    status: DomainStatus.ACTIVE,
    hostnameNormalized: 'hellouniversity.online',
    routingState: 'LIVE',
  },
];

function renderOverview({ uiMode = 'SIMPLE', online = true } = {}) {
  const active = online ? activeDeployment : null;
  return renderFile(view('show.ejs'), {
    project,
    membership: { role: 'OWNER' },
    repository,
    deployments: [activeDeployment],
    activeDeployment: active,
    domains,
    overviewCards: buildOverviewCards({
      project,
      repository,
      activeDeployment: active,
      latestDeployment: activeDeployment,
      domains,
    }),
    overviewState: {
      tone: 'live',
      phase: 'LIVE',
      eyebrow: 'Live',
      title: 'Your app is live',
      description: 'Everything is running.',
      appUrl: 'https://hellouniversity.hellodeploy.online',
      appLive: online,
      primaryAction: null,
      milestones: [],
      attentionFindings: [],
      canSubmit: false,
    },
    latestApproval: null,
    approvalReadiness: { findings: [] },
    approvalErrors: {},
    approvalValues: { purpose: '' },
    lastPublishedRelative: relativeTime(activeDeployment.completedAt),
    uiMode,
    csrfToken: 'placeholder',
  });
}

describe('website-first overview', () => {
  it('leads with the website name', async () => {
    assert.match(await renderOverview(), /website-header__name">HelloUniversity/);
  });

  it('says the website is live', async () => {
    assert.match(await renderOverview(), /website-header__dot--online/);
  });

  it('shows the owner’s own domain before the platform address', async () => {
    const html = await renderOverview();
    assert.ok(
      html.indexOf('hellouniversity.online<') < html.indexOf('hellouniversity.hellodeploy.online'),
    );
  });

  it('says when it was last published and from where', async () => {
    assert.match(await renderOverview(), /Last published 2 minutes ago from main/);
  });

  it('offers to open the website', async () => {
    assert.match(await renderOverview(), /Open website/);
  });

  it('offers to publish again in plain language', async () => {
    assert.match(await renderOverview(), /Publish again/);
  });

  it('offers no publish action while nothing is live', async () => {
    assert.doesNotMatch(await renderOverview({ online: false }), /Publish again/);
  });

  it('answers the owner’s questions as cards', async () => {
    const html = await renderOverview();
    assert.equal((html.match(/class="overview-card /g) ?? []).length, 6);
  });

  it('names each card condition for screen readers', async () => {
    assert.match(await renderOverview(), /<span class="sr-only">\s*\n?\s*Good:/);
  });
});

describe('overview hides infrastructure in simple mode', () => {
  it('keeps the raw project details out of the way', async () => {
    assert.doesNotMatch(await renderOverview(), /Project details/);
  });

  it('shows them in advanced mode instead of removing them', async () => {
    assert.match(await renderOverview({ uiMode: 'ADVANCED' }), /Project details/);
  });

  it('shows the raw details while the website is still being set up', async () => {
    // Before anything is live the cards say little, so the details stay useful.
    assert.match(await renderOverview({ online: false }), /Project details/);
  });

  it('calls environment variables settings', async () => {
    assert.match(await renderOverview({ uiMode: 'ADVANCED' }), /Environment settings/);
  });
});

describe('publish history', () => {
  const older = {
    _id: 'd8',
    sequenceNumber: 8,
    status: DeploymentStatus.HEALTHY,
    commitSha: 'b'.repeat(40),
    commitMessage: 'Update home page',
    triggerType: 'MANUAL',
    startedAt: new Date(),
    completedAt: new Date(),
  };

  const renderHistory = ({ uiMode = 'SIMPLE', rollbackTargets = [older] } = {}) =>
    renderFile(view('deployments.ejs'), {
      project,
      membership: { role: 'OWNER' },
      deployments: [
        {
          ...activeDeployment,
          commitSha: 'a'.repeat(40),
          triggerType: 'MANUAL',
          startedAt: new Date(),
        },
        older,
      ],
      rollbackTargets,
      page: 1,
      totalPages: 1,
      total: 2,
      uiMode,
      csrfToken: 'placeholder',
    });

  it('marks which version visitors are seeing', async () => {
    assert.match(await renderHistory(), /Live now/);
  });

  it('offers to restore an earlier version from its own row', async () => {
    assert.match(await renderHistory(), /Restore this version/);
  });

  it('does not offer to restore the version already live', async () => {
    const html = await renderHistory();
    // One restore form, for the earlier version only.
    assert.equal((html.match(/name="targetDeploymentId"/g) ?? []).length, 1);
  });

  it('targets the earlier version when restoring', async () => {
    const html = await renderHistory();
    assert.match(html, /name="targetDeploymentId" value="d8"/);
  });

  it('offers nothing to restore when no earlier version is retained', async () => {
    assert.doesNotMatch(await renderHistory({ rollbackTargets: [] }), /Restore this version/);
  });

  it('avoids release-artifact vocabulary', async () => {
    assert.doesNotMatch(await renderHistory(), /promote|artifact/i);
  });

  it('keeps cache and commit controls for advanced users only', async () => {
    assert.doesNotMatch(await renderHistory(), /Deploy a Specific Commit/);
  });

  it('still offers them in advanced mode', async () => {
    assert.match(await renderHistory({ uiMode: 'ADVANCED' }), /Deploy a Specific Commit/);
  });
});

describe('usage page', () => {
  const renderUsage = ({
    counts = { websites: 1, domains: 0, members: 1 },
    allocation = null,
  } = {}) => {
    const usage = buildUsageRows({
      quota: { maxOwnedProjects: 3, maxCustomDomains: 1, maxProjectMembers: 3 },
      counts,
    });

    return renderFile(view('usage.ejs'), {
      project,
      membership: { role: 'OWNER' },
      rows: usage.rows,
      isAnyAtLimit: usage.isAnyAtLimit,
      allocation,
      csrfToken: 'placeholder',
    });
  };

  it('shows how many websites are used of the allowance', async () => {
    assert.match(await renderUsage(), /1 of 3/);
  });

  it('describes each meter for assistive technology', async () => {
    assert.match(await renderUsage(), /aria-label="Websites: 1 of 3"/);
  });

  it('says in words when a limit is reached, not only on the meter', async () => {
    const html = await renderUsage({ counts: { websites: 3, domains: 0, members: 1 } });
    assert.match(html, /At your limit/);
  });

  it('tells the owner what to do about a reached limit', async () => {
    const html = await renderUsage({ counts: { websites: 3, domains: 0, members: 1 } });
    assert.match(html, /ask an administrator to raise it/);
  });

  it('hides resource allocation from simple mode', async () => {
    assert.doesNotMatch(await renderUsage(), /Resources for this website/);
  });

  it('shows resource allocation in advanced mode', async () => {
    const html = await renderUsage({ allocation: [{ label: 'Memory', value: '256 MB' }] });
    assert.match(html, /Resources for this website/);
  });
});
