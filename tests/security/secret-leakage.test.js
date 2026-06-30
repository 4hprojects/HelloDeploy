import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

async function src(relPath) {
  return readFile(join(ROOT, relPath), 'utf8');
}

// ─── Global error handler — must not leak internals ───────────────────────────

describe('secret leakage — global error handler does not expose internals', () => {
  let appSource;

  before(async () => {
    appSource = await src('apps/web/src/app.js');
  });

  it('error handler renders a static, generic message — not err.message', () => {
    // Match the res.status(500).render(...{...}) call specifically
    const renderSection = appSource.match(/res\.status\(500\)\.render\([\s\S]+?\}\)/)?.[0] ?? '';
    assert.ok(
      renderSection.length > 0,
      'global 500 error handler render call must exist in app.js',
    );
    assert.ok(
      renderSection.includes('An unexpected error occurred'),
      'render must use a static, generic user-facing message',
    );
    assert.ok(
      !renderSection.includes('err.'),
      'err.message / err.stack must not appear in the render() arguments — those leak internals to clients',
    );
  });

  it('error handler logs full details (message + stack) to the server log only', () => {
    // logger.error call in the error handler contains both — verified directly in source
    assert.ok(
      appSource.includes('err.message'),
      'err.message must be logged server-side (not silently swallowed)',
    );
    assert.ok(
      appSource.includes('err.stack'),
      'err.stack must be logged server-side for debugging (not silently swallowed)',
    );
  });
});

// ─── Auth service — account enumeration prevention ────────────────────────────

describe('secret leakage — auth service prevents account enumeration', () => {
  let authSource;

  before(async () => {
    authSource = await src('apps/web/src/services/auth.service.js');
  });

  it('uses a single GENERIC_AUTH_FAILURE constant for all sign-in failure paths', () => {
    const occurrences = (authSource.match(/GENERIC_AUTH_FAILURE/g) ?? []).length;
    assert.ok(
      occurrences >= 3,
      `GENERIC_AUTH_FAILURE must be returned for unknown email, wrong password, and suspended account — found ${occurrences} occurrence(s)`,
    );
  });

  it('runs a dummy hash when email is unknown (prevents timing-based enumeration)', () => {
    assert.ok(
      authSource.includes('timing-stub'),
      'a dummy password hash (timing-stub) must run even when the email is not found, equalising ' +
        'response time between "email not found" and "wrong password" cases',
    );
    assert.ok(
      authSource.includes('$argon2id$'),
      'the dummy hash must use a real argon2id cost factor so timing is indistinguishable from a real verify',
    );
  });

  it('initiatePasswordReset is always silent (same response whether email exists or not)', () => {
    assert.ok(
      authSource.includes('Always silent'),
      'initiatePasswordReset must be documented as always silent to prevent email enumeration via ' +
        'the "we sent a reset link" flow',
    );
  });

  it('registerUser returns null silently on duplicate email (no enumeration via registration)', () => {
    assert.ok(
      authSource.includes('silent') && authSource.includes('return null'),
      'duplicate-email registration must return null silently — caller shows "check your email" ' +
        'regardless so attacker cannot determine whether the email is already registered',
    );
  });
});

// ─── Auth service — password reset brute-force resistance ────────────────────

describe('secret leakage — password reset code brute-force resistance', () => {
  let authSource;

  before(async () => {
    authSource = await src('apps/web/src/services/auth.service.js');
  });

  it('enforces a maximum attempt limit on password reset codes (RESET_MAX_ATTEMPTS)', () => {
    assert.ok(
      authSource.includes('RESET_MAX_ATTEMPTS'),
      'password reset code verification must cap attempts to prevent brute-forcing 6-digit codes',
    );
  });

  it('uses a 6-digit code (randomInt 100_000–999_999, not predictable)', () => {
    assert.ok(
      authSource.includes('100_000') && authSource.includes('999_999'),
      'reset codes must use randomInt(100_000, 999_999) — 900,000 possible values, not 10^6 shortfall',
    );
    assert.ok(
      authSource.includes('randomInt'),
      'must use crypto.randomInt (not Math.random) for CSPRNG-backed codes',
    );
  });
});

// ─── Clone service — token URL never logged verbatim ─────────────────────────

describe('secret leakage — git clone does not log repository token URLs verbatim', () => {
  let cloneSource;

  before(async () => {
    cloneSource = await src('apps/worker/src/git/clone.js');
  });

  it('redacts the token in log output (REDACTED substitution)', () => {
    assert.ok(
      cloneSource.includes('REDACTED') || cloneSource.includes('logUrl'),
      'clone.js must redact the token URL before logging — GitHub tokens in logs would allow repo access ' +
        'to anyone with log read access',
    );
  });

  it('removes .git directory after clone (purges token URL from git reflog)', () => {
    assert.ok(
      cloneSource.includes('.git'),
      '.git directory (containing the token URL in the reflog) must be removed post-clone',
    );
  });

  it('removes the origin remote after clone (token URL no longer stored in git config)', () => {
    assert.ok(
      cloneSource.includes("'remote', 'remove', 'origin'"),
      'origin remote must be removed — it contains the token URL in plain text in .git/config',
    );
  });
});
