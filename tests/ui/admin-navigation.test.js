import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ejs from 'ejs';
import { getStatusPresentation } from '@hellodeploy/contracts';

const viewPath = (relative) =>
  fileURLToPath(new URL(`../../apps/web/src/views/${relative}`, import.meta.url));

const admin = { id: 'admin-1', platformRole: 'ADMIN' };

function renderSidebar(adminPendingCounts) {
  return ejs.renderFile(viewPath('partials/sidebar.ejs'), {
    user: admin,
    currentPath: '/admin/domains',
    adminPendingCounts,
  });
}

function renderAdminProjects(search) {
  return ejs.renderFile(viewPath('pages/admin/projects.ejs'), {
    total: 40,
    filters: { search, status: '' },
    projects: [{ _id: 'p1', name: 'Demo', slug: 'demo', status: 'ACTIVE', createdAt: new Date() }],
    page: 1,
    totalPages: 2,
  });
}

function renderAdminDomains(routingState, { search = '', domains = [], totalPages = 0 } = {}) {
  return ejs.renderFile(viewPath('pages/admin/domains.ejs'), {
    domains,
    total: domains.length,
    page: 1,
    totalPages,
    filters: { search },
    routableDomains: [
      { _id: 'd1', hostnameNormalized: 'app.example.com', tunnelId: 'a'.repeat(36), routingState },
    ],
    liveTxtRecordsById: new Map(),
    customHostnameUsage: null,
  });
}

describe('admin sidebar', () => {
  it('links to the domain approval queue', async () => {
    const html = await renderSidebar({});
    assert.match(html, /href="\/admin\/domains"\s+class="sidebar__link"\s+aria-current="page"/);
  });

  it('shows how many domains are waiting for review', async () => {
    const html = await renderSidebar({ pendingApprovals: 0, pendingDomainApprovals: 3 });
    assert.match(html, /sidebar__count">3<span class="sr-only"> waiting<\/span>/);
  });

  it('hides queue counts when nothing is waiting', async () => {
    const html = await renderSidebar({ pendingApprovals: 0, pendingDomainApprovals: 0 });
    assert.doesNotMatch(html, /sidebar__count/);
  });
});

describe('admin list pages', () => {
  it('encodes the project search term in pagination links', async () => {
    const html = await renderAdminProjects('a&b c');
    assert.match(html, /search=a%26b%20c/);
  });

  it('asks for the suspension reason in the confirm dialog instead of the table row', async () => {
    const html = await renderAdminProjects('');
    assert.match(html, /data-confirm-reason>[\s\S]*?<input type="hidden" name="reason"/);
  });

  it('encodes the domain search term in pagination links', async () => {
    const pending = { _id: 'd2', hostnameNormalized: 'shop.example.com', projectId: null };
    const html = await renderAdminDomains('LIVE', {
      search: 'a&b c',
      domains: [pending],
      totalPages: 2,
    });
    assert.match(html, /href="\?page=2&search=a%26b%20c"/);
  });

  it('says when no pending domain matches the search', async () => {
    const html = await renderAdminDomains('LIVE', { search: 'nothing' });
    assert.match(html, /No domains awaiting approval match the search/);
  });

  it('describes the domain routing probe result in words', async () => {
    const html = await renderAdminDomains('TUNNEL_DOWN');
    assert.match(html, /status-badge--failed">Tunnel down</);
  });
});

describe('admin ux metrics', () => {
  it('explains an empty period instead of a page of zeroes', async () => {
    const html = await ejs.renderFile(viewPath('pages/admin/ux-metrics.ejs'), {
      metrics: { days: 7, counts: { signup_completed: 0 }, p75: {} },
    });
    assert.match(html, /No signals in the last 7 days/);
  });
});

describe('approval status presentation', () => {
  it('shows changes requested as a warning rather than a failure', () => {
    assert.equal(getStatusPresentation('approval', 'CHANGES_REQUESTED').tone, 'warning');
  });
});
