import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SkipReason, connectPublicRoute } from '../../apps/worker/src/cloudflare/tunnel-api.js';

const CONFIG = {
  accountId: 'acc-1',
  tunnelId: '79fad542-82f7-4225-b917-4fcdb042e280',
  token: 'cf-token',
};

/**
 * Minimal Cloudflare stand-in. Records every request so tests can assert on
 * what was sent rather than on how many times a mock was called.
 */
function stubCloudflare({ source = 'cloudflare', zones = {}, ingress = [], dnsRecords = [] } = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const path = url.replace('https://api.cloudflare.com/client/v4', '');
    requests.push({ path, method: init.method ?? 'GET', body: init.body && JSON.parse(init.body) });

    const json = (result) => ({ ok: true, json: async () => ({ success: true, result }) });

    if (path.includes('/configurations')) {
      return init.method === 'PUT' ? json({}) : json({ source, config: { ingress } });
    }
    if (path.startsWith('/zones?name=')) {
      const name = decodeURIComponent(path.split('name=')[1]);
      return json(zones[name] ? [{ id: zones[name] }] : []);
    }
    if (path.includes('/dns_records?')) {
      return json(dnsRecords);
    }
    if (path.includes('/dns_records')) {
      return json({ id: 'rec-new' });
    }
    return json({});
  };
  return { fetchImpl, requests };
}

describe('connectPublicRoute', () => {
  it('stays manual when no Cloudflare token is configured', async () => {
    const result = await connectPublicRoute('app.example.com', { fetchImpl: async () => {} });
    assert.equal(result.reason, SkipReason.NOT_CONFIGURED);
  });

  it('attempts nothing at all when unconfigured', async () => {
    const { fetchImpl, requests } = stubCloudflare();
    await connectPublicRoute('app.example.com', { fetchImpl });
    assert.equal(requests.length, 0);
  });

  it('stays manual for a zone in another Cloudflare account', async () => {
    const { fetchImpl } = stubCloudflare({ zones: {} });
    const result = await connectPublicRoute('hellopera.online', { ...CONFIG, fetchImpl });
    assert.equal(result.reason, SkipReason.FOREIGN_ZONE);
  });

  it('refuses to touch a tunnel that is still configured from a local file', async () => {
    const { fetchImpl } = stubCloudflare({ source: 'local', zones: { 'example.com': 'z1' } });
    const result = await connectPublicRoute('app.example.com', { ...CONFIG, fetchImpl });
    assert.equal(result.reason, SkipReason.TUNNEL_LOCALLY_MANAGED);
  });

  it('creates no DNS record when the tunnel is locally managed', async () => {
    const { fetchImpl, requests } = stubCloudflare({
      source: 'local',
      zones: { 'example.com': 'z1' },
    });
    await connectPublicRoute('app.example.com', { ...CONFIG, fetchImpl });
    assert.ok(!requests.some((r) => r.path.includes('/dns_records') && r.method === 'POST'));
  });

  it('connects a hostname in a reachable zone', async () => {
    const { fetchImpl } = stubCloudflare({ zones: { 'example.com': 'z1' } });
    const result = await connectPublicRoute('app.example.com', { ...CONFIG, fetchImpl });
    assert.equal(result.automated, true);
  });

  it('adds the hostname ahead of the catch-all rule', async () => {
    const { fetchImpl, requests } = stubCloudflare({
      zones: { 'example.com': 'z1' },
      ingress: [
        { hostname: 'other.example.com', service: 'http://localhost:80' },
        { service: 'http_status:404' },
      ],
    });
    await connectPublicRoute('app.example.com', { ...CONFIG, fetchImpl });
    const put = requests.find((r) => r.method === 'PUT');
    assert.deepEqual(
      put.body.config.ingress.map((r) => r.hostname ?? 'catch-all'),
      ['other.example.com', 'app.example.com', 'catch-all'],
    );
  });

  it('leaves ingress untouched when the hostname is already routed', async () => {
    const { fetchImpl, requests } = stubCloudflare({
      zones: { 'example.com': 'z1' },
      ingress: [{ hostname: 'app.example.com' }, { service: 'http_status:404' }],
    });
    await connectPublicRoute('app.example.com', { ...CONFIG, fetchImpl });
    assert.ok(!requests.some((r) => r.method === 'PUT'));
  });

  it('creates the DNS record proxied, pointing at the tunnel', async () => {
    const { fetchImpl, requests } = stubCloudflare({ zones: { 'example.com': 'z1' } });
    await connectPublicRoute('app.example.com', { ...CONFIG, fetchImpl });
    const post = requests.find((r) => r.path.endsWith('/dns_records') && r.method === 'POST');
    assert.deepEqual(
      { content: post.body.content, proxied: post.body.proxied },
      { content: `${CONFIG.tunnelId}.cfargotunnel.com`, proxied: true },
    );
  });

  it('corrects a DNS record that points somewhere else', async () => {
    const { fetchImpl, requests } = stubCloudflare({
      zones: { 'example.com': 'z1' },
      dnsRecords: [{ id: 'rec-1', content: '3.33.152.147', proxied: true }],
    });
    await connectPublicRoute('app.example.com', { ...CONFIG, fetchImpl });
    assert.ok(requests.some((r) => r.method === 'PATCH'));
  });

  it('rewrites nothing when the DNS record is already correct', async () => {
    const { fetchImpl, requests } = stubCloudflare({
      zones: { 'example.com': 'z1' },
      ingress: [{ hostname: 'app.example.com' }],
      dnsRecords: [{ id: 'rec-1', content: `${CONFIG.tunnelId}.cfargotunnel.com`, proxied: true }],
    });
    await connectPublicRoute('app.example.com', { ...CONFIG, fetchImpl });
    assert.ok(!requests.some((r) => ['PUT', 'POST', 'PATCH'].includes(r.method)));
  });

  it('finds the zone for a multi-label hostname', async () => {
    const { fetchImpl } = stubCloudflare({ zones: { 'example.co.uk': 'z2' } });
    const result = await connectPublicRoute('deep.app.example.co.uk', { ...CONFIG, fetchImpl });
    assert.equal(result.automated, true);
  });

  it('never leaks the bearer token in an API error', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 403,
      json: async () => ({ success: false, errors: [{ message: 'Invalid access token' }] }),
    });
    await assert.rejects(
      () => connectPublicRoute('app.example.com', { ...CONFIG, fetchImpl }),
      (err) => !err.message.includes(CONFIG.token),
    );
  });
});
