# Today Web App Remediation To-Do

Date: 2026-07-02
Source: [Web App Comprehensive Analysis](WEB_APP_COMPREHENSIVE_ANALYSIS.md)

Goal for today: close the immediate tenant-isolation risks, restore green local quality checks, and leave the next security/efficiency work clearly queued.

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

## Phase 4: Same-Day Security Hardening Prep

Status target: prepare scope today; implement only if Phases 1-3 finish with time remaining.

Status: completed 2026-07-02T06:43:00+08:00.

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
- [x] Create a follow-up CSP implementation task if it cannot be finished today.

Follow-up CSP implementation order:

1. Move shared footer/header/password scripts into `/public/js/app.js`.
2. Replace `members.ejs` inline `onchange` with a delegated `data-auto-submit` listener.
3. Replace repository `innerHTML` option resets with DOM-created `option` nodes.
4. Move deployment live-log and repository branch handlers into page modules using data attributes for dynamic URLs/IDs.
5. Add a nonce middleware for the head theme bootstrap or move to a tiny blocking static asset.
6. Enable Helmet CSP in report-only mode first, then enforce after violations are clean.

## Phase 5: Efficiency and UX Follow-Ups

Status target: document and queue today; implement only if low-risk and time remains.

Status: pending; next task after CSP prep unless priorities change.

- [ ] Review Mongo indexes needed by high-traffic paths.
  - [ ] `ProjectMembership.userId`
  - [ ] `ProjectMembership.projectId`
  - [ ] `Deployment.projectId + sequenceNumber`
  - [ ] `Domain.hostnameNormalized`
  - [ ] `AuditEvent.createdAt/action/outcome`
- [ ] Add an SSE scalability follow-up.
  - [ ] Track simultaneous stream limits per user/IP.
  - [ ] Consider reconnect UX after the 6-minute stream timeout.
- [ ] Improve operational error copy for common deployment/domain failures.
  - [ ] queue unavailable
  - [ ] repository access inactive
  - [ ] DNS not propagated
  - [ ] deployment already in progress

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
- [x] Remaining CSP, Redis-rate-limit, SSE, index, and UX work is either completed or explicitly queued.
