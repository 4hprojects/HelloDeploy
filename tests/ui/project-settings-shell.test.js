import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFile } from 'node:fs/promises';
import { ProjectRole } from '@hellodeploy/contracts';

import {
  buildProjectNavigation,
  buildSettingsSections,
} from '../../apps/web/src/config/project-navigation.js';
import { projectReturnTarget } from '../../apps/web/src/utils/project-return-target.js';

const settingsView = await readFile(
  new URL('../../apps/web/src/views/pages/projects/settings.ejs', import.meta.url),
  'utf8',
);
const sidebarView = await readFile(
  new URL('../../apps/web/src/views/partials/sidebar.ejs', import.meta.url),
  'utf8',
);
const overviewView = await readFile(
  new URL('../../apps/web/src/views/pages/projects/show.ejs', import.meta.url),
  'utf8',
);
const routes = await readFile(
  new URL('../../apps/web/src/routes/pages/project.routes.js', import.meta.url),
  'utf8',
);
const projectController = await readFile(
  new URL('../../apps/web/src/controllers/project.controller.js', import.meta.url),
  'utf8',
);
const detectionController = await readFile(
  new URL('../../apps/web/src/controllers/detection.controller.js', import.meta.url),
  'utf8',
);
const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);
const clientScript = await readFile(
  new URL('../../apps/web/public/js/app.js', import.meta.url),
  'utf8',
);

describe('project settings shell', () => {
  it('builds one role-aware project navigation source', () => {
    const ownerNavigation = buildProjectNavigation(
      'example',
      ProjectRole.OWNER,
      '/projects/example/settings',
    );
    const viewerNavigation = buildProjectNavigation(
      'example',
      ProjectRole.VIEWER,
      '/projects/example',
    );

    assert.deepEqual(
      ownerNavigation.map((item) => item.key),
      [
        'overview',
        'deployments',
        'repository',
        'detection',
        'domains',
        'deploy-hook',
        'environment',
        'members',
        'settings',
      ],
    );
    assert.equal(ownerNavigation.find((item) => item.key === 'settings')?.active, true);
    assert.deepEqual(
      viewerNavigation.map((item) => item.key),
      ['overview', 'deployments', 'detection', 'domains'],
    );
    assert.equal(viewerNavigation[0]?.active, true);
  });

  it('defines the seven stable settings sections and fragments', () => {
    const sections = buildSettingsSections('example');
    assert.deepEqual(
      sections.map((section) => section.key),
      [
        'general',
        'source-build',
        'deployment',
        'custom-domains',
        'notifications',
        'health-maintenance',
        'danger-zone',
      ],
    );
    sections.forEach((section) => {
      assert.equal(section.href, `/projects/example/settings#${section.key}`);
    });
  });

  it('uses the shared registry in the sidebar and overview', () => {
    assert.match(sidebarView, /locals\.projectNavigation/);
    assert.match(overviewView, /locals\.projectNavigation/);
    assert.match(overviewView, /\/projects\/<%= project\.slug %>\/settings/);
  });

  it('keeps the settings route owner-only and renders accessible anchors', () => {
    assert.match(
      routes,
      /router\.get\('\/:slug\/settings', requireAuth, ownerOnly, getProjectSettings\)/,
    );
    assert.match(settingsView, /aria-label="Project settings sections"/);
    buildSettingsSections('example').forEach((section) => {
      assert.match(settingsView, new RegExp(`id="${section.key}"`));
      assert.match(settingsView, new RegExp(`aria-labelledby="${section.key}-title"`));
    });
    assert.match(settingsView, /tabindex="-1"/);
    assert.match(settingsView, /data-settings-section-link/);
    assert.match(settingsView, /data-settings-section/);
  });

  it('provides sticky desktop and in-flow mobile section navigation', () => {
    assert.match(componentsCss, /\.project-settings-layout/);
    assert.match(componentsCss, /\.settings-section-nav[\s\S]*position: sticky/);
    assert.match(componentsCss, /\.settings-section[\s\S]*scroll-margin-top/);
    assert.match(
      componentsCss,
      /@media \(max-width: 48rem\)[\s\S]*\.settings-section-nav[\s\S]*position: static/,
    );
  });

  it('updates the active section and focuses fragment targets', () => {
    assert.match(clientScript, /function initSettingsSectionNavigation/);
    assert.match(clientScript, /new IntersectionObserver/);
    assert.match(clientScript, /section\.focus\(\{ preventScroll: true \}\)/);
    assert.match(clientScript, /prefers-reduced-motion: reduce/);
    assert.match(clientScript, /setAttribute\('aria-current', 'location'\)/);
  });

  it('composes existing settings through their authoritative actions', () => {
    [
      '/update',
      '/build-configuration',
      '/build-filters',
      '/deployment-mode',
      '/deploy-hook/generate',
      '/deploy-hook/revoke',
      '/domains',
      '/notification-preference',
      '/maintenance/enable',
      '/maintenance/disable',
      '/archive',
      '/delete',
    ].forEach((suffix) => {
      assert.match(settingsView, new RegExp(`project\\.slug %>${suffix}`));
    });
    assert.match(projectController, /getProjectDomains\(req\.project\._id\)/);
    assert.match(
      projectController,
      /resolveProjectQuota\(req\.project\._id, req\.project\.ownerId\)/,
    );
    assert.match(projectController, /Repository\.findById\(req\.project\.repositoryId\)/);
  });

  it('does not expose stored deploy-hook hashes to the settings template', () => {
    assert.match(
      projectController,
      /const \{ deployHookTokenHash, \.\.\.projectForView \} = req\.project/,
    );
    assert.match(projectController, /project: projectForView/);
    assert.match(projectController, /hasDeployHook: Boolean\(deployHookTokenHash\)/);
    assert.doesNotMatch(settingsView, /deployHookTokenHash/);
  });

  it('provides read-first single-group edit controls with accessible cancellation', () => {
    assert.match(settingsView, /data-settings-edit-group/);
    assert.match(settingsView, /data-settings-display/);
    assert.match(settingsView, /data-settings-edit-form hidden/);
    assert.match(settingsView, /data-settings-cancel/);
    assert.match(clientScript, /function initSettingsEditGroups/);
    assert.match(clientScript, /form\?\.reset\(\)/);
    assert.match(clientScript, /event\.key === 'Escape'/);
    assert.match(clientScript, /activeTrigger\?\.focus\(\)/);
    assert.match(clientScript, /\.form-errors-summary, \.form-input--error, \.form-select--error/);
  });

  it('accepts only same-project settings return targets', () => {
    const req = {
      project: { slug: 'example' },
      body: { returnTo: '/projects/example/settings#notifications' },
    };
    assert.equal(projectReturnTarget(req, '/fallback'), req.body.returnTo);

    for (const returnTo of [
      '/projects/other/settings#notifications',
      '/projects/example/settings#unknown',
      '//attacker.example/path',
      'https://attacker.example/path',
    ]) {
      req.body.returnTo = returnTo;
      assert.equal(projectReturnTarget(req, '/fallback'), '/fallback');
    }
  });

  it('re-renders invalid settings forms in their active group', () => {
    assert.match(projectController, /activeSettingsEdit: 'general'/);
    assert.match(detectionController, /'build-configuration'/);
    assert.match(detectionController, /activeSettingsEdit: 'build-filters'/);
    assert.match(detectionController, /'health-check'/);
    assert.match(settingsView, /locals\.settingsValues\?\.name/);
    assert.match(settingsView, /locals\.bcErrors/);
    assert.match(settingsView, /locals\.bfErrors/);
  });
});
