# Today Web App Remediation To-Do

Date: 2026-07-02
Source: [Web App Comprehensive Analysis](WEB_APP_COMPREHENSIVE_ANALYSIS.md)

Goal for today: close the immediate tenant-isolation risks, restore green local quality checks, implement the script CSP migration, and leave the next security/efficiency work clearly queued.

## Phase 1: Critical Tenant-Isolation Fixes

Status target: complete today before any lower-priority work.

Status: completed 2026-07-02T06:40:31+08:00.

- [x] Update deployment cancel flow to require the current project scope.
  - [x] Change `postCancelDeployment` to pass `req.project._id` into the service.
  - [x] Change `cancelDeployment` to query by both `deploymentId` and `projectId`.
  - [x] Return a generic not-found/out-of-scope error for mismatched project ownership.
- [x] Update deployment retry flow to require the current project scope.
  - [x] Change `postRetryDeployment` to pass `req.project._id` into the service.
  - [x] Change `retryDeployment` to query the original deployment by both `deploymentId` and `projectId`.
  - [x] Ensure retried deployments are still created only under the original/current project.
- [x] Update domain verification flow to require the current project scope.
  - [x] Change `postVerifyDomain` to pass `req.project._id` into the service.
  - [x] Change `requestVerification` to query by both `domainId` and `projectId`.
- [x] Update domain removal flow to require the current project scope.
  - [x] Change `postRemoveDomain` to pass `req.project._id` into the service.
  - [x] Change `removeDomain` to query by both `domainId` and `projectId`.
  - [x] Confirm active-domain route cleanup still uses the verified domain's stored project data after ownership is checked.

## Phase 2: Regression Tests

Status target: complete today immediately after Phase 1 implementation.

Status: completed 2026-07-02T06:40:31+08:00.

- [x] Add deployment isolation tests.
  - [x] A Project A maintainer cannot cancel Project B's active deployment.
  - [x] A Project A maintainer cannot retry Project B's failed/cancelled deployment.
  - [x] Valid same-project cancel/retry behavior still works.
- [x] Add domain isolation tests.
  - [x] A Project A owner cannot queue verification for Project B's domain.
  - [x] A Project A owner cannot remove Project B's domain.
  - [x] Valid same-project verify/remove behavior still works.
- [x] Add or update tests around service signatures so future callers must provide `projectId`.

Evidence: `tests/deployment/cancel-retry-flow.test.js` and `tests/domain/domain-isolation.test.js` assert that controllers pass `req.project._id` and services query owned records by both object ID and `projectId`.

## Phase 3: Quality Gate Cleanup

Status target: complete today after critical tests are in place.

Status: completed 2026-07-02T06:40:31+08:00.

- [x] Fix the existing lint failure in `tests/deployment/live-progress-sse.test.js`.
  - [x] Replace hard-to-count literal regex spaces with `{6}` or apply the equivalent ESLint fix.
- [x] Run `npm run lint`.
  - [x] Result: passed.
- [x] Run `npm test`.
  - [x] Result: passed, 465 tests, 0 failures.
- [x] If failures appear, fix only issues related to today's changes unless a blocker requires otherwise.

## Phase 4: Same-Day Security Hardening

Status target: implement script CSP today after Phases 1-3 finish.

Status: completed 2026-07-02T07:34:11+08:00.

- [x] Inventory inline scripts that block CSP enablement.
  - [x] `apps/web/src/views/partials/head.ejs` theme bootstrap.
  - [x] `apps/web/src/views/partials/footer.ejs` tooltip, scroll-to-top, confirmation modal, and pending-submit handlers.
  - [x] `apps/web/src/views/partials/header.ejs` mobile sidebar/theme toggle handler.
  - [x] `apps/web/src/views/partials/password-field.ejs` password visibility handler.
  - [x] `apps/web/src/views/partials/password-requirements.ejs` password strength handler.
  - [x] `apps/web/src/views/pages/projects/deployment-detail.ejs` EventSource live log handler.
  - [x] `apps/web/src/views/pages/projects/repository.ejs` repository branch loading handler.
  - [x] `apps/web/src/views/pages/projects/members.ejs` inline `onchange="this.form.submit()"`.
- [x] Decide CSP path.
  - [x] Static external JS for reusable behavior.
  - [x] Per-request nonce for the early theme bootstrap if it must remain render-blocking.
  - [x] Helmet CSP directives for `script-src`, `connect-src`, `img-src`, `style-src`, and Turnstile.
- [x] Move shared browser behavior into a cacheable static JS asset.
  - [x] Header theme/sidebar behavior.
  - [x] Footer tooltip, scroll-to-top, confirmation modal, and pending-submit behavior.
  - [x] Password visibility and password requirement behavior.
  - [x] Deployment live-log EventSource behavior.
  - [x] Repository branch loading behavior.
- [x] Replace the `members.ejs` inline `onchange` handler with delegated `data-auto-submit` behavior.
- [x] Replace repository `innerHTML` option resets with DOM-created `option` nodes.
- [x] Add per-request CSP nonces for the early theme bootstrap.
- [x] Enable Helmet CSP enforcement for scripts with `script-src 'self'` plus the request nonce.
- [x] Add regression coverage for CSP headers, nonce propagation, removed inline handlers, and removed unsafe JS sinks.

- [x] Move app-rendered inline `style` attributes into CSS classes.
- [x] Remove temporary `style-src 'unsafe-inline'`.
- [x] Add `style-src-attr 'none'` to block future inline style attributes.

Remaining CSP follow-up:

1. Review external service allowances before enabling integrations that require third-party script/connect targets.
2. Keep email-template inline styles separate from browser CSP; email client rendering depends on inline styling.

## Phase 5: Efficiency and UX Follow-Ups

Status target: document and queue today; implement only if low-risk and time remains.

Status: completed 2026-07-02T12:05:51+08:00.

- [x] Review Mongo indexes needed by high-traffic paths.
  - [x] `ProjectMembership.userId`: already indexed.
  - [x] `ProjectMembership.projectId`: covered by existing project/role and project/user indexes.
  - [x] `Deployment.projectId + sequenceNumber`: already indexed and unique.
  - [x] `Domain.hostnameNormalized`: already indexed and unique.
  - [x] `AuditEvent.createdAt/action/outcome`: action/date existed; added outcome/date, targetType/date, and targetId/date indexes for audit search/export filters.
- [x] Add an SSE scalability follow-up.
  - [x] Track simultaneous stream limits per user/IP.
  - [x] Consider reconnect UX after the 6-minute stream timeout.
- [x] Implement SSE stream cap and reconnect UX.
  - [x] Cap simultaneous deployment log streams per signed-in user.
  - [x] Cap simultaneous deployment log streams per source IP.
  - [x] Return `429` with `Retry-After` when the stream cap is exceeded.
  - [x] Add a reconnect control after stream timeout or disconnect.
- [x] Harden Redis-backed rate limiting for production.
  - [x] Keep memory fallback for development/test.
  - [x] Throw during production store creation if Redis-backed rate limiting cannot be configured.
  - [x] Explicitly fail closed on Redis store errors with `passOnStoreError: false`.
- [x] Improve operational error copy for common deployment/domain failures.
  - [x] queue unavailable
  - [x] repository access inactive
  - [x] DNS not propagated
  - [x] deployment already in progress

Follow-up implementation queue:

1. Rewrite common deployment/domain service errors into action-oriented UI copy.
2. Consider admin saved filters for audit/project/user workflows after index changes are deployed.

## Phase 6: Documentation and Closeout

Status target: complete today before stopping.

- [x] Update this checklist with completion notes.
- [x] Update [Phase Task Tracker](PHASE_TASK_TRACKER.md) only for items actually completed or validated.
- [x] Add a concise worklog entry in [WORKLOG.md](../WORKLOG.md).
- [x] Re-run final checks.
  - [x] `npm run lint`
  - [x] `npm test`
  - [x] `npm run format:check`
- [x] Summarize final status, changed files, and any remaining risks.

## Acceptance Criteria for Today

- [x] Cross-project deployment cancel/retry attempts are blocked.
- [x] Cross-project domain verify/remove attempts are blocked.
- [x] Regression tests prove both blocked and allowed paths.
- [x] `npm run lint` passes.
- [x] `npm test` passes.
- [x] `npm run format:check` passes.
- [x] Script CSP, index work, and the P0 isolation fixes are completed.
- [x] Remaining UX/admin filter work is explicitly queued.
