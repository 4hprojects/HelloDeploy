import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { redactLogLine } from '../../apps/worker/src/deployment/log-capture.js';

const redacts = (line) => redactLogLine(line).includes('[REDACTED]');

describe('deployment log redaction', () => {
  it('removes a GitHub token', () => {
    assert.equal(redacts(`cloning with ghp_${'a'.repeat(36)}`), true);
  });

  it('removes a bearer header', () => {
    assert.equal(redacts('Authorization: Bearer abc123def456'), true);
  });

  it('removes a private key block', () => {
    assert.equal(
      redacts('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----'),
      true,
    );
  });

  it('removes a password assignment', () => {
    assert.equal(redacts('connecting with password=hunter2'), true);
  });

  it('caps a very long line', () => {
    assert.equal(redactLogLine('x'.repeat(5000)).length, 2000);
  });
});

/**
 * Redaction matches shapes, not the values a project actually set. The
 * documentation says so, and these pin the boundary: if redaction is ever
 * widened to cover these, the documentation needs to change with it.
 */
describe('what redaction does not cover', () => {
  it('leaves a database URL with an embedded password', () => {
    assert.equal(redacts('DATABASE_URL=postgres://user:hunter2@db.example.com:5432/app'), false);
  });

  it('leaves a secret printed as part of an object', () => {
    assert.equal(redacts("{ STRIPE_SECRET: 'rk_live_51H8xyzABC' }"), false);
  });

  it('leaves a bare key value with no recognisable prefix', () => {
    assert.equal(redacts('Loaded config: MY_API_KEY is 9f8e7d6c5b4a3210'), false);
  });
});
