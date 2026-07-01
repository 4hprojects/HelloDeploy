import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { buildSelfHostedChecklist } = await import('../../scripts/self-hosted-checklist.js');

describe('self-hosted checklist', () => {
  it('defaults to Cloudflare Tunnel mode', () => {
    const checklist = buildSelfHostedChecklist();
    assert.equal(checklist.mode, 'cloudflare_tunnel');
    assert.equal(checklist.label, 'Cloudflare Tunnel');
    assert.equal(checklist.license, 'MIT');
  });

  it('documents Ubuntu 22.04 and 24.04 support', () => {
    const checklist = buildSelfHostedChecklist();
    assert.deepEqual(checklist.supportedUbuntu, ['22.04', '24.04']);
  });

  it('includes required secret and integration environment keys', () => {
    const checklist = buildSelfHostedChecklist();
    assert.ok(checklist.requiredEnvironment.includes('HELLODEPLOY_MASTER_KEY'));
    assert.ok(checklist.requiredEnvironment.includes('GITHUB_WEBHOOK_SECRET'));
    assert.ok(checklist.requiredEnvironment.includes('MONGODB_URI'));
    assert.ok(checklist.requiredEnvironment.includes('TURNSTILE_SECRET_KEY'));
  });

  it('supports public IP mode', () => {
    const checklist = buildSelfHostedChecklist({
      mode: 'public_ip',
      domain: 'deploy.example.com',
    });
    assert.equal(checklist.label, 'Public IP');
    assert.equal(checklist.domain, 'deploy.example.com');
    assert.ok(checklist.dns.some((item) => item.includes('public IP')));
  });

  it('falls back to Cloudflare Tunnel for unknown modes', () => {
    const checklist = buildSelfHostedChecklist({ mode: 'unknown' });
    assert.equal(checklist.label, 'Cloudflare Tunnel');
  });
});
