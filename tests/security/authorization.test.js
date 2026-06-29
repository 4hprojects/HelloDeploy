import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PlatformRole, UserStatus } from '@hellodeploy/contracts';

const { requireAuth, requireSuperAdmin, requireAdmin } = await import(
  '../../apps/web/src/middleware/require-auth.js'
);

function makeRes() {
  return {
    redirectedTo: null,
    renderedStatus: null,
    renderedView: null,
    redirect(url) { this.redirectedTo = url; return this; },
    status(code) { this.renderedStatus = code; return this; },
    render(view, data) { this.renderedView = view; this.renderedData = data; return this; },
  };
}

// ─── requireAuth ──────────────────────────────────────────────────────────────

describe('requireAuth — authentication gate', () => {
  it('redirects unauthenticated request to sign-in with encoded return URL', () => {
    const req = { session: {}, originalUrl: '/projects/my-app' };
    const res = makeRes();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, 'next must not be called for unauthenticated request');
    assert.ok(res.redirectedTo?.startsWith('/auth/sign-in'), 'must redirect to sign-in');
    assert.ok(
      res.redirectedTo?.includes(encodeURIComponent('/projects/my-app')),
      'must preserve the return URL',
    );
  });

  it('blocks SUSPENDED user: destroys session and redirects with account_suspended', () => {
    let destroyed = false;
    const req = {
      session: {
        user: { status: UserStatus.SUSPENDED },
        destroy(cb) { destroyed = true; cb?.(); },
      },
      originalUrl: '/dashboard',
    };
    const res = makeRes();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(destroyed, true, 'session must be destroyed for suspended user');
    assert.ok(res.redirectedTo?.includes('account_suspended'), 'redirect must include suspension reason');
  });

  it('blocks PENDING_VERIFICATION user: destroys session and redirects', () => {
    let destroyed = false;
    const req = {
      session: {
        user: { status: UserStatus.PENDING_VERIFICATION },
        destroy(cb) { destroyed = true; cb?.(); },
      },
      originalUrl: '/dashboard',
    };
    const res = makeRes();
    requireAuth(req, res, () => {});
    assert.equal(destroyed, true, 'any non-ACTIVE status must block access');
  });

  it('allows ACTIVE user and calls next without redirecting', () => {
    const req = {
      session: { user: { status: UserStatus.ACTIVE, platformRole: PlatformRole.USER } },
      originalUrl: '/dashboard',
    };
    const res = makeRes();
    let nextCalled = false;
    requireAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'ACTIVE user must reach next middleware');
    assert.equal(res.redirectedTo, null, 'ACTIVE user must not be redirected');
  });
});

// ─── requireSuperAdmin ────────────────────────────────────────────────────────

describe('requireSuperAdmin — vertical privilege escalation prevention', () => {
  it('blocks USER role with 403', () => {
    const req = { session: { user: { platformRole: PlatformRole.USER } } };
    const res = makeRes();
    let nextCalled = false;
    requireSuperAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, 'USER must not pass super admin gate');
    assert.equal(res.renderedStatus, 403);
  });

  it('blocks ADMIN role with 403 — only SUPER_ADMIN may pass this gate', () => {
    const req = { session: { user: { platformRole: PlatformRole.ADMIN } } };
    const res = makeRes();
    let nextCalled = false;
    requireSuperAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, 'ADMIN must not pass super admin gate');
    assert.equal(res.renderedStatus, 403);
  });

  it('allows SUPER_ADMIN', () => {
    const req = { session: { user: { platformRole: PlatformRole.SUPER_ADMIN } } };
    const res = makeRes();
    let nextCalled = false;
    requireSuperAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(res.renderedStatus, null, 'must not render an error');
  });

  it('blocks absent session user (missing platformRole) with 403', () => {
    const req = { session: {} };
    const res = makeRes();
    let nextCalled = false;
    requireSuperAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.renderedStatus, 403);
  });
});

// ─── requireAdmin ─────────────────────────────────────────────────────────────

describe('requireAdmin — vertical privilege check', () => {
  it('blocks USER role with 403', () => {
    const req = { session: { user: { platformRole: PlatformRole.USER } } };
    const res = makeRes();
    let nextCalled = false;
    requireAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.renderedStatus, 403);
  });

  it('allows ADMIN to pass', () => {
    const req = { session: { user: { platformRole: PlatformRole.ADMIN } } };
    const res = makeRes();
    let nextCalled = false;
    requireAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  it('allows SUPER_ADMIN to pass', () => {
    const req = { session: { user: { platformRole: PlatformRole.SUPER_ADMIN } } };
    const res = makeRes();
    let nextCalled = false;
    requireAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
});

// ─── Open redirect prevention ─────────────────────────────────────────────────

describe('open redirect prevention — returnTo validation (mirrors safeRedirect in auth.controller.js)', () => {
  // The controller uses: if (returnTo && /^\/[^/]/.test(returnTo)) return returnTo; else fallback.
  const isSafeRedirectTarget = (url) => Boolean(url && /^\/[^/]/.test(url));

  it('allows relative paths starting with a single slash', () => {
    assert.equal(isSafeRedirectTarget('/dashboard'), true);
    assert.equal(isSafeRedirectTarget('/projects/my-app/deployments'), true);
    assert.equal(isSafeRedirectTarget('/admin'), true);
  });

  it('blocks protocol-relative URLs (double slash — allows subdomain redirect)', () => {
    assert.equal(isSafeRedirectTarget('//evil.com'), false);
    assert.equal(isSafeRedirectTarget('//evil.com/steal-credentials'), false);
  });

  it('blocks absolute HTTP/HTTPS URLs', () => {
    assert.equal(isSafeRedirectTarget('https://evil.com'), false);
    assert.equal(isSafeRedirectTarget('http://evil.com'), false);
    assert.equal(isSafeRedirectTarget('https://evil.com/path'), false);
  });

  it('blocks empty, null, and undefined inputs (falls back to default)', () => {
    assert.equal(isSafeRedirectTarget(''), false);
    assert.equal(isSafeRedirectTarget(null), false);
    assert.equal(isSafeRedirectTarget(undefined), false);
  });
});
