import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import ejs from 'ejs';
import { AuditOutcome, ProjectRole } from '@hellodeploy/contracts';

import { buildProjectNavigation } from '../../apps/web/src/config/project-navigation.js';
import {
  describeAction,
  describeDetails,
} from '../../apps/web/src/services/audit-search.service.js';
import { toActivityCsv } from '../../apps/web/src/controllers/project-activity.controller.js';

const routes = await readFile(
  new URL('../../apps/web/src/routes/pages/project.routes.js', import.meta.url),
  'utf8',
);
const viewPath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/projects/activity.ejs', import.meta.url),
);

function renderView(overrides = {}) {
  return ejs.renderFile(viewPath, {
    project: { name: 'Sample', slug: 'sample' },
    events: [],
    actors: [],
    categories: [],
    filters: { category: '', actorId: '', outcome: '', from: '', to: '' },
    hasFilters: false,
    page: 1,
    totalPages: 1,
    total: 0,
    ...overrides,
  });
}

describe('describeAction', () => {
  it('drops the project prefix from multi-word project actions', () => {
    assert.equal(describeAction('project.member_added'), 'Member added');
  });

  it('keeps the area for single-word actions', () => {
    assert.equal(describeAction('deployment.healthy'), 'Deployment healthy');
  });

  it('uses a written label where one exists', () => {
    assert.equal(describeAction('admin.project_suspended'), 'Project suspended by HelloDeploy');
  });
});

describe('describeDetails', () => {
  it('never shows secret names', () => {
    assert.equal(describeDetails({ count: 2, names: ['STRIPE_KEY', 'DB_URL'] }), '2 affected');
  });

  it('never shows the name field, which holds secret names', () => {
    assert.equal(describeDetails({ name: 'STRIPE_KEY' }), '');
  });

  it('summarises a deployment', () => {
    assert.equal(
      describeDetails({ sequenceNumber: 12, commitSha: 'abc1234', projectId: 'x' }),
      '#12 · abc1234',
    );
  });
});

describe('toActivityCsv', () => {
  it('neutralises a spreadsheet formula in an actor name', () => {
    const csv = toActivityCsv([
      {
        createdAt: new Date('2026-10-15T10:00:00Z'),
        action: 'project.updated',
        outcome: AuditOutcome.SUCCESS,
        actorLabel: '=HYPERLINK("http://example.test")',
      },
    ]);
    assert.match(csv, /"'=HYPERLINK\(""http:\/\/example\.test""\)"/);
  });

  it('leaves out IP addresses', () => {
    const csv = toActivityCsv([
      {
        createdAt: new Date('2026-10-15T10:00:00Z'),
        action: 'project.updated',
        outcome: AuditOutcome.SUCCESS,
        actorLabel: 'Ada Lovelace',
        sourceIp: '203.0.113.9',
      },
    ]);
    assert.doesNotMatch(csv, /203\.0\.113\.9/);
  });
});

describe('activity routes and navigation', () => {
  it('limits the activity page to owners and maintainers', () => {
    assert.match(
      routes,
      /router\.get\('\/:slug\/activity', requireAuth, ownerOrMaintainer, getProjectActivity\)/,
    );
  });

  it('limits the export to owners and maintainers', () => {
    assert.match(
      routes,
      /router\.get\(\s*'\/:slug\/activity\/export',\s*requireAuth,\s*ownerOrMaintainer,\s*getProjectActivityExport,?\s*\)/,
    );
  });

  it('hides Activity from viewers', () => {
    const keys = buildProjectNavigation('sample', ProjectRole.VIEWER).map((item) => item.key);
    assert.equal(keys.includes('activity'), false);
  });

  it('shows Activity to maintainers', () => {
    const keys = buildProjectNavigation('sample', ProjectRole.MAINTAINER).map((item) => item.key);
    assert.equal(keys.includes('activity'), true);
  });
});

describe('activity view', () => {
  it('escapes actor names', async () => {
    const html = await renderView({
      events: [
        {
          createdAt: new Date('2026-10-15T10:00:00Z'),
          label: 'Project updated',
          actorLabel: '<script>alert(1)</script>',
          outcome: AuditOutcome.SUCCESS,
          details: '',
        },
      ],
      total: 1,
    });
    assert.doesNotMatch(html, /<script>alert/);
  });

  it('says when filters match nothing', async () => {
    const html = await renderView({ hasFilters: true });
    assert.match(html, /No activity matches these filters/);
  });
});
