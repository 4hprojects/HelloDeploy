import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import ejs from 'ejs';

const adminDomainsPath = fileURLToPath(
  new URL('../../apps/web/src/views/pages/admin/domains.ejs', import.meta.url),
);

function renderAdminDomains(customHostnameUsage) {
  return ejs.renderFile(adminDomainsPath, {
    title: 'Domain Approval Queue',
    domains: [],
    total: 0,
    page: 1,
    totalPages: 0,
    filters: { search: '' },
    routableDomains: [],
    liveTxtRecordsById: new Map(),
    customHostnameUsage,
    csrfToken: 'test-token',
  });
}

describe('admin custom hostname usage', () => {
  it('shows how many of the free hostnames are used', async () => {
    const html = await renderAdminDomains({ used: 1, limit: 100 });
    assert.match(html, /1 of 100 used/);
  });

  it('warns when the platform is close to the free allowance', async () => {
    const html = await renderAdminDomains({ used: 92, limit: 100 });
    assert.match(html, /Close to the free allowance/);
  });

  it('says when Cloudflare could not be reached', async () => {
    const html = await renderAdminDomains({ used: null, limit: 100 });
    assert.match(html, /usage unavailable/);
  });

  it('hides the usage line when custom hostnames are off', async () => {
    const html = await renderAdminDomains(null);
    assert.doesNotMatch(html, /Cloudflare custom hostnames:/);
  });
});
