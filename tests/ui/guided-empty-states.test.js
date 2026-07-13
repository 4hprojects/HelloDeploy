import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const componentsCss = await readFile(
  new URL('../../apps/web/public/css/components.css', import.meta.url),
  'utf8',
);

const dashboard = await readFile(
  new URL('../../apps/web/src/views/pages/dashboard.ejs', import.meta.url),
  'utf8',
);

const projectsIndex = await readFile(
  new URL('../../apps/web/src/views/pages/projects/index.ejs', import.meta.url),
  'utf8',
);

const repository = await readFile(
  new URL('../../apps/web/src/views/pages/projects/repository.ejs', import.meta.url),
  'utf8',
);

const detection = await readFile(
  new URL('../../apps/web/src/views/pages/projects/detection.ejs', import.meta.url),
  'utf8',
);

const deployments = await readFile(
  new URL('../../apps/web/src/views/pages/projects/deployments.ejs', import.meta.url),
  'utf8',
);

const environment = await readFile(
  new URL('../../apps/web/src/views/pages/projects/environment.ejs', import.meta.url),
  'utf8',
);

const domains = await readFile(
  new URL('../../apps/web/src/views/pages/projects/domains.ejs', import.meta.url),
  'utf8',
);

const projectShow = await readFile(
  new URL('../../apps/web/src/views/pages/projects/show.ejs', import.meta.url),
  'utf8',
);

const projectController = await readFile(
  new URL('../../apps/web/src/controllers/project.controller.js', import.meta.url),
  'utf8',
);

const adminApprovals = await readFile(
  new URL('../../apps/web/src/views/pages/admin/approval-requests.ejs', import.meta.url),
  'utf8',
);

describe('guided empty states', () => {
  it('defines shared step and action styling for empty states', () => {
    assert.match(componentsCss, /\.empty-state__steps/);
    assert.match(componentsCss, /\.empty-state__steps li::before/);
    assert.match(componentsCss, /\.empty-state__actions/);
  });

  it('guides first project creation from dashboard and project list empty states', () => {
    assert.match(dashboard, /empty-state__steps/);
    assert.match(dashboard, /Connect the GitHub repository/);
    assert.match(projectsIndex, /Run detection, configure secrets, then deploy/);
  });

  it('guides repository, detection, and deployment setup gaps', () => {
    assert.match(repository, /Install the GitHub App/);
    assert.match(repository, /Update GitHub App access/);
    assert.match(detection, /Choose the production branch/);
    assert.match(deployments, /Complete the setup path before the first deployment/);
    assert.match(deployments, /href="\/projects\/<%= project\.slug %>\/detection"/);
  });

  it('surfaces one primary next onboarding action', () => {
    assert.match(projectController, /nextStep: steps\.find/);
    assert.match(projectShow, /Next: <%= onboarding\.nextStep\.label %>/);
  });

  it('guides optional configuration empty states without cluttering populated screens', () => {
    assert.match(environment, /No secrets yet/);
    assert.match(environment, /Redeploy after changing secrets/);
    assert.match(domains, /No custom domains/);
    assert.match(domains, /Verify ownership, then wait for administrator approval/);
    assert.match(projectShow, /No repository connected/);
    assert.match(projectShow, /No deployments yet/);
  });

  it('adds operational guidance for admin empty queues', () => {
    assert.match(adminApprovals, /New project review submissions appear here automatically/);
    assert.match(adminApprovals, /href="\/admin\/audit-events"/);
  });
});
