import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ejs from 'ejs';
import { DeploymentMode, DetectionStatus, ProjectStatus } from '@hellodeploy/contracts';
import { buildSettingsSections } from '../../apps/web/src/config/project-navigation.js';
import { buildProjectSettingsView } from '../../apps/web/src/services/project-settings-view.service.js';

const { renderFile } = ejs;

const settingsPath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/settings.ejs', import.meta.url),
);
const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

const commit = 'a'.repeat(40);
const baseProject = {
  _id: '64b7f8e2a1c9d4f5b6a7c8d8',
  name: 'HelloRun Customer Portal',
  slug: 'hellorun-e783',
  status: ProjectStatus.ACTIVE,
  runtimeType: 'NODEJS',
  productionBranch: 'main',
  deploymentMode: DeploymentMode.MANUAL,
  notificationPreference: 'FAILURE_ONLY',
  buildConfiguration: {
    buildCommand: 'npm run build',
    startCommand: 'npm start',
    applicationPort: 3000,
    healthCheckPath: '/health',
  },
  buildFilters: { includedPaths: [], ignoredPaths: ['docs/**'] },
  detection: {
    status: DetectionStatus.READY,
    checkedAt: new Date(),
    checkedCommitSha: commit,
  },
  maintenanceMode: { enabled: false },
};
const baseRepository = {
  fullName: '4hprojects/a-very-long-customer-facing-hellorun-application-repository-name',
  sourceType: 'GITHUB_APP',
  lastCommitSha: commit,
};
const baseDomains = [
  {
    _id: '64b7f8e2a1c9d4f5b6a7c8d9',
    hostnameNormalized: 'portal.a-very-long-customer-domain.example.com',
    status: 'PENDING_VERIFICATION',
  },
];

function renderSettings(overrides = {}) {
  const project = { ...baseProject, ...(overrides.project ?? {}) };
  const repository = overrides.repository === undefined ? baseRepository : overrides.repository;
  const domains = overrides.domains ?? baseDomains;
  const hasDeployHook = overrides.hasDeployHook ?? true;
  return renderFile(settingsPath, {
    project,
    membership: { role: 'OWNER' },
    settingsSections: buildSettingsSections(project.slug),
    repository,
    domains,
    quota: {
      cpuCores: 1,
      memoryMb: 512,
      storageMb: 1024,
      buildTimeoutSeconds: 600,
      maxCustomDomains: 2,
    },
    hasDeployHook,
    settingsState: buildProjectSettingsView({
      project,
      repository,
      domainCount: domains.length,
      hasDeployHook,
    }),
    activeSettingsEdit: overrides.activeSettingsEdit ?? null,
    settingsErrors: overrides.settingsErrors ?? {},
    settingsValues: overrides.settingsValues ?? {},
    bcErrors: overrides.bcErrors ?? {},
    bcValues: overrides.bcValues ?? null,
    bfErrors: overrides.bfErrors ?? {},
    bfValues: overrides.bfValues ?? null,
    csrfToken: 'test-token',
  });
}

describe('simplified project settings', () => {
  it('renders the real template with friendly summaries and stable anchors', async () => {
    const html = await renderSettings();

    assert.match(html, /App setup/);
    assert.match(html, /Check again/);
    assert.match(html, /Manual deployments/);
    assert.match(html, /Failed deployments only/);
    assert.match(html, /Working-page check/);
    for (const section of buildSettingsSections(baseProject.slug)) {
      assert.match(html, new RegExp(`id="${section.key}"`));
    }
    assert.doesNotMatch(html, /bcVal/);
  });

  it('uses dedicated pages for source, domains, deploy hooks, and maintenance', async () => {
    const html = await renderSettings();

    assert.match(html, /href="\/projects\/hellorun-e783\/repository"/);
    assert.match(html, /href="\/projects\/hellorun-e783\/detection"/);
    assert.match(html, /href="\/projects\/hellorun-e783\/domains"/);
    assert.match(html, /href="\/projects\/hellorun-e783\/deploy-hook"/);
    assert.match(html, /href="\/projects\/hellorun-e783#maintenance-mode"/);
    assert.doesNotMatch(html, /action="\/projects\/hellorun-e783\/domains/);
    assert.doesNotMatch(html, /action="\/projects\/hellorun-e783\/deploy-hook/);
    assert.doesNotMatch(html, /action="\/projects\/hellorun-e783\/maintenance/);
  });

  it('opens validation disclosures and preserves every health-check form value', async () => {
    const html = await renderSettings({
      activeSettingsEdit: 'health-check',
      bcErrors: { healthCheckPath: 'Working-page path must begin with "/".' },
      bcValues: {
        buildCommand: 'npm run custom-build',
        startCommand: 'node custom-server.js',
        outputDirectory: 'custom-dist',
        applicationPort: '4321',
        healthCheckPath: 'health',
      },
    });

    assert.match(
      html,
      /<details class="settings-advanced-disclosure"\s+open>[\s\S]*Working-page check/,
    );
    assert.match(html, /name="buildCommand" value="npm run custom-build"/);
    assert.match(html, /name="startCommand" value="node custom-server\.js"/);
    assert.match(html, /name="outputDirectory" value="custom-dist"/);
    assert.match(html, /name="applicationPort" value="4321"/);
    assert.match(html, /name="healthCheckPath"[\s\S]*value="health"/);
    assert.match(html, /aria-describedby="settings-health-path-error"/);
  });

  it('opens advanced build settings after a field error', async () => {
    const html = await renderSettings({
      activeSettingsEdit: 'build-configuration',
      bcErrors: { applicationPort: 'Application port is invalid.' },
      bcValues: { applicationPort: '70000', healthCheckPath: '/health' },
    });

    assert.match(
      html,
      /<details class="settings-advanced-disclosure"\s+open>[\s\S]*Advanced build settings/,
    );
    assert.match(html, /value="70000"/);
    assert.match(html, /Application port is invalid/);
  });

  it('keeps public repositories manual and explains legacy deployment mode', async () => {
    const publicHtml = await renderSettings({
      repository: { ...baseRepository, sourceType: 'PUBLIC_GIT' },
    });
    assert.doesNotMatch(publicHtml, /<option value="AUTOMATIC"/);

    const legacyHtml = await renderSettings({
      project: { deploymentMode: DeploymentMode.APPROVAL_REQUIRED },
    });
    assert.match(legacyHtml, /Approval required \(legacy\)/);
    assert.match(legacyHtml, /Approval Required is no longer supported/);
  });

  it('renders archived projects read-only with deletion as the only mutation', async () => {
    const html = await renderSettings({
      project: { status: ProjectStatus.ARCHIVED },
    });

    assert.match(html, /This project is archived/);
    assert.doesNotMatch(html, /data-settings-edit aria-label/);
    assert.doesNotMatch(html, /Manage source/);
    assert.equal((html.match(/method="POST"/g) ?? []).length, 1);
    assert.match(html, /action="\/projects\/hellorun-e783\/delete"/);
    assert.match(html, /name="returnTo"[\s\S]*settings#danger-zone/);
  });

  it('wraps long values and uses responsive unframed sections and disclosures', () => {
    assert.match(componentsCss, /\.settings-section__body/);
    assert.match(componentsCss, /\.settings-long-value[\s\S]*overflow-wrap: anywhere/);
    assert.match(componentsCss, /\.settings-summary-list li > span:first-child/);
    assert.match(componentsCss, /\.settings-advanced-disclosure > summary:focus-visible/);
    assert.match(componentsCss, /@media \(max-width: 48rem\)[\s\S]*\.settings-section__header/);
    assert.match(componentsCss, /@media \(max-width: 30rem\)[\s\S]*\.settings-display-row/);
  });
});
