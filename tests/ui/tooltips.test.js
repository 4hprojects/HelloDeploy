import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const footer = await readFile(
  new URL('../../apps/web/src/views/partials/footer.ejs', import.meta.url),
  'utf8',
);

const header = await readFile(
  new URL('../../apps/web/src/views/partials/header.ejs', import.meta.url),
  'utf8',
);

const statusBadge = await readFile(
  new URL('../../apps/web/src/views/partials/status-badge.ejs', import.meta.url),
  'utf8',
);

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

const adminServer = await readFile(
  new URL('../../apps/web/src/views/pages/admin/server.ejs', import.meta.url),
  'utf8',
);

const deployments = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployments.ejs', import.meta.url),
  'utf8',
);

const quota = await readFile(
  new URL('../../apps/web/src/views/pages/admin/quota.ejs', import.meta.url),
  'utf8',
);

describe('accessible tooltip UI', () => {
  it('creates one shared tooltip popover and exposes it with role=tooltip', () => {
    assert.match(footer, /className = 'tooltip-popover'/);
    assert.match(footer, /setAttribute\('role', 'tooltip'\)/);
    assert.match(footer, /aria-describedby/);
  });

  it('supports mouse, keyboard focus, escape, scroll, and resize behavior', () => {
    assert.match(footer, /mouseover/);
    assert.match(footer, /mouseout/);
    assert.match(footer, /focusin/);
    assert.match(footer, /focusout/);
    assert.match(footer, /e\.key === 'Escape'/);
    assert.match(footer, /window\.addEventListener\('scroll'/);
    assert.match(footer, /window\.addEventListener\('resize'/);
  });

  it('does not rely on native title attributes for header controls', () => {
    assert.doesNotMatch(header, /title=/);
    assert.match(header, /data-tooltip="Open or close the navigation menu"/);
    assert.match(header, /data-tooltip="Switch between light and dark theme"/);
  });

  it('adds tooltip hints to reusable status badges', () => {
    assert.match(statusBadge, /data-tooltip="<%= hint %>"/);
    assert.match(statusBadge, /tabindex="0"/);
    assert.match(statusBadge, /PENDING_ADMIN_APPROVAL/);
  });

  it('defines tooltip styling', () => {
    assert.match(componentsCss, /\.tooltip-popover/);
    assert.match(componentsCss, /\.tooltip-popover--below/);
    assert.match(componentsCss, /\[data-theme='dark'\] \.tooltip-popover/);
  });

  it('adds tooltips to high-value admin, deployment, and quota controls', () => {
    assert.match(adminServer, /data-tooltip="Pause user write actions/);
    assert.match(adminServer, /data-tooltip="Stop new deployment jobs/);
    assert.match(deployments, /data-tooltip="Deploy the latest commit/);
    assert.match(deployments, /data-tooltip="Restore the selected retained healthy deployment/);
    assert.match(quota, /data-tooltip="Runtime memory limit in megabytes/);
  });
});
