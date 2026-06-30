import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Set env before importing module (avoids production required() checks)
process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';
process.env.HELLODEPLOY_MASTER_KEY = Buffer.alloc(32).toString('base64');

const { normalizeHostname } = await import('../../apps/web/src/services/domain.service.js');

describe('normalizeHostname', () => {
  it('normalizes to lowercase', () => {
    assert.equal(normalizeHostname('App.Example.COM'), 'app.example.com');
  });

  it('strips leading/trailing whitespace', () => {
    assert.equal(normalizeHostname('  app.example.com  '), 'app.example.com');
  });

  it('accepts valid FQDN', () => {
    assert.equal(normalizeHostname('my-app.example.com'), 'my-app.example.com');
  });

  it('accepts subdomain with numbers', () => {
    assert.equal(normalizeHostname('app2.my-domain.io'), 'app2.my-domain.io');
  });

  it('rejects empty string', () => {
    assert.throws(() => normalizeHostname(''), /required/i);
  });

  it('rejects null', () => {
    assert.throws(() => normalizeHostname(null), /required/i);
  });

  it('rejects localhost', () => {
    assert.throws(() => normalizeHostname('localhost'), /localhost/i);
  });

  it('rejects subdomain of localhost', () => {
    assert.throws(() => normalizeHostname('app.localhost'), /localhost/i);
  });

  it('rejects platform domain', () => {
    assert.throws(() => normalizeHostname('hellodeploy.online'), /platform/i);
  });

  it('rejects subdomain of platform domain', () => {
    assert.throws(() => normalizeHostname('my-app.hellodeploy.online'), /platform/i);
  });

  it('rejects raw IPv4 address', () => {
    assert.throws(() => normalizeHostname('192.168.1.1'), /IP address/i);
  });

  it('rejects bare hostname without dot', () => {
    assert.throws(() => normalizeHostname('onlyalabel'), /fully qualified/i);
  });

  it('rejects hostname over 253 chars', () => {
    // 5 labels of 50 chars each + dots + .com = 50*5 + 4 + 4 = 258 chars
    const long = Array(5).fill('a'.repeat(50)).join('.') + '.com';
    assert.ok(long.length > 253, `test precondition: ${long.length} chars`);
    assert.throws(() => normalizeHostname(long), /maximum length/i);
  });
});
