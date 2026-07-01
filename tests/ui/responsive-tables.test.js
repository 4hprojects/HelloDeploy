import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

const adminUsers = await readFile(
  new URL('../../apps/web/src/views/pages/admin/users.ejs', import.meta.url),
  'utf8',
);

const adminProjects = await readFile(
  new URL('../../apps/web/src/views/pages/admin/projects.ejs', import.meta.url),
  'utf8',
);

const adminDomains = await readFile(
  new URL('../../apps/web/src/views/pages/admin/domains.ejs', import.meta.url),
  'utf8',
);

const auditEvents = await readFile(
  new URL('../../apps/web/src/views/pages/admin/audit-events.ejs', import.meta.url),
  'utf8',
);

const projectDeployments = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployments.ejs', import.meta.url),
  'utf8',
);

const projectDomains = await readFile(
  new URL('../../apps/web/src/views/pages/projects/domains.ejs', import.meta.url),
  'utf8',
);

const projectMembers = await readFile(
  new URL('../../apps/web/src/views/pages/projects/members.ejs', import.meta.url),
  'utf8',
);

const projectEnvironment = await readFile(
  new URL('../../apps/web/src/views/pages/projects/environment.ejs', import.meta.url),
  'utf8',
);

const projectIndex = await readFile(
  new URL('../../apps/web/src/views/pages/projects/index.ejs', import.meta.url),
  'utf8',
);

describe('responsive tables', () => {
  it('defines stacked mobile row styles for opted-in tables', () => {
    assert.match(componentsCss, /\.table-responsive/);
    assert.match(componentsCss, /\.table--responsive/);
    assert.match(componentsCss, /@media \(max-width: 48rem\)/);
    assert.match(componentsCss, /content: attr\(data-label\)/);
    assert.match(componentsCss, /grid-template-columns: minmax\(7rem, 38%\) minmax\(0, 1fr\)/);
    assert.match(componentsCss, /overflow-wrap: anywhere/);
  });

  it('updates admin tables with responsive wrappers and cell labels', () => {
    for (const template of [adminUsers, adminProjects, adminDomains, auditEvents]) {
      assert.match(template, /table-responsive/);
      assert.match(template, /table--responsive/);
      assert.match(template, /data-label=/);
    }

    assert.match(adminUsers, /data-label="User"/);
    assert.match(adminProjects, /data-label="Owner"/);
    assert.match(adminDomains, /data-label="Verified"/);
    assert.match(auditEvents, /data-label="Outcome"/);
  });

  it('updates project tables with responsive wrappers and cell labels', () => {
    for (const template of [
      projectDeployments,
      projectDomains,
      projectMembers,
      projectEnvironment,
      projectIndex,
    ]) {
      assert.match(template, /table-responsive/);
      assert.match(template, /table--responsive/);
      assert.match(template, /data-label=/);
    }

    assert.match(projectDeployments, /data-label="Duration"/);
    assert.match(projectDomains, /data-label="Hostname"/);
    assert.match(projectMembers, /data-label="Member"/);
    assert.match(projectEnvironment, /data-label="Last updated"/);
    assert.match(projectIndex, /data-label="Name"/);
  });
});
