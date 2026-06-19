import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { isReservedSubdomain, isValidSubdomainLabel } = await import(
  '../../apps/worker/src/nginx/reserved-subdomains.js'
);

describe('isReservedSubdomain', () => {
  it('blocks platform-critical names', () => {
    for (const name of ['www', 'api', 'admin', 'app', 'hellodeploy', 'dashboard']) {
      assert.equal(isReservedSubdomain(name), true, `expected "${name}" to be reserved`);
    }
  });

  it('blocks infrastructure names', () => {
    for (const name of ['mail', 'smtp', 'ftp', 'vpn', 'ns1', 'ns2']) {
      assert.equal(isReservedSubdomain(name), true, `expected "${name}" to be reserved`);
    }
  });

  it('blocks environment names', () => {
    for (const name of ['dev', 'staging', 'beta', 'test', 'preview']) {
      assert.equal(isReservedSubdomain(name), true, `expected "${name}" to be reserved`);
    }
  });

  it('allows valid user project slugs', () => {
    for (const name of ['my-app', 'todo-list', 'portfolio', 'blog-v2', 'xyz123']) {
      assert.equal(isReservedSubdomain(name), false, `expected "${name}" to be allowed`);
    }
  });

  it('is case-insensitive', () => {
    assert.equal(isReservedSubdomain('WWW'), true);
    assert.equal(isReservedSubdomain('Admin'), true);
    assert.equal(isReservedSubdomain('API'), true);
  });
});

describe('isValidSubdomainLabel', () => {
  it('accepts single alphanumeric char', () => {
    assert.equal(isValidSubdomainLabel('a'), true);
    assert.equal(isValidSubdomainLabel('9'), true);
  });

  it('accepts alphanumeric with hyphens', () => {
    assert.equal(isValidSubdomainLabel('my-app'), true);
    assert.equal(isValidSubdomainLabel('hello-world-123'), true);
    assert.equal(isValidSubdomainLabel('abc'), true);
  });

  it('rejects labels starting with hyphen', () => {
    assert.equal(isValidSubdomainLabel('-bad'), false);
  });

  it('rejects labels ending with hyphen', () => {
    assert.equal(isValidSubdomainLabel('bad-'), false);
  });

  it('rejects labels with dots', () => {
    assert.equal(isValidSubdomainLabel('my.app'), false);
  });

  it('rejects labels with uppercase', () => {
    assert.equal(isValidSubdomainLabel('MyApp'), false);
  });

  it('rejects labels with spaces', () => {
    assert.equal(isValidSubdomainLabel('my app'), false);
  });

  it('rejects empty string', () => {
    assert.equal(isValidSubdomainLabel(''), false);
  });

  it('rejects labels over 63 chars', () => {
    const long = 'a'.repeat(64);
    assert.equal(isValidSubdomainLabel(long), false);
  });

  it('accepts 63-char label', () => {
    const max = 'a'.repeat(63);
    assert.equal(isValidSubdomainLabel(max), true);
  });

  it('rejects path traversal characters', () => {
    assert.equal(isValidSubdomainLabel('../etc'), false);
    assert.equal(isValidSubdomainLabel('/etc/nginx'), false);
  });
});
