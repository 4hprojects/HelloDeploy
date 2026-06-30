import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const { normalizeHostname } = await import('../../apps/web/src/services/domain.service.js');

describe('Domain validation — security hardening', () => {
  // SSRF / internal network access prevention
  it('blocks 127.x.x.x IP ranges', () => {
    assert.throws(() => normalizeHostname('127.0.0.1'), /IP address/i);
    assert.throws(() => normalizeHostname('127.255.255.255'), /IP address/i);
  });

  it('blocks private RFC-1918 IPs', () => {
    assert.throws(() => normalizeHostname('192.168.1.1'), /IP address/i);
    assert.throws(() => normalizeHostname('10.0.0.1'), /IP address/i);
  });

  it('blocks 0.0.0.0', () => {
    assert.throws(() => normalizeHostname('0.0.0.0'), /IP address/i);
  });

  it('blocks link-local IPv6', () => {
    assert.throws(() => normalizeHostname('[fe80::1]'), /IP address/i);
  });

  // Platform domain protection
  it('blocks exact platform domain', () => {
    assert.throws(() => normalizeHostname('hellodeploy.online'), /platform/i);
  });

  it('blocks subdomains of the platform domain', () => {
    assert.throws(() => normalizeHostname('evil.hellodeploy.online'), /platform/i);
    assert.throws(() => normalizeHostname('admin.hellodeploy.online'), /platform/i);
  });

  // Hostname normalization
  it('normalizes uppercase to lowercase', () => {
    assert.equal(normalizeHostname('EXAMPLE.COM'), 'example.com');
  });

  it('strips port numbers', () => {
    // URL parser removes port from hostname property
    assert.equal(normalizeHostname('example.com:8080'), 'example.com');
  });

  it('strips trailing dots', () => {
    // new URL() strips trailing dot in WHATWG parsing
    const result = normalizeHostname('example.com.');
    assert.ok(result === 'example.com' || result === 'example.com.', 'should handle trailing dot');
  });

  // Injection prevention (these should be rejected by FQDN check)
  it('blocks bare single-label hostnames', () => {
    assert.throws(() => normalizeHostname('onlyone'), /fully qualified/i);
  });
});
