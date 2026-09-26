import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import {
  DeploymentStage,
  DeploymentStageStatus,
  DeploymentStatus,
  DEPLOYMENT_STAGE_ORDER,
  getFailureCopy,
} from '@hellodeploy/contracts';

import {
  buildDeploymentProgress,
  buildRecoveryActions,
  failedStageLabel,
} from '../../apps/web/src/services/deployment-progress.service.js';

const { renderFile } = ejs;
const detailView = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
);
const badgePartial = fileURLToPath(
  new URL('../../apps/web/src/views/partials/status-badge.ejs', import.meta.url),
);
const overviewView = await readFile(
  new URL('../../apps/web/src/views/pages/projects/show.ejs', import.meta.url),
  'utf8',
);
const clientScript = await readFile(
  new URL('../../apps/web/public/js/app.js', import.meta.url),
  'utf8',
);

const at = new Date('2026-09-26T10:00:00Z');

function deploymentFixture(overrides = {}) {
  return {
    _id: '64b7f8e2a1c9d4f5b6a7c801',
    sequenceNumber: 3,
    status: DeploymentStatus.BUILDING,
    commitSha: 'a'.repeat(40),
    triggerType: 'MANUAL',
    startedAt: at,
    completedAt: null,
    stages: [
      {
        stage: DeploymentStage.PREPARING,
        status: DeploymentStageStatus.COMPLETE,
        startedAt: at,
        completedAt: at,
      },
      {
        stage: DeploymentStage.BUILDING,
        status: DeploymentStageStatus.ACTIVE,
        startedAt: at,
        completedAt: null,
      },
    ],
    ...overrides,
  };
}

function renderDetail(deployment, { uiMode = 'SIMPLE', role = 'OWNER' } = {}) {
  const progress = buildDeploymentProgress(deployment);
  const canRetry = [DeploymentStatus.FAILED, DeploymentStatus.CANCELLED].includes(
    deployment.status,
  );

  return renderFile(detailView, {
    project: { slug: 'hellouniversity' },
    membership: { role },
    events: [],
    deployment,
    failureCopy: deployment.failureCode ? getFailureCopy(deployment.failureCode) : null,
    progress,
    failedStage: failedStageLabel(progress),
    recoveryActions: deployment.failureCode
      ? buildRecoveryActions({ slug: 'hellouniversity' }, deployment, { canRetry })
      : [],
    uiMode,
    csrfToken: 'placeholder',
  });
}

const failed = deploymentFixture({
  status: DeploymentStatus.FAILED,
  failureCode: 'BUILD_FAILED',
  failureSummary: 'npm ERR! code ELIFECYCLE exit 1',
  completedAt: at,
  stages: [
    {
      stage: DeploymentStage.PREPARING,
      status: DeploymentStageStatus.COMPLETE,
      startedAt: at,
      completedAt: at,
    },
    {
      stage: DeploymentStage.BUILDING,
      status: DeploymentStageStatus.FAILED,
      startedAt: at,
      completedAt: at,
    },
  ],
});

const healthy = deploymentFixture({
  status: DeploymentStatus.HEALTHY,
  completedAt: at,
  stages: DEPLOYMENT_STAGE_ORDER.map((stage) => ({
    stage,
    status: DeploymentStageStatus.COMPLETE,
    startedAt: at,
    completedAt: at,
  })),
});

describe('deployment progress while publishing', () => {
  it('leads with what is happening, not with logs', async () => {
    assert.match(await renderDetail(deploymentFixture()), /Publishing your website/);
  });

  it('renders one row per stage from the stored record', async () => {
    const html = await renderDetail(deploymentFixture());
    assert.equal((html.match(/data-progress-stage=/g) ?? []).length, DEPLOYMENT_STAGE_ORDER.length);
  });

  it('states each stage state in words', async () => {
    assert.match(await renderDetail(deploymentFixture()), /Working on it/);
  });

  it('keeps logs open while a deployment is still running', async () => {
    assert.match(await renderDetail(deploymentFixture()), /log-disclosure[^>]*open/);
  });

  it('collapses logs once the deployment has finished', async () => {
    assert.doesNotMatch(await renderDetail(healthy), /log-disclosure[^>]*open/);
  });

  it('labels the logs as technical rather than as the main content', async () => {
    assert.match(await renderDetail(healthy), /View technical logs/);
  });
});

describe('deployment failure in simple mode', () => {
  it('leads with the plain-language cause', async () => {
    assert.match(await renderDetail(failed), /Your app failed to build/);
  });

  it('does not show a raw error as the primary message', async () => {
    const html = await renderDetail(failed);
    const beforeDisclosure = html.slice(0, html.indexOf('guided-disclosure'));
    assert.doesNotMatch(beforeDisclosure, /ELIFECYCLE/);
  });

  it('offers a way to try again', async () => {
    assert.match(await renderDetail(failed), /Try again/);
  });

  it('offers a way to review settings', async () => {
    assert.match(await renderDetail(failed), /Review your settings/);
  });

  it('offers a way to reach the logs', async () => {
    assert.match(await renderDetail(failed), /View technical logs/);
  });

  it('keeps the raw error reachable behind a disclosure', async () => {
    assert.match(await renderDetail(failed), /ELIFECYCLE/);
  });

  it('offers no retry to someone who cannot deploy', async () => {
    const html = await renderDetail(failed, { role: 'VIEWER' });
    assert.doesNotMatch(html, /Try again/);
  });
});

describe('deployment failure in advanced mode', () => {
  it('shows the failure code without a disclosure', async () => {
    const html = await renderDetail(failed, { uiMode: 'ADVANCED' });
    assert.match(html, /deploy-technical/);
  });

  it('shows the raw error directly', async () => {
    const html = await renderDetail(failed, { uiMode: 'ADVANCED' });
    assert.match(html, /ELIFECYCLE/);
  });
});

describe('deployment success', () => {
  it('says the website is published', async () => {
    assert.match(await renderDetail(healthy), /Your website is published/);
  });

  it('offers a route to the live website', async () => {
    assert.match(await renderDetail(healthy), /setup\/published/);
  });
});

describe('deployment status wording', () => {
  it('speaks about the website in simple mode', async () => {
    const html = await renderFile(badgePartial, {
      status: DeploymentStatus.HEALTHY,
      uiMode: 'SIMPLE',
    });

    assert.match(html, />Live</);
  });

  it('keeps the platform term in advanced mode', async () => {
    const html = await renderFile(badgePartial, {
      status: DeploymentStatus.HEALTHY,
      uiMode: 'ADVANCED',
    });

    assert.match(html, />Healthy</);
  });

  it('defaults to simple wording when no mode is supplied', async () => {
    const html = await renderFile(badgePartial, { status: DeploymentStatus.HEALTHY });
    assert.match(html, />Live</);
  });

  it('no longer keeps a second status map on the overview', () => {
    assert.doesNotMatch(overviewView, /deploymentStatusCopy/);
  });
});

describe('live progress updates', () => {
  it('listens for stage events from the server', () => {
    assert.match(clientScript, /source\.addEventListener\('stage'/);
  });

  it('completes earlier stages when a later one starts', () => {
    assert.match(clientScript, /function advanceTo\(stage\)/);
  });

  it('keeps the hidden state wording in step with the glyph', () => {
    assert.match(clientScript, /STAGE_STATUS_WORD\[status\]/);
  });
});

describe('log rendering safety', () => {
  it('builds log lines as text nodes, never as markup', () => {
    // Log lines carry build output, which can contain anything. Kept from the
    // superseded timeline tests because it is a security property, not a
    // detail of how progress is displayed.
    assert.doesNotMatch(clientScript, /line\.innerHTML/);
  });

  it('sets the log message as text content', () => {
    assert.match(clientScript, /message\.textContent = ev\.message \|\| ''/);
  });
});
