import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

process.env.GITHUB_APP_ID = '12345';
process.env.GITHUB_APP_NAME = 'test-app';

const { redactLogLine } = await import(
  '../../apps/worker/src/deployment/log-capture.js'
);

describe('redactLogLine — secret pattern redaction', () => {
  it('redacts bearer tokens', () => {
    const result = redactLogLine('Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.abc.def');
    assert.ok(!result.includes('eyJhbGciOiJSUzI1NiJ9'), 'Bearer token must be redacted');
  });

  it('redacts github token patterns', () => {
    // Pattern requires ghp_ + exactly 36 alphanumeric chars
    const result = redactLogLine('token ghp_1234567890abcdef1234567890abcdef1234');
    assert.ok(!result.includes('ghp_1234'), 'GitHub token must be redacted');
  });

  it('redacts AWS-style secret key in env var format', () => {
    // "secret=" matches the generic secret=value pattern
    const result = redactLogLine('aws_secret_access_key=wJalrXUtnFEMI/K7MDENGbPxRfi');
    assert.ok(!result.includes('wJalrXUtnFEMI'), 'AWS secret must be redacted');
  });

  it('preserves harmless messages', () => {
    const msg = 'Build step 3/5: RUN npm ci completed in 12.3s';
    const result = redactLogLine(msg);
    assert.equal(result, msg);
  });

  it('redacts URL userinfo (git clone token in URL)', () => {
    const result = redactLogLine('Clone from https://x-access-token:ghs_abc123@github.com/owner/repo');
    assert.ok(!result.includes('ghs_abc123'), 'Token in URL userinfo must be redacted');
  });

  it('returns a string for any input', () => {
    assert.equal(typeof redactLogLine(''), 'string');
    assert.equal(typeof redactLogLine('safe message'), 'string');
  });
});
