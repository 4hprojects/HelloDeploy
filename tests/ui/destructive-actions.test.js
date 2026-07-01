import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const files = {
  footer: await readFile(
    new URL('../../apps/web/src/views/partials/footer.ejs', import.meta.url),
    'utf8',
  ),
  appJs: await readFile(new URL('../../apps/web/public/js/app.js', import.meta.url), 'utf8'),
  components: await readFile(
    new URL('../../apps/web/public/css/components.css', import.meta.url),
    'utf8',
  ),
  deployments: await readFile(
    new URL('../../apps/web/src/views/pages/projects/deployments.ejs', import.meta.url),
    'utf8',
  ),
  deploymentDetail: await readFile(
    new URL('../../apps/web/src/views/pages/projects/deployment-detail.ejs', import.meta.url),
    'utf8',
  ),
  repository: await readFile(
    new URL('../../apps/web/src/views/pages/projects/repository.ejs', import.meta.url),
    'utf8',
  ),
  projectShow: await readFile(
    new URL('../../apps/web/src/views/pages/projects/show.ejs', import.meta.url),
    'utf8',
  ),
  environment: await readFile(
    new URL('../../apps/web/src/views/pages/projects/environment.ejs', import.meta.url),
    'utf8',
  ),
  domains: await readFile(
    new URL('../../apps/web/src/views/pages/projects/domains.ejs', import.meta.url),
    'utf8',
  ),
  members: await readFile(
    new URL('../../apps/web/src/views/pages/projects/members.ejs', import.meta.url),
    'utf8',
  ),
  adminUsers: await readFile(
    new URL('../../apps/web/src/views/pages/admin/users.ejs', import.meta.url),
    'utf8',
  ),
  adminProjects: await readFile(
    new URL('../../apps/web/src/views/pages/admin/projects.ejs', import.meta.url),
    'utf8',
  ),
  adminServer: await readFile(
    new URL('../../apps/web/src/views/pages/admin/server.ejs', import.meta.url),
    'utf8',
  ),
  approvalRequests: await readFile(
    new URL('../../apps/web/src/views/pages/admin/approval-requests.ejs', import.meta.url),
    'utf8',
  ),
  adminDomains: await readFile(
    new URL('../../apps/web/src/views/pages/admin/domains.ejs', import.meta.url),
    'utf8',
  ),
};

describe('destructive and risky action UX', () => {
  it('styles all severity button variants used by risky actions', () => {
    assert.match(files.components, /\.button--danger/);
    assert.match(files.components, /\.button--warning/);
    assert.match(files.components, /\.button--success/);
    assert.match(files.components, /\.card--danger/);
    assert.match(files.components, /\.danger-action/);
  });

  it('lets confirmable actions declare title, accept label, severity, and pending copy', () => {
    assert.match(files.appJs, /getAttribute\('data-confirm-title'\)/);
    assert.match(files.appJs, /getAttribute\('data-confirm-accept-label'\)/);
    assert.match(files.appJs, /getAttribute\('data-confirm-variant'\)/);
    assert.match(files.appJs, /getAttribute\('data-confirm-pending-label'\)/);
    assert.match(files.appJs, /modal\.setAttribute\('aria-busy', 'true'\)/);
    assert.match(files.appJs, /form\.setAttribute\('data-submitting', '1'\)/);
  });

  it('standardizes project destructive actions through the shared confirmation contract', () => {
    assert.match(files.deployments, /data-confirm-title="Roll back deployment"/);
    assert.match(files.deployments, /data-confirm-title="Cancel deployment"/);
    assert.match(files.deploymentDetail, /data-confirm-title="Cancel deployment"/);
    assert.match(files.repository, /data-confirm-title="Disconnect repository"/);
    assert.match(files.projectShow, /data-confirm-title="Archive project"/);
    assert.match(files.environment, /data-confirm-title="Delete secret"/);
    assert.match(files.domains, /data-confirm-title="Remove domain"/);
    assert.match(files.members, /data-confirm-title="Remove member"/);
    assert.match(files.members, /data-confirm-title="Transfer ownership"/);
  });

  it('standardizes admin risky actions through the shared confirmation contract', () => {
    assert.match(files.adminUsers, /data-confirm-title="Suspend user"/);
    assert.match(files.adminProjects, /data-confirm-title="Suspend project"/);
    assert.match(files.adminServer, /data-confirm-title="Enable maintenance"/);
    assert.match(files.adminServer, /data-confirm-title="Disable maintenance"/);
    assert.match(files.adminServer, /data-confirm-title="Pause deployment queue"/);
    assert.match(files.approvalRequests, /data-confirm-title="Reject request"/);
    assert.match(files.adminDomains, /data-confirm-title="Approve domain"/);
    assert.match(files.adminDomains, /data-confirm-title="Reject domain"/);
  });
});
