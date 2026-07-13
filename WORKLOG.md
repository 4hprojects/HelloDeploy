# Worklog

## Operational Error Copy

- Status: Completed
- Started: 2026-07-02T12:05:51+08:00
- Completed: 2026-07-02T12:08:22+08:00

### Results

- Added action-oriented deployment queue outage copy that points admins to Redis and worker health.
- Added repository access inactive copy that tells users to reconnect or update GitHub App installation access.
- Rewrote deployment-in-progress copy to point users to wait or cancel from Deployments.
- Added domain queue and route activation copy with administrator recovery steps.
- Added DNS propagation guidance to the verification queued flash message.
- Added regression coverage for the operational error-copy strings.
- Updated today's remediation checklist and the comprehensive analysis report.

### Verification

- `node --test tests/ui/operational-error-copy.test.js tests/deployment/cancel-retry-flow.test.js tests/deployment/deployment-options.test.js tests/domain/domain-isolation.test.js` passed.

## Deployment Log SSE Cap And Reconnect

- Status: Completed
- Started: 2026-07-02T12:02:22+08:00
- Completed: 2026-07-02T12:05:51+08:00

### Results

- Added in-process active SSE stream counters by signed-in user and source IP.
- Capped deployment log streams at 3 per user and 6 per source IP.
- Return `429` with `Retry-After: 30` when stream caps are exceeded before opening the SSE response.
- Release stream counters on client close, terminal deployment status, timeout, and pre-stream errors.
- Added a reconnect button for live deployment logs after timeout or disconnect.
- Added regression coverage for stream caps and reconnect behavior.
- Updated today's remediation checklist and the comprehensive analysis report.

### Verification

- `node --test tests/deployment/live-progress-sse.test.js tests/deployment/log-viewer-safety.test.js tests/ui/deployment-timeline.test.js` passed.

## Production Rate Limit Hardening

- Status: Completed
- Started: 2026-07-02T12:00:02+08:00
- Completed: 2026-07-02T12:02:22+08:00

### Results

- Kept development/test memory-store fallback for local use.
- Changed production Redis store creation failures to throw instead of silently falling back to in-memory rate limits.
- Logged production Redis client errors as errors instead of warnings.
- Set `passOnStoreError: false` explicitly on all five rate limiters so Redis store errors fail closed.
- Added source-level regression coverage for production fail-closed behavior.
- Updated today's remediation checklist and the comprehensive analysis report.

### Verification

- `node --test tests/security/rate-limit.test.js` passed.

## Inline Style CSP Tightening

- Status: Completed
- Started: 2026-07-02T11:52:00+08:00
- Completed: 2026-07-02T12:00:02+08:00

### Results

- Replaced app-rendered EJS `style` attributes with reusable CSS classes.
- Added narrow utility/component classes for inline forms, hidden blocks, constrained filters/cards, success text, uppercase inputs, warning cards, and aligned form controls.
- Switched repository branch visibility from `element.style.display` to `d-none`.
- Reworked tooltip positioning to use CSS anchoring classes instead of JS-written `top`/`left` inline styles.
- Tightened Helmet CSP from `style-src 'self' 'unsafe-inline'` to `style-src 'self'` and added `style-src-attr 'none'`.
- Extended CSP tests to scan all EJS views for inline style attributes.

### Verification

- Source scan found no app view `style=` attributes, unsafe script sinks, or JS `element.style` usage in the checked browser paths.
- `node --test tests/security/csp.test.js tests/ui/tooltips.test.js tests/ui/destructive-actions.test.js tests/ui/form-pending-states.test.js` passed.

## Script CSP Implementation

- Status: Completed
- Started: 2026-07-02T06:47:00+08:00
- Completed: 2026-07-02T07:34:11+08:00

### Results

- Moved shared browser behavior from EJS inline scripts into `apps/web/public/js/app.js`.
- Added the static JS bundle to both main and auth layouts.
- Replaced inline `onchange` behavior with delegated `data-auto-submit` handling.
- Replaced repository branch `innerHTML` option resets with DOM-created nodes.
- Added per-request CSP nonces for the early theme bootstrap.
- Enabled Helmet CSP enforcement for scripts with `script-src 'self'` plus the request nonce.
- Initially left `style-src 'unsafe-inline'` as a documented temporary allowance until inline style attributes were moved into CSS; this was removed in the follow-up inline style CSP pass.
- Added CSP regression coverage and updated source-level UI tests to assert behavior in the static JS asset.
- Updated today's remediation checklist and the comprehensive analysis report.

### Verification

- `node --test tests/security/csp.test.js tests/ui/theme-persistence.test.js tests/ui/mobile-sidebar.test.js tests/ui/form-pending-states.test.js tests/ui/confirmation-modal.test.js tests/ui/tooltips.test.js tests/deployment/live-progress-sse.test.js tests/deployment/log-viewer-safety.test.js tests/ui/deployment-timeline.test.js` passed.
- `node --test tests/ui/accessibility-pass.test.js tests/ui/destructive-actions.test.js tests/ui/scroll-top.test.js` passed.
- `npm run lint` passed.
- `npm test` passed: 472 tests, 0 failures.
- `npm run format:check` passed.

## Web App P0 Tenant-Isolation Remediation

- Status: Completed
- Started: 2026-07-02T06:31:00+08:00
- Completed: 2026-07-02T06:40:31+08:00

### Results

- Scoped deployment cancel and retry mutations to the authorized route project.
- Scoped custom-domain verification and removal mutations to the authorized route project.
- Added regression coverage for deployment and domain project isolation.
- Fixed the existing `no-regex-spaces` lint issue in the live progress SSE test.
- Updated today's remediation checklist, the web app analysis report, and the phase tracker.

### Verification

- `node --test tests/deployment/cancel-retry-flow.test.js tests/domain/domain-isolation.test.js tests/deployment/live-progress-sse.test.js` passed.
- `npm run lint` passed.
- `npm test` passed: 465 tests, 0 failures.
- `npm run format:check` passed.

## CSP Migration Prep

- Status: Completed
- Started: 2026-07-02T06:41:00+08:00
- Completed: 2026-07-02T06:43:00+08:00

### Results

- Inventoried current inline script and inline handler blockers for CSP.
- Identified reusable scripts that should move into static JS.
- Identified one inline event handler and repository `innerHTML` assignments to remove before CSP enforcement.
- Queued the CSP migration order in today's remediation checklist.

### Verification

- Source scan used `rg -n "<script|on[a-z]+=" apps/web/src/views apps/web/public`.
- Sink scan used `rg -n "javascript:|innerHTML|insertAdjacentHTML|document\\.write|eval\\(|new Function" apps/web/src/views apps/web/public apps/web/src`.

## Efficiency And UX Follow-Up Pass

- Status: Completed
- Started: 2026-07-02T06:43:00+08:00
- Completed: 2026-07-02T06:47:00+08:00

### Results

- Reviewed project membership, deployment, domain, and audit event model indexes.
- Confirmed membership, deployment, and domain indexes already cover the reviewed high-traffic paths.
- Added audit event compound indexes for `outcome`, `targetType`, and `targetId` filters with `createdAt` sort support.
- Added source-level regression coverage for the high-traffic model indexes.
- Queued SSE stream cap/reconnect UX and operational error-copy follow-ups in today's remediation checklist.

### Verification

- `node --test tests/operations/database-indexes.test.js` passed.
- `npm run lint` passed.
- `npm test` passed: 469 tests, 0 failures.
- `npm run format:check` passed.

## P8-07 Live Progress Verification

- Status: Completed
- Started: 2026-07-02T00:18:00+08:00
- Completed: 2026-07-02T00:18:59+08:00

### Checklist

- [x] Verify deployment log SSE response headers.
- [x] Verify existing and new SSE log events use redacted messages.
- [x] Verify terminal status and timeout events are handled.
- [x] Verify browser client uses EventSource and safe DOM updates.
- [x] Add focused regression coverage.
- [x] Update phase tracker evidence.

### Results

- Added `tests/deployment/live-progress-sse.test.js`.
- Confirmed existing log safety and timeline tests cover safe rendering around live progress.
- Updated P8-07 in `docs/PHASE_TASK_TRACKER.md`.

### Verification

- Passed `node --test tests/deployment/live-progress-sse.test.js tests/deployment/log-viewer-safety.test.js tests/ui/deployment-timeline.test.js`.

## P8-06 Deployment Notification Verification

- Status: Partial
- Started: 2026-07-02T00:15:00+08:00
- Completed: 2026-07-02T00:16:59+08:00

### Checklist

- [x] Verify deployment notification email composition locally.
- [x] Escape HTML interpolated into notification bodies.
- [x] Verify activation and rollback workers invoke deployment notifications.
- [x] Verify notification failures remain nonblocking.
- [x] Add focused regression coverage.
- [x] Update phase tracker evidence.
- [ ] Verify configured provider delivery end to end. _(2026-07-04: automated send was blocked by the agent-environment safety policy for external email; a ready-to-run script composes a real notification via `buildDeploymentNotificationEmail` and sends through the configured Resend key — run `node send-resend-e2e.mjs` from the session scratchpad or replicate per `docs/phases/phase-8-worklog-verifications.md`, then check the inbox and Resend dashboard.)_

### Results

- Added `escapeNotificationHtml` and `buildDeploymentNotificationEmail` in `apps/worker/src/notification/deployment-notification.js`.
- Updated notification sending to use the escaped email builder.
- Added `tests/deployment/deployment-notification.test.js`.
- Kept P8-06 `Partial` because real provider delivery still needs an end-to-end environment check.

### Verification

- Passed `node --test tests/deployment/deployment-notification.test.js`.

## P8-05 Rollback Verification

- Status: Completed
- Started: 2026-07-02T00:12:00+08:00
- Completed: 2026-07-02T00:13:54+08:00

### Checklist

- [x] Verify rollback targets are retained healthy deployments.
- [x] Verify current active deployment is excluded from rollback targets.
- [x] Verify rollback targets require an available image.
- [x] Verify rollback queue payload includes project, rollback deployment, and source deployment IDs.
- [x] Add focused regression coverage.
- [x] Update phase tracker evidence.

### Results

- Added rollback helper functions in `apps/web/src/services/deployment.service.js`.
- Added `tests/deployment/rollback-flow.test.js`.
- Updated P8-05 in `docs/PHASE_TASK_TRACKER.md`.

### Verification

- Passed `node --test tests/deployment/rollback-flow.test.js tests/deployment/cancel-retry-flow.test.js tests/deployment/deployment-options.test.js`.

## P8-04 Cancel And Retry Verification

- Status: Completed
- Started: 2026-07-02T00:09:40+08:00
- Completed: 2026-07-02T00:11:00+08:00

### Checklist

- [x] Make retryable deployment status checks explicit.
- [x] Verify retry is limited to failed and cancelled deployments.
- [x] Verify retry payloads use the original deployment commit and cache behavior.
- [x] Verify cancellation remains guarded by active deployment states.
- [x] Verify UI shows cancel/retry actions only for matching states.
- [x] Add focused regression coverage.
- [x] Update phase tracker evidence.

### Results

- Added `isRetryableDeploymentStatus` in `apps/web/src/services/deployment.service.js`.
- Added `tests/deployment/cancel-retry-flow.test.js`.
- Updated P8-04 in `docs/PHASE_TASK_TRACKER.md`.

### Verification

- Passed `node --test tests/deployment/cancel-retry-flow.test.js tests/deployment/deployment-options.test.js tests/ui/destructive-actions.test.js`.

## P8-03 Deployment Log Viewer Safety

- Status: Completed
- Started: 2026-07-02T00:07:30+08:00
- Completed: 2026-07-02T00:08:42+08:00

### Checklist

- [x] Verify worker deployment events are stored through log redaction.
- [x] Verify SSE log payloads use `messageRedacted`.
- [x] Verify server-rendered logs use escaped redacted messages.
- [x] Verify live log appends use DOM text nodes instead of HTML injection.
- [x] Add focused regression coverage.
- [x] Update phase tracker evidence.

### Results

- Added `tests/deployment/log-viewer-safety.test.js`.
- Confirmed existing redaction and deployment timeline tests cover secret redaction and safe live rendering.
- Updated P8-03 in `docs/PHASE_TASK_TRACKER.md`.

### Verification

- Passed `node --test tests/deployment/log-viewer-safety.test.js tests/security/redaction.test.js tests/ui/deployment-timeline.test.js`.

## P8-02 Deployment Timeline Verification

- Status: Completed
- Started: 2026-07-02T00:06:30+08:00
- Completed: 2026-07-02T00:06:51+08:00

### Checklist

- [x] Verify deployment timeline static coverage.
- [x] Confirm stage display includes normalized stage state behavior.
- [x] Update phase tracker evidence.

### Results

- Confirmed existing `tests/ui/deployment-timeline.test.js` covers timeline stage normalization, state hooks, safe log rendering, and CSS coverage.
- Updated P8-02 in `docs/PHASE_TASK_TRACKER.md`.

### Verification

- Passed `node --test tests/ui/deployment-timeline.test.js`.

## P8-01 Deployment Option Verification

- Status: Partial
- Started: 2026-07-02T00:02:00+08:00
- Completed: 2026-07-02T00:05:17+08:00

### Checklist

- [x] Verify no-cache request parsing.
- [x] Verify latest-commit deployment job payload shape.
- [x] Verify retry/current-commit payload uses the original deployment commit.
- [x] Keep deployment controller parsing aligned with the shared helper.
- [x] Add focused regression coverage.
- [x] Update phase tracker evidence.
- [x] Verify or implement a selected-commit deployment path. _(2026-07-04: implemented — `createDeployment` accepts a validated 40-hex `commitSha` override (normalized to lowercase, `errorField`-scoped validation error), the deployments page gained a "Deploy a Specific Commit" card with inline error + sticky value, and the worker's exact-SHA clone needed no changes. Verified live: malformed SHA → inline error; valid SHA → QUEUED deployment + BullMQ payload carrying the chosen commit. Evidence in `docs/phases/phase-9-selected-commit-deploys.md`.)_
- [x] Run browser or integration evidence for all deployment options. _(2026-07-04: driven live against the dev harness — deploy form renders both variants (hidden `noCache=true` on the no-cache form); POST deploy-latest produced a BullMQ payload with `noCache: false` and the repository's `lastCommitSha`; the no-cache POST produced `noCache: true`; retry of a FAILED deployment created a new QUEUED deployment reusing the original commit with `noCache: false`. Evidence in `docs/phases/phase-8-worklog-verifications.md`.)_

### Results

- Added `parseNoCacheFlag` and `buildDeploymentJobPayload` helpers in `apps/web/src/services/deployment.service.js`.
- Updated `apps/web/src/controllers/deployment.controller.js` to use the shared no-cache parser.
- Added `tests/deployment/deployment-options.test.js`.
- Confirmed that deploy-latest/no-cache and retry/current-commit payloads are locally covered.
- Recorded the remaining gap: there is no dedicated selected-commit deploy path in the current service/UI.

### Verification

- Passed `node --test tests/deployment/deployment-options.test.js tests/deployment/create-deployment-guards.test.js tests/github/webhook-push.test.js`.

## UX-13 Accessibility Pass

- Status: Completed
- Started: 2026-07-01T23:58:00+08:00
- Completed: 2026-07-02T00:01:30+08:00

### Checklist

- [x] Review keyboard and ARIA contracts for updated shared components.
- [x] Fix critical accessibility issues found during the pass.
- [x] Record findings and residual risk in a dedicated markdown report.
- [x] Link the report from the documentation index.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Added explicit `type="button"` to header icon buttons.
- Replaced the form error summary warning glyph with the shared decorative icon partial.
- Added accessible labels to status badges so focused badges include visible status and tooltip context.
- Added `docs/UI_UX_ACCESSIBILITY_PASS.md` and linked it from `docs/README.md`.
- Added `tests/ui/accessibility-pass.test.js`.

### Verification

- Passed `node --test tests/ui/accessibility-pass.test.js tests/ui/confirmation-modal.test.js tests/ui/mobile-sidebar.test.js tests/ui/tooltips.test.js tests/ui/scroll-top.test.js tests/ui/theme-persistence.test.js tests/ui/icon-consistency.test.js tests/ui/form-pending-states.test.js`.

## UX-12 Form Pending States

- Status: Completed
- Started: 2026-07-01T23:54:00+08:00
- Completed: 2026-07-01T23:57:56+08:00

### Checklist

- [x] Add a shared form submit-pending handler.
- [x] Prevent duplicate submissions after a valid submit event.
- [x] Mark submitting forms busy for assistive technology.
- [x] Disable submit buttons while the request is in progress.
- [x] Add action-specific pending labels to high-value forms.
- [x] Remove duplicate one-off auth submit scripts.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Extended `apps/web/src/views/partials/footer.ejs` with a generic pending-state submit handler.
- Added `.form--pending` styling in `apps/web/public/css/components.css`.
- Added `data-pending-label` coverage for auth, deployment, repository, domain, detection, environment, quota, and admin queue actions.
- Removed older per-page auth submit-disable scripts in favor of the shared handler.
- Added `tests/ui/form-pending-states.test.js` and updated destructive-action coverage for the shared form guard.

### Verification

- Passed `node --test tests/ui/form-pending-states.test.js tests/ui/confirmation-modal.test.js tests/ui/destructive-actions.test.js`.

## UX-11 Icon Consistency

- Status: Completed
- Started: 2026-07-01T23:49:00+08:00
- Completed: 2026-07-01T23:53:29+08:00

### Checklist

- [x] Add a shared inline SVG icon partial.
- [x] Replace sidebar navigation glyphs with named icons.
- [x] Replace high-visibility symbolic controls with shared icons.
- [x] Keep icons decorative where text already provides the accessible name.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Added `apps/web/src/views/partials/icon.ejs` and shared `.ui-icon` styling.
- Replaced ad hoc sidebar, theme toggle, scroll-to-top, external-link, flash, password-toggle, empty-state, and landing feature glyphs.
- Removed pagination arrow glyphs from repeated table pagination controls.
- Added `tests/ui/icon-consistency.test.js`.

### Verification

- Passed `node --test tests/ui/icon-consistency.test.js tests/ui/tooltips.test.js tests/ui/scroll-top.test.js tests/ui/guided-empty-states.test.js tests/ui/theme-persistence.test.js`.

## UX-10 Theme Persistence Polish

- Status: Completed
- Started: 2026-07-01T23:45:00+08:00
- Completed: 2026-07-01T23:48:06+08:00

### Checklist

- [x] Centralize theme bootstrap for main and auth layouts.
- [x] Preserve stored light/dark preference before stylesheets load.
- [x] Respect system dark preference when no stored preference exists.
- [x] Sync browser `theme-color` and native `color-scheme`.
- [x] Keep theme toggle label, tooltip, and pressed state aligned with the active theme.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Consolidated theme persistence in `apps/web/src/views/partials/head.ejs`.
- Removed duplicate pre-HTML auth layout theme script from `apps/web/src/views/layouts/auth.ejs`.
- Updated `apps/web/src/views/partials/header.ejs` so the theme toggle reflects the active state and persists explicit user selection through the shared helper.
- Added color-scheme tokens and active toggle styling in `apps/web/public/css/tokens.css` and `apps/web/public/css/layout.css`.
- Added `tests/ui/theme-persistence.test.js` and updated the tooltip expectation for the dynamic theme toggle label.

### Verification

- Passed `node --test tests/ui/theme-persistence.test.js tests/ui/tooltips.test.js`.

## UX-09 Destructive Action Consistency

- Status: Completed
- Started: 2026-07-01T23:42:50+08:00
- Completed: 2026-07-01T23:44:58+08:00

### Checklist

- [x] Add severity-aware confirmation modal metadata.
- [x] Add pending/disabled state for confirmed risky submissions.
- [x] Style warning and success button variants already used by risky controls.
- [x] Standardize confirm copy, titles, accept labels, and severity on project risky actions.
- [x] Standardize confirm copy, titles, accept labels, and severity on admin risky actions.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Extended `apps/web/src/views/partials/footer.ejs` so `data-confirm` actions can define title, severity, accept label, and pending copy.
- Added shared warning/success button styling and severity-specific confirmation modal eyebrow styling in `apps/web/public/css/components.css`.
- Updated archive, suspend, delete, disconnect, rollback, cancel, queue, member, and domain review actions with consistent safety copy.
- Added `tests/ui/destructive-actions.test.js` and expanded `tests/ui/confirmation-modal.test.js`.

### Verification

- Passed `node --test tests/ui/confirmation-modal.test.js tests/ui/destructive-actions.test.js`.

## UX-08 Guided Empty States

- Status: Completed
- Started: 2026-07-01T23:38:16+08:00
- Completed: 2026-07-01T23:38:16+08:00

### Checklist

- [x] Add shared empty-state step and action styling.
- [x] Guide first-time users through project creation, repository connection, detection, secrets, and deployment.
- [x] Guide optional setup states for custom domains and project overview cards.
- [x] Add useful admin empty-state actions for queues and filtered results.
- [x] Keep guidance limited to empty paths.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Added `.empty-state__steps` and `.empty-state__actions` in `apps/web/public/css/components.css`.
- Updated project, repository, detection, deployment, environment, domain, dashboard, and admin empty states with concise next-step flows.
- Added `tests/ui/guided-empty-states.test.js` for shared styling and key guided empty-state coverage.

### Verification

- Passed `npm run format:check`, `npm run lint`, `git diff --check`, and focused UI tests for confirmation modal, mobile sidebar, tooltips, floating labels, scroll-to-top, responsive tables, deployment timeline, and guided empty states.

## UX-07 Deployment Timeline Clarity

- Status: Completed
- Started: 2026-07-01T23:33:20+08:00
- Completed: 2026-07-01T23:33:20+08:00

### Checklist

- [x] Fix timeline state class names so visual states render correctly.
- [x] Normalize deployment statuses and worker event stages.
- [x] Show per-stage status, latest message, and timestamp.
- [x] Highlight the failed stage before users need to inspect raw logs.
- [x] Keep live log updates synchronized with the timeline.
- [x] Avoid injecting live log messages as HTML.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Reworked the deployment detail timeline in `apps/web/src/views/pages/projects/deployment-detail.ejs`.
- Replaced the old dot-only timeline CSS with responsive stage summary cards in `apps/web/public/css/components.css`.
- Updated live deployment log handling to safely append text nodes and refresh the active timeline stage.
- Added `tests/ui/deployment-timeline.test.js` for timeline stage normalization, state hooks, safe log rendering, and CSS coverage.

### Verification

- Passed `npm run format:check`, `npm run lint`, `git diff --check`, and focused UI tests for confirmation modal, mobile sidebar, tooltips, floating labels, scroll-to-top, responsive tables, and deployment timeline.

## UX-06 Responsive Tables

- Status: Completed
- Started: 2026-07-01T23:28:53+08:00
- Completed: 2026-07-01T23:28:53+08:00

### Checklist

- [x] Add shared responsive table styles.
- [x] Convert admin operational tables to mobile row summaries.
- [x] Convert project operational tables to mobile row summaries.
- [x] Preserve desktop table layout.
- [x] Keep compact legal/static tables unchanged.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Added `.table-responsive`, `.table-responsive--flush`, and `.table--responsive` mobile styles in `apps/web/public/css/components.css`.
- Added `data-label` row summary labels to key admin and project tables.
- Removed inline flush wrapper styles from dashboard/member tables in favor of shared classes.
- Added `tests/ui/responsive-tables.test.js` for CSS, admin table, and project table coverage.

### Verification

- Passed `npm run format:check`, `npm run lint`, `git diff --check`, and focused UI tests for confirmation modal, mobile sidebar, tooltips, floating labels, scroll-to-top, and responsive tables.

## UX-05 Floating Scroll-To-Top Button

- Status: Completed
- Started: 2026-07-01T23:19:41+08:00
- Completed: 2026-07-01T23:19:41+08:00

### Checklist

- [x] Add a shared floating scroll-to-top button.
- [x] Show it only after the user scrolls down.
- [x] Keep the control keyboard accessible and tooltip-enabled.
- [x] Respect `prefers-reduced-motion`.
- [x] Avoid covering primary content on small screens.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Added shared scroll-to-top markup and behavior in `apps/web/src/views/partials/footer.ejs`.
- Added responsive fixed-position styling in `apps/web/public/css/components.css`.
- Added `tests/ui/scroll-top.test.js` for markup, scroll behavior, reduced-motion behavior, and CSS coverage.

### Verification

- Passed `npm run format:check`, `npm run lint`, `git diff --check`, and focused UI tests for confirmation modal, mobile sidebar, tooltips, floating labels, and scroll-to-top.

## UX-04 Floating Labels

- Status: Completed
- Started: 2026-07-01T23:08:24+08:00
- Completed: 2026-07-01T23:08:24+08:00

### Checklist

- [x] Add a scoped floating-label pattern for main form fields.
- [x] Preserve hints, errors, required state, autocomplete, and password visibility behavior.
- [x] Apply floating labels to auth, project, admin, quota, domain, environment, repository, and member forms.
- [x] Leave compact filters and inline table controls unchanged.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Added `form-field--floating` and `form-group--floating` CSS in `apps/web/public/css/components.css`.
- Updated reusable form partials in `apps/web/src/views/partials/form-field.ejs` and `apps/web/src/views/partials/password-field.ejs`.
- Applied floating labels to core hand-written forms across project and admin pages.
- Added `tests/ui/floating-labels.test.js` for floating-label style, partial, and page coverage.

### Verification

- Passed `npm run format:check`, `npm run lint`, `git diff --check`, and focused UI tests for confirmation modal, mobile sidebar, tooltips, and floating labels.

## UX-03 Accessible Tooltips

- Status: Completed
- Started: 2026-07-01T22:58:46+08:00
- Completed: 2026-07-01T22:58:46+08:00

### Checklist

- [x] Add a shared tooltip behavior for `data-tooltip` targets.
- [x] Support mouse hover and keyboard focus.
- [x] Avoid relying on native `title` attributes.
- [x] Add tooltips to high-value header, status, admin, deployment, domain, and quota controls.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Added shared tooltip popover behavior in `apps/web/src/views/partials/footer.ejs`.
- Added tooltip styling in `apps/web/public/css/components.css`.
- Added tooltip hints to header controls, status badges, admin server controls, deployment actions, domain actions, audit export, and quota fields.
- Added `tests/ui/tooltips.test.js` to cover tooltip markup, behavior hooks, styling, and high-value target coverage.

### Verification

- Passed `npm run format:check`, `npm run lint`, `git diff --check`, and `node --test tests/ui/tooltips.test.js`.
- Full `node --test --test-reporter=dot tests/**/*.test.js` is blocked by unrelated installer tests whose child process stdout is empty under the current `node:test` sandbox.

## UX-02 Mobile Sidebar Drawer

- Status: Completed
- Started: 2026-07-01T20:48:46+08:00
- Completed: 2026-07-01T20:48:46+08:00

### Checklist

- [x] Fix mobile sidebar initialization so it runs after sidebar markup exists.
- [x] Add a real mobile sidebar backdrop.
- [x] Add Escape close, backdrop close, nav-link close, focus trapping, and body scroll lock.
- [x] Improve hamburger toggle contrast and open state.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Added `#sidebar-backdrop` to the main layout next to the sidebar.
- Updated `apps/web/src/views/partials/header.ejs` so sidebar drawer behavior initializes after `DOMContentLoaded`.
- Updated `apps/web/public/css/layout.css` so the mobile sidebar drawer displays correctly, locks scroll, and uses a proper backdrop.
- Added `tests/ui/mobile-sidebar.test.js` to cover drawer markup, initialization timing, accessibility behavior, and mobile CSS.

## UX-01 Custom Confirmation Modal

- Status: Completed
- Started: 2026-07-01T20:38:24+08:00
- Completed: 2026-07-01T20:38:24+08:00

### Checklist

- [x] Replace browser-default confirmation behavior for existing `data-confirm` actions.
- [x] Support both confirmable forms and links.
- [x] Add accessible modal markup, focus handling, Escape close, backdrop close, and focus restoration.
- [x] Add shared modal styling.
- [x] Add focused regression coverage.
- [x] Update UI/UX backlog and phase tracker evidence.

### Results

- Replaced the old inline confirmation bar in `apps/web/src/views/partials/footer.ejs` with a shared modal dialog.
- Added link and form handling for existing `data-confirm` attributes without broad template rewrites.
- Added modal styling in `apps/web/public/css/components.css`.
- Added `tests/ui/confirmation-modal.test.js` to verify modal markup, form/link support, and removal of browser-default confirmation usage.

## UI/UX Improvement Backlog

- Status: Completed
- Started: 2026-07-01T20:30:11+08:00
- Completed: 2026-07-01T20:30:11+08:00

### Checklist

- [x] Create a dedicated markdown backlog for UI/UX improvements.
- [x] Organize planned work by priority, area, status, implementation notes, and acceptance evidence.
- [x] Link the backlog from the documentation index.
- [x] Cross-reference the backlog from the phase task tracker.
- [x] Document update rules for future UI/UX implementation passes.

### Results

- Added `docs/UI_UX_IMPROVEMENT_BACKLOG.md` for planned usability, efficiency, confirmation, tooltip, floating-label, scroll-to-top, responsive, theme, and accessibility work.
- Linked the backlog from `docs/README.md`.
- Updated `docs/PHASE_TASK_TRACKER.md` so future UI/UX implementation changes keep the backlog aligned.

## Phase Task Tracker

- Status: Completed
- Started: 2026-07-01T18:50:24+08:00
- Completed: 2026-07-01T18:50:24+08:00

### Checklist

- [x] Create a dedicated markdown tracker for remaining phase tasks.
- [x] Organize remaining work by phase and status.
- [x] Link the tracker from the documentation index.
- [x] Document update rules for future implementation passes.

### Results

- Added `docs/PHASE_TASK_TRACKER.md` as the active checklist for remaining implementation and target-host validation work.
- Linked the tracker from `docs/README.md`.
- Recorded that future implementation work should update tracker status, acceptance evidence, and timestamps before commit and push.

## Markdown Maintenance Audit

- Status: Completed
- Started: 2026-07-01T18:39:27+08:00
- Completed: 2026-07-01T18:39:27+08:00

### Checklist

- [x] Add a documentation index under `docs/`.
- [x] Reconcile P9-P12 implementation status in the phase blueprint.
- [x] Clarify known remaining operational validation work.
- [x] Reconcile the older P2 `/health` checklist item with later P3 integration smoke results.
- [x] Keep root README concise and point to the documentation index.

### Results

- Added `docs/README.md` as the canonical documentation map.
- Updated the P9-P12 phase checklist to use explicit status labels instead of stale unchecked boxes.
- Updated the P9-P12 maintenance summary with current known remaining work.
- Reconciled the P2 `/health` checklist item by referencing the later P3 real local integration smoke result.

## P12 Distribution and Self-Hosted Edition

- Status: Completed
- Started: 2026-07-01T18:17:24+08:00
- Completed: 2026-07-01T18:19:44+08:00

### Plan

- Review installer, preflight, setup, backup, restore, upgrade, and uninstall scripts for environment assumptions and documented Ubuntu 22.04/24.04 support.
- Add a non-mutating administrator setup wizard that can generate an install checklist and required environment variable template without embedding credentials.
- Document self-hosted install modes: local-only, public-IP, and Cloudflare Tunnel.
- Document the MIT license selection already present in `LICENSE`.
- Add tests for setup wizard output and distribution-safe defaults.
- Run final verification commands, then commit and push.

### Checklist

- [x] Add markdown plan before implementation.
- [x] Add setup wizard and distribution documentation.
- [x] Verify installer/preflight coverage and license documentation.
- [x] Add focused distribution tests.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Added `scripts/self-hosted-checklist.js` for non-mutating local-only, public-IP, and Cloudflare Tunnel install planning.
- Added `docs/SELF_HOSTED_INSTALL.md` covering supported Ubuntu versions, install modes, required environment keys, clean install steps, backup/restore commands, and MIT license reference.
- Linked the self-hosted install guide from `README.md`.
- Added focused tests for setup checklist defaults, Ubuntu support, required secret keys, public-IP mode, and fallback behavior.
- Confirmed the existing `LICENSE` is MIT.
- Ran `node scripts/self-hosted-checklist.js --mode cloudflare_tunnel --domain hellodeploy.example.com --json`, `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## P11 Hardening and Pilot

- Status: Completed
- Started: 2026-07-01T18:14:59+08:00
- Completed: 2026-07-01T18:16:44+08:00

### Plan

- Add a repeatable capacity measurement script that records host, queue, and local HTTP measurements without requiring Docker mutation by default.
- Document failure-recovery checks for MongoDB, Redis, Docker, Nginx, worker, and Cloudflare Tunnel with pass/blocker status.
- Document measured operating thresholds and remaining pilot constraints from available local checks.
- Add a noncritical pilot deployment checklist that proves a user can complete deployment without administrator terminal work.
- Keep existing security tests as the blocking gate and avoid claiming unmeasured capacity.
- Add focused tests for the new measurement/reporting helpers.
- Run final verification commands, then commit and push before moving to P12.

### Checklist

- [x] Add markdown plan before implementation.
- [x] Add repeatable capacity/failure-recovery measurement tooling.
- [x] Document measured thresholds, recovery checks, and pilot checklist.
- [x] Add focused hardening/pilot tests.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Added `scripts/measure-capacity.js` for non-destructive host snapshots and optional local HTTP sampling.
- Captured a local host snapshot: 8 CPU cores, 31% memory used, 5% workspace filesystem used, and 894.1 GB free on the workspace filesystem.
- Added `docs/HARDENING_AND_PILOT_REPORT.md` with conservative pilot thresholds, failure-recovery checklist status, and a noncritical pilot deployment checklist.
- Documented that host-level MongoDB, Redis, Docker, Nginx, worker, and Cloudflare Tunnel recovery tests still require service control on the target host.
- Added focused tests for capacity helper clamping and latency summaries.
- Ran `node scripts/measure-capacity.js --json`, targeted operations tests, `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## P10 Administration and Operations

- Status: Completed
- Started: 2026-07-01T18:07:46+08:00
- Completed: 2026-07-01T18:14:20+08:00

### Plan

- Complete the admin operations surface by hardening server capacity display, queue controls, and maintenance-mode controls.
- Add neutral suspension/maintenance routing behavior where the worker already owns Nginx changes.
- Improve quota override visibility and validation so Super Admins can safely edit limits and see consumption context.
- Add audit export support with explicit privileged-action handling.
- Add inactivity reporting and operational alert scaffolding without sending secrets or inventing deferred billing/multi-server behavior.
- Add cleanup safeguards so active and retained release assets are protected.
- Add incident, backup, restore, and upgrade runbooks for routine operations.
- Tighten responsive admin layouts and theme persistence where existing CSS/templates are incomplete.
- Run final verification commands, then commit and push before moving to P11.

### Checklist

- [x] Add markdown plan before implementation.
- [x] Complete admin operations controls and maintenance mode.
- [x] Add audit export, inactivity reporting, and quota consumption visibility.
- [x] Add cleanup safeguards and operations runbooks.
- [x] Tighten responsive admin/theme behavior where needed.
- [x] Add focused administration and operations tests.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Added database-backed maintenance mode with Super Admin controls on `/admin/server`.
- Maintenance mode now blocks non-Super-Admin mutating requests while allowing safe read-only requests and maintenance control paths.
- Added filtered audit CSV export and an audit event for export activity.
- Hardened quota override parsing/validation and updated the quota view to show stored root quota fields plus user/project consumption context.
- Added cleanup safeguards so release cleanup skips deployments still referenced as a project's active deployment.
- Added `docs/OPERATIONS_RUNBOOKS.md` covering incident response, backup, restore, upgrade, rollback, and uninstall operations.
- Added focused tests for maintenance-mode request gating and cleanup active-deployment protection.
- Ran targeted admin tests, `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## P9 Custom Domains

- Status: Completed
- Started: 2026-07-01T18:03:54+08:00
- Completed: 2026-07-01T18:06:49+08:00

### Plan

- Harden custom-domain registration so normalized hostnames cannot be claimed by more than one active project and previously removed domains can be safely reclaimed.
- Keep ownership verification token values one-time only, store only token hashes, and show provider-neutral DNS instructions to project owners.
- Ensure only verified domains can enter admin approval and only admin-approved domains can request route activation.
- Tighten worker route activation/removal behavior so custom-domain routing is never marked active unless Nginx route activation succeeds when Nginx is enabled.
- Add focused tests for normalization, uniqueness, verification job state transitions, admin approval route enqueueing, and activation failure handling.
- Run final verification commands, then commit and push before moving to P10.

### Checklist

- [x] Add markdown plan before implementation.
- [x] Harden domain service and worker route activation behavior.
- [x] Update domain UI/docs where needed for provider-neutral instructions and status clarity.
- [x] Add focused custom-domain tests.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Admin approval now records the approval and queues route activation without marking the domain active early.
- The worker now marks a custom domain `ACTIVE` only after custom-domain Nginx route activation succeeds while Nginx is enabled.
- Custom-domain route filenames now use stable hash-based slugs, avoiding invalid filename labels for long valid hostnames.
- Activation failures leave the domain non-active and bubble the worker error for retry/failure handling.
- Added focused worker job tests for DNS verification, activation success, activation failure, and unapproved activation attempts.
- Ran targeted domain/Nginx tests, `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## P8 Deployment Approval + Mode Guard Hardening

- Status: Completed
- Started: 2026-07-01T12:26:32+08:00
- Completed: 2026-07-01T12:27:49+08:00

### Plan

- Harden `createDeployment` as the final service-level deployment gate so controller or webhook mistakes cannot bypass project approval requirements.
- Enforce project lifecycle eligibility before repository/runtime/job work:
  - Block deployments unless the project status is `ACTIVE`.
  - Block deployments while the project deployment mode is `APPROVAL_REQUIRED`.
  - Continue allowing active projects in `MANUAL` or `AUTOMATIC` mode to proceed through the existing deployment validation path.
- Keep the change scoped to deployment creation; retry and rollback flows will remain unchanged unless verification exposes a direct bypass tied to this task.
- Add focused tests for the deployment eligibility guard:
  - Draft projects are blocked.
  - Suspended projects are blocked.
  - Archived projects are blocked.
  - Active projects in approval-required mode are blocked.
  - Active projects in manual or automatic mode are allowed by the new guard.
- Run formatting, lint, format check, and the full test suite.
- Update this worklog with completion timestamp and results, then commit and push after completion.

### Checklist

- [x] Add markdown plan before implementation.
- [x] Enforce project status and deployment mode in deployment creation.
- [x] Add focused deployment guard tests.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Added `validateProjectDeploymentEligibility` and wired it into `createDeployment` before repository/runtime/job checks.
- Deployments are now blocked unless the project is `ACTIVE`.
- Deployments are now blocked while the project mode is `APPROVAL_REQUIRED`.
- Active projects in `MANUAL` and `AUTOMATIC` mode continue through the existing deployment validation path.
- Added focused tests for draft, suspended, archived, approval-required, manual, and automatic guard behavior.
- Ran `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## Worklog and Push Policy

- Status: Completed
- Started: 2026-06-30T20:47:44+08:00
- Completed: 2026-06-30T20:47:44+08:00

### Rule

- Before any implementation, create or update a markdown worklog entry for the priority, phase, or task.
- Each worklog entry must include started and completed timestamps.
- When a priority, phase, or task is completed, run the relevant verification, commit the completed work, and push it to the remote.

## P3 MongoDB Connection Check

- Status: Completed
- Started: 2026-06-30T21:01:49+08:00
- Completed: 2026-06-30T21:02:34+08:00

### Checklist

- [x] Test MongoDB connection using the project's configured environment.
- [x] Record the result without exposing credentials.
- [x] Run verification for the documentation update.
- [x] Commit and push after completion.

### Result

- Initial sandboxed attempt could not resolve the MongoDB Atlas SRV record because network DNS access was blocked.
- Escalated credential-safe check succeeded with `readyState: 1`.
- Connected database: `hellodeploy_db`.
- Connected topology: `ReplicaSetWithPrimary`.

## P3 Real Local Integration Smoke

- Status: Completed
- Started: 2026-06-30T21:07:17+08:00
- Completed: 2026-06-30T21:11:50+08:00

### Checklist

- [x] Confirm configured MongoDB is reachable.
- [x] Confirm Redis availability.
- [x] Start the web process with the real `.env`.
- [x] Confirm `/health` responds from the running server.
- [x] Smoke-test public/auth pages against the running server.
- [x] Check worker startup path where local services permit.
- [x] Record blockers separately from passing checks.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- MongoDB check passed against the configured environment: database `hellodeploy_db`, topology `ReplicaSetWithPrimary`.
- Redis check passed against `127.0.0.1:6379` with `PONG`.
- Web process started with `npm run start -w @hellodeploy/web` and connected to MongoDB.
- `/health` returned `200 OK` with JSON status `ok`.
- HTTP smoke checks returned `200 OK` for `/`, `/auth/sign-in`, `/auth/create-account`, `/auth/forgot-password`, `/terms`, and `/privacy`.
- `/dashboard` returned the expected unauthenticated `302` redirect to `/auth/sign-in?returnTo=%2Fdashboard`.
- Worker process started with `npm run start -w @hellodeploy/worker`, connected to MongoDB and Redis, and reached `ready — listening for jobs`.
- Worker shut down cleanly on `SIGINT`.

### Notes

- Local socket probes require elevated tool access in this environment; sandboxed `curl` and Redis checks could not open localhost sockets.
- No browser automation dependency is installed in the repo, so this pass used real HTTP integration smoke checks rather than Playwright/Puppeteer rendering.
- `/auth/register` returned `404`; this is expected because the implemented registration route is `/auth/create-account`.

## P4 User Guide and FAQ

- Status: Completed
- Started: 2026-06-30T21:15:23+08:00
- Completed: 2026-06-30T21:17:29+08:00

### Checklist

- [x] Create a user guide for the main HelloDeploy usage flow.
- [x] Create an FAQ for users and project owners.
- [x] Add a root README that links to the user-facing docs.
- [x] Keep guidance aligned with current V1 scope and implemented routes.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Added `README.md` with links to user-facing and project documentation.
- Added `docs/USER_GUIDE.md` covering account setup, projects, GitHub connection, detection, environment variables, approval, deployment, rollback, roles, custom domains, limits, and troubleshooting.
- Added `docs/FAQ.md` covering common user, project, GitHub, deployment, configuration, domain, limit, and support questions.
- Ran `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## P5 Legal Policies

- Status: Completed
- Started: 2026-06-30T21:19:30+08:00
- Completed: 2026-06-30T21:26:39+08:00

### Checklist

- [x] Review existing public legal pages.
- [x] Add missing user-facing legal policy coverage.
- [x] Add markdown legal documents for repository review.
- [x] Link legal pages from the app and README.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Added public legal index at `/legal`.
- Added public Cookie Policy, Data Processing Terms, Copyright Policy, and Security Policy pages.
- Updated Terms and Privacy pages with expanded coverage and cross-links.
- Updated footer navigation and README links.
- Added `docs/LEGAL_POLICIES.md` for repository-level legal policy review.
- Smoke-tested `/legal`, `/cookies`, `/data-processing`, `/copyright`, and `/security`; all returned `200 OK`.
- Ran `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## P6 Legal UX Integration

- Status: Completed
- Started: 2026-06-30T22:44:00+08:00
- Completed: 2026-06-30T22:54:56+08:00

### Checklist

- [x] Update account creation consent wording for the legal policy bundle.
- [x] Update auth footer legal links.
- [x] Update user guide and FAQ legal references.
- [x] Smoke-test auth and legal pages.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Updated registration consent to link Terms, Privacy, Cookies, Acceptable Use, and Legal Policies.
- Updated shared auth footer to include Legal and Cookies links.
- Updated `docs/USER_GUIDE.md` and `docs/FAQ.md` with legal bundle references.
- Smoke-tested `/auth/create-account`, `/auth/sign-in`, `/auth/forgot-password`, `/auth/verify-email`, `/legal`, and `/cookies`; all returned `200 OK`.
- Confirmed rendered create-account page includes `acceptTerms`, Cookie Policy, Legal Policies, `/cookies`, and `/legal`.
- Ran `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## P7 GitHub Webhook Deployment Queue Integration

- Status: Completed
- Started: 2026-07-01T08:04:09+08:00
- Completed: 2026-07-01T08:05:58+08:00

### Plan

- Reuse `createDeployment` from the deployment service for automatic deployments instead of duplicating deployment record, queue, and audit logic.
- Keep webhook response behavior unchanged: validate signature/replay, return `200 OK` quickly, then process the event asynchronously.
- Preserve current push handling:
  - Ignore branch deletion pushes.
  - Ignore repositories not tracked by HelloDeploy.
  - Always update repository latest commit metadata for tracked repositories.
  - Ignore inactive, suspended, draft, or archived projects.
  - Ignore pushes to non-production branches.
  - Pause deployment for high-risk file changes and log the pause.
  - Do not deploy when the project is in manual mode.
- For `AUTOMATIC` mode on the production branch with safe changes:
  - Use `project.ownerId` as the actor because deployment records require `requestedBy`.
  - Call `createDeployment` with `triggerType: AUTOMATIC`, `projectId`, `actorId`, and webhook `correlationId`.
  - Log successful queueing with project ID, short commit SHA, and deployment ID.
  - Log failed queueing with project ID, short commit SHA, and the returned error; do not fail the already-acknowledged webhook response.
- Add focused tests for webhook push behavior using dependency injection around the push handler:
  - Automatic production-branch push creates one automatic deployment request.
  - Manual production-branch push updates commit metadata but does not create a deployment.
  - Non-production branch push updates commit metadata but does not create a deployment.
  - High-risk file changes do not create a deployment.
- Run final verification commands and push after completion.

### Checklist

- [x] Add markdown plan before implementation.
- [x] Wire automatic webhook push handling to `createDeployment`.
- [x] Add focused tests for automatic/manual/non-production/high-risk behavior.
- [x] Run final verification commands.
- [x] Commit and push after completion.

### Results

- Automatic production-branch push webhooks now call `createDeployment` with `triggerType: AUTOMATIC`.
- Manual mode, non-production branch pushes, and high-risk file changes do not queue deployments.
- Webhook commit metadata updates remain intact for tracked repositories.
- Added focused tests for automatic/manual/non-production/high-risk push behavior.
- Ran `npm run format`, `npm run lint`, `npm run format:check`, and `npm test`.

## P2 Browser Smoke Test

- Status: Completed
- Started: 2026-06-30T20:17:34+08:00
- Completed: 2026-06-30T20:28:41+08:00

### Checklist

- [x] Start the web app locally.
- [x] Confirm `/health` responds.
- [x] Smoke-test public pages.
- [x] Smoke-test authenticated/admin pages where local data permits.
- [x] Smoke-test project pages where local data permits.
- [x] Validate changed interactions where local data permits.
- [x] Run final verification commands.

### Findings

- Web startup could not complete because local MongoDB was unavailable at `127.0.0.1:27017`.
- Docker is installed, but this user cannot access `/var/run/docker.sock`, so temporary MongoDB/Redis containers were not available.
- Used direct EJS render smoke tests with mock admin/project data as a fallback.
- Found and fixed invalid partial include paths in admin/project/dashboard templates.
- Render smoke covered public landing/auth pages, admin pages, project pages, sidebar output, pagination markup, and `data-confirm` markup.

### Verification

- Direct EJS render smoke test passed for main changed public/admin/project templates.
- Direct EJS render smoke test passed for auth templates through the auth layout.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm test` passed.

### Reconciliation

- Later P3 real local integration smoke confirmed `/health` returned `200 OK` with JSON status `ok` against the configured environment.

## Batch 1 — Green Quality Baseline

- Status: In Review
- Started: 2026-07-12T05:39:00+08:00
- Verified: 2026-07-12T05:48:30+08:00
- Revision inspected: `0f8f8f3`

### Changes

- Added `.nvmrc` to select Node.js 22 for local NVM users.
- Aligned contributor and self-hosted installation guidance with Node.js 22, npm 10+, and reproducible `npm ci` installs.
- Added `docs/RELEASE_POLICY.md` defining `main` as the release branch, immutable annotated semantic-version tags, full-SHA deployment and rollback references, and clean-worktree release gates.

### Verification

- Installed and selected Node.js `v22.23.1` with npm `10.9.8`.
- `npm ci` passed: 314 packages installed and 324 audited.
- `package-lock.json` was unchanged before/after installation; SHA-256 remained `6363f11311bed8124fecefe42240d0ce5e85a43631456fcc20edde171a968b3e`.
- `npm run lint` passed.
- `npm run format:check` passed.
- `npm test` passed: 601 tests, 134 suites, 0 failures, 0 skipped.
- `npm audit --omit=dev --audit-level=moderate` passed with zero vulnerabilities.

### Remaining completion gates

- Review and commit the intended worktree changes so the release candidate is represented by a clean, reviewed commit.
- Confirm the Node.js 22 CI workflow passes on that commit.

## Autonomous Readiness Loop — Batches 2–5 Local Work

- Status: Blocked on external host and configuration evidence
- Verified: 2026-07-12T05:57:00+08:00

### Implemented

- Hardened Nginx route activation/removal transactions and added rollback tests for validation and reload failures.
- Moved the production routing-mode invariant into worker configuration validation and added valid/invalid fixture tests.
- Added dependency-aware `/ready` checks while preserving `/health` as liveness.
- Added bounded, idempotent web shutdown and idempotent worker cleanup for BullMQ, Redis, and MongoDB.
- Required immutable release references for upgrades, rejected dirty production checkouts, and retained full-SHA rollback references.

### Verification

- Focused configuration, routing, helper, privilege, readiness, shutdown, and upgrade-safety tests passed.
- Full Node.js 22 suite passed after the initial lifecycle work: 617 tests, 139 suites, 0 failures, 0 skipped.
- Lint, formatting, dependency audit, and diff checks passed.

### External blockers

- Review/commit and remote CI for the release candidate.
- Supported Ubuntu host validation for users, groups, systemd, helper socket, Nginx validation/reload, and route rollback.
- Production-equivalent GitHub App and routing configuration.
- Second-host encrypted backup/restore proof and real Docker-backed deployment/pilot testing.

### Backup integrity continuation

- Made failed or unavailable local `mongodump` fatal unless `--skip-database` explicitly acknowledges a separately verified external snapshot.
- Added non-interactive `HELLODEPLOY_DATABASE_BACKUP_MODE=external` support for upgrades using external snapshots.
- Added generated Nginx routes and platform ingress to backup artifacts.
- Added `CHECKSUMS.sha256` and versioned `manifest.json` with the full source commit.
- Made restore validate checksums before prompting or changing services, fail on database restore errors, restore routing state, and run `nginx -t` before restart.
- Final verification passed: 622 tests, 140 suites, 0 failures, 0 skipped; lint, formatting, audit, shell syntax, and diff checks also passed.

## Destructive Project Cleanup Hardening

- Status: Locally complete; real Docker proof remains part of Batch 6
- Implemented: 2026-07-12

### Changes

- Capture all project container IDs and unique image tags before deleting deployment records and send them in a validated version-2 deletion job payload.
- Preserve compatibility with version-1 jobs already waiting in Redis.
- Refuse permanent database deletion when infrastructure teardown cannot be queued.
- Remove all recorded containers, images, the per-project Docker network, and the Nginx route.
- Attempt every teardown action, then fail the job when resources remain so BullMQ retries it.
- Make Docker cleanup helpers report confirmed success/failure and bound managed-container JSON logs to three 10 MiB files.
- Implement age-bounded abandoned build-workspace cleanup under the configured build root, including symlink-safe deletion.

### Verification

- Final Node.js 22 suite passed: 630 tests, 143 suites, 0 failures, 0 skipped.
- Lint, formatting, production dependency audit, and diff checks passed.

## Installed-Host Verification Gate

- Status: Implemented locally; target-host execution remains required
- Implemented: 2026-07-12

### Changes

- Added a root-run verifier for web/worker identities, Docker/helper group isolation, `.env`, route-directory and helper-socket metadata, GitHub private-key readability, service activity, `nginx -t`, and dependency-aware `/ready`.
- Wired the verifier into fresh installation and immutable upgrades as a blocking gate.
- Changed upgrade success validation from liveness-only `/health` to dependency-aware `/ready` plus the complete installed-host verifier.
- Added focused static wiring and invariant tests and documented the operator command.

### Verification

- Shell syntax checks passed for installer, verifier, upgrade, backup, and restore scripts.
- Final Node.js 22 suite passed: 634 tests, 144 suites, 0 failures, 0 skipped.
- Lint, formatting, production dependency audit, and diff checks passed.

## Protected Worker Readiness Visibility

- Status: Implemented locally; supported-host observation remains required
- Implemented: 2026-07-12T18:57:55+08:00

### Changes

- Added a sanitized BullMQ worker readiness check that returns only availability and the number of connected deployment workers.
- Added worker readiness to the existing authenticated admin server dashboard instead of creating a public diagnostics endpoint.
- Made unavailable queues, missing workers, and readiness errors fail closed without returning Redis addresses, client names, credentials, or error text.

### Verification

- Focused worker-readiness, admin-authorization, and related admin UI tests passed: 29 tests, 7 suites.
- `npm run lint` passed on Node.js `v22.23.1`.
- The full Node.js 22 suite passed: 638 tests, 145 suites, 0 failures, 0 skipped.
- Prettier passed for all JavaScript files owned by this slice.
- Repository-wide `npm run format:check` remains blocked by the pre-existing untracked `docs/FULL_IMPLEMENTATION_OVERVIEW.md`; it was preserved unchanged.
- `git diff --check` passed.

## Sanitized Fatal Process Handling

- Status: Implemented locally; live systemd restart proof remains required
- Implemented: 2026-07-12T19:00:20+08:00

### Changes

- Added shared, idempotent fatal handlers for uncaught exceptions and unhandled rejections.
- Log only the failure event, error type, and a constrained error code; messages, stacks, credentials, and topology are excluded.
- Split web and worker entrypoints into minimal bootstraps and dynamically loaded runtimes so configuration-time module failures are handled before application imports execute.
- Exit nonzero after fatal startup or unexpected process failures so systemd can restart the service.

### Verification

- Focused process-handler and bootstrap tests passed, including configuration-time failures in both service entrypoints.
- `npm run lint` passed on Node.js `v22.23.1`.
- The full Node.js 22 suite passed: 643 tests, 146 suites, 0 failures, 0 skipped.
- Prettier passed for all files owned by this slice.
- Repository-wide formatting remains blocked only by the preserved, pre-existing untracked `docs/FULL_IMPLEMENTATION_OVERVIEW.md`.

## Bounded Worker Drain and systemd Timeout Alignment

- Status: Implemented locally; live systemd restart proof remains required
- Implemented: 2026-07-12T19:02:25+08:00

### Changes

- Added an idempotent worker lifecycle with a 110-second active-job drain deadline beneath systemd's 120-second stop window.
- Force BullMQ closed after a missed deadline, close Redis and MongoDB once, and return failure so the runtime exits nonzero.
- Exported web and worker shutdown deadlines and added a regression test proving both remain below their installed systemd stop windows.

### Verification

- Focused worker lifecycle and fatal-process tests passed: 9 tests, 2 suites.
- `npm run lint` passed on Node.js `v22.23.1`.
- The full Node.js 22 suite passed: 647 tests, 147 suites, 0 failures, 0 skipped.
- Prettier passed for all files owned by this slice.
- Repository-wide formatting remains blocked only by the preserved, pre-existing untracked `docs/FULL_IMPLEMENTATION_OVERVIEW.md`.

## Bounded `.env` File Import

- Status: Implemented and verified locally
- Implemented: 2026-07-12

### Changes

- Added an owner-only `.env` upload form alongside the existing one-variable-at-a-time form.
- Read the selected file into the existing CSRF-protected form flow without adding multipart storage or logging file contents.
- Validate the complete file before writes, with 64 KB and 100-variable limits, uppercase environment-name enforcement, duplicate and empty-value rejection, and errors that never reflect values.
- Reused encrypted secret storage and audit events; imports update existing names and retain all existing manual-entry behavior.
- Cache-busted the shared client bundle so newly deployed upload behavior cannot be masked by the previous one-hour browser cache, and added a `FileReader` fallback for browsers without `File.text()`.
- Refined stored-secret controls into distinct Reveal value, Show/Hide value, and Clear revealed value actions; replacement editing explicitly keeps current plaintext out of form fields.
- Reshaped secret rotation into a Render-style inline Stored Secrets editor: Edit changes table rows into masked replacement inputs, blank rows remain unchanged, and Save/Cancel stay attached to the table.
- Marked all environment-management responses `Cache-Control: no-store` and `Pragma: no-cache` so reveal and validation responses are not retained in browser caches.

### Verification

- Focused parser, encrypted persistence, no-partial-write, upload UI, and related environment UI tests passed.
- `npm run lint` passed.
- `npm run format:check` passed.
- Full Node.js suite passed after the reveal and rotation refinement: 660 tests, 150 suites, 0 failures, 0 skipped.

## Consolidated Project Settings — Phase 1 Shell

- Status: Implemented and verified locally
- Implemented: 2026-07-13

### Changes

- Added an Owner-only consolidated Settings route with seven stable section anchors and compatibility links to current authoritative setting pages.
- Added shared role-aware project-navigation and settings-section registries; the sidebar and overview Quick Links now consume the same project navigation source.
- Added sticky desktop and in-flow mobile section navigation with active-section tracking, keyboard focus movement, and reduced-motion-aware fragment scrolling.
- Preserved all existing project settings, repository, detection, domain, deploy-hook, environment, member, and deployment routes for the Phase 2 migration.

### Verification

- Focused settings shell, navigation, icon, sidebar, authorization, and empty-state tests passed.
- `npm run lint` passed.
- `npm run format:check` passed.
- Full Node.js suite passed: 666 tests, 151 suites, 0 failures, 0 skipped.

## Consolidated Project Settings — Phase 2 Composition

- Status: Implemented and verified locally
- Implemented: 2026-07-13

### Changes

- Composed General, Source & Build, Deployment, Custom Domains, Notifications, Health & Maintenance, and Danger Zone into the consolidated Settings page.
- Reused every existing mutation route, validator, service, queue, confirmation, and CSRF contract instead of introducing parallel settings logic.
- Load repository state, active domains, and effective project quota in parallel; resource limits remain display-only.
- Strip the stored deploy-hook hash before rendering and expose only configured/not-configured state plus existing generate/revoke actions.
- Kept repository connection, detection execution, domain DNS-token display, Environment, Members, and Deployments as focused workflows.

### Verification

- Focused settings composition, authorization, destructive-action, responsive-table, pending-form, navigation, and icon tests passed.
- Settings EJS compiled and rendered with representative data.
- `npm run lint` passed.
- `npm run format:check` passed.
- Full Node.js suite passed: 668 tests, 151 suites, 0 failures, 0 skipped.

## Consolidated Project Settings — Phase 3 Interaction Standardization

- Status: Implemented and verified locally
- Implemented: 2026-07-13

### Changes

- Converted project name, build configuration, build filters, deployment mode, notification preference, and health-check path to read-first, edit-on-demand groups.
- Enforced one open editor at a time; Cancel and Escape reset unsaved changes and restore focus to the triggering Edit control.
- Added constrained same-project Settings return targets so successful mutations return to the relevant fragment without allowing open redirects.
- Re-render General, Build, Filters, and Health validation failures in their active Settings group with safe submitted values and established field-level errors.
- Retained direct confirmed behavior for deploy hooks, domains, maintenance, archive, and deletion because they are operational or destructive actions rather than ordinary field editing.
- Cache-busted the shared client bundle for the new interaction behavior.

### Verification

- Focused settings interaction, return-target security, validation, pending-state, accessibility, authorization, and project-validator tests passed.
- Settings EJS compiled and rendered in default and server-error edit states.
- `npm run lint` passed.
- `npm run format:check` passed.
- Full Node.js suite passed: 671 tests, 151 suites, 0 failures, 0 skipped.

## Consolidated Project Settings — Phase 4 Deferred Capability Evaluation

- Status: Evaluation complete; all capabilities remain deferred
- Evaluated: 2026-07-13

### Changes

- Evaluated pull-request previews, edge caching, region selection, instance sizing, shell access, scaling, persistent disks, one-off jobs, custom maintenance URLs, and advanced networking controls.
- Recorded the user need, architecture and data impact, security boundary, operational requirements, acceptance evidence, and explicit approval gate for every capability.
- Kept the settings UI limited to existing HelloDeploy behavior; no placeholder control, route, model, or unsupported capability was added.
- Linked the evaluation from the Project Settings UX specification and documentation index.

### Verification

- `npm run format:check` passed after formatting the new evaluation document.
- Focused Project Settings shell tests passed: 11 tests, 1 suite, 0 failures, 0 skipped.
- `npm run lint` passed.
- Full Node.js suite passed: 671 tests, 151 suites, 0 failures, 0 skipped.
- Documentation links resolved, the sensitive screenshot-identifier scan returned no matches, and `git diff --check` passed.

## Production Configuration Source Alignment

- Status: Implemented and verified locally; production-equivalent startup remains externally blocked
- Implemented: 2026-07-13

### Changes

- Separated startup-blocking environment keys from complete-or-empty and optional integration groups in the generated self-hosted checklist.
- Aligned `.env.example`, the environment reference, setup prompts, and setup completion output with the web and worker runtime-validation contracts.
- Stopped the setup wizard from defaulting a GitHub private-key path when the GitHub integration is otherwise left empty, avoiding an invalid partial configuration.
- Added `npm run config:check` to the setup completion steps and documented that diagnostics report names and statuses without values.
- Kept GitHub App configuration identified as required for repository deployments while allowing the platform processes to start with the complete group absent, matching current runtime behavior.
- Added sanitized component diagnostics with bounded status labels and explicit `incomplete` reporting for partially populated integration groups.

### Verification

- Focused environment-validation and self-hosted-checklist tests passed, including sentinel-value success/failure diagnostics and incomplete integration reporting.
- `npm run config:check` passed for both web and worker using the local environment.
- `npm run lint` passed.
- `npm run format:check` passed.
- Full Node.js suite passed after configuration diagnostics were added: 675 tests, 151 suites, 0 failures, 0 skipped.

## Verified Automatic Upgrade Rollback

- Status: Implemented and verified locally; clean-host failed-upgrade exercise remains required
- Implemented: 2026-07-13

### Changes

- Replaced the restart-only upgrade fallback with a bounded rollback function that checks out the previous full commit and reinstalls its locked production dependencies.
- Validate both restored service configurations, reinstall the restored release's systemd units, rerender platform ingress, restart all HelloDeploy services, and wait for readiness.
- Apply the same dependency-aware installed-host verification to both the candidate and restored releases.
- Report verified rollback and critical rollback-verification failure as distinct operator outcomes.
- Updated the operations runbook with the automatic rollback contract and critical-failure response.

### Verification

- `bash -n infrastructure/upgrade.sh` passed.
- Focused upgrade, installation-verifier, and backup/restore safety tests passed after the complete failure guard was added: 15 tests, 3 suites, 0 failures, 0 skipped.
- `npm run lint`, `npm run format:check`, `npm run config:check`, and `git diff --check` passed.
- Full Node.js suite passed: 678 tests, 151 suites, 0 failures, 0 skipped.

## Upgrade Queue Pause and Drain

- Status: Implemented and verified locally; clean-host execution remains required
- Implemented: 2026-07-13

### Changes

- Added an operational BullMQ queue-maintenance CLI that globally pauses deployment starts and waits for active jobs to reach zero before checkout.
- Added a bounded 10-minute default drain deadline with a validated 1-second to 1-hour operator override.
- Preserve queues that operators had already paused and resume only queues paused by the upgrade.
- Automatically resume after a pre-checkout drain failure, verified candidate activation, or verified rollback; keep the queue paused when rollback verification fails critically.
- Wired state restoration through an exit trap so ordinary upgrade failures cannot silently strand the queue.

### Verification

- `bash -n infrastructure/upgrade.sh` passed.
- Focused queue-maintenance, upgrade-safety, and installation-verifier tests passed: 16 tests, 3 suites, 0 failures, 0 skipped.
- `npm run lint`, `npm run format:check`, `npm run config:check`, and `git diff --check` passed.
- Full Node.js suite passed: 683 tests, 152 suites, 0 failures, 0 skipped.

## Public Deployment Evidence and Workflow Refinement

- Status: Public boundary verified; authenticated and host workflows blocked
- Observed: 2026-07-13

### Public Evidence

- Confirmed the public homepage and authentication entry point return `200` through Cloudflare.
- Confirmed `/health` returns sanitized liveness and `/ready` returns `200` with MongoDB, Redis, and queue checks true.
- Confirmed HSTS and the application CSP are present.
- Observed deployed Phase 3 JavaScript and Phase 2 stylesheet asset identifiers; this does not prove later local changes are deployed.
- Observed that the public session cookie includes `HttpOnly` and `SameSite=Strict` but omits `Secure`; no cookie value or session identifier was recorded. Host-side production environment and trusted-proxy verification remains required.

### Workflow Changes

- Added one prominent Next action to the owner onboarding checklist.
- Added client-side `.env` entry-count feedback, zero-entry rejection, and explicit replacement confirmation without displaying values; server parsing remains authoritative.
- Added a single Passed/Failed/Blocked/Not Run acceptance checklist separating public, authenticated owner, and operator evidence.
- Reconciled the readiness roadmap and tracker with the deployed-but-NO-GO state and added the ordered production lifecycle to the operations runbook.

### Verification

- Focused workflow/settings tests passed before broad verification: 27 tests, 4 suites, 0 failures, 0 skipped.
- Final focused security, workflow, settings, and documentation checks passed: 37 tests, 7 suites, 0 failures, 0 skipped.
- `npm run lint`, `npm run format:check`, `npm run config:check`, and `git diff --check` passed.
- `npm audit --omit=dev --audit-level=moderate` reported zero vulnerabilities.
- Full Node.js suite passed: 690 tests, 153 suites, 0 failures, 0 skipped.

## Production Session-Cookie Gate

- Status: Prevention implemented locally; live release remains failed pending redeployment
- Implemented: 2026-07-13

### Changes

- Made the supported web and worker `npm start` commands force `NODE_ENV=production`; `npm run dev` remains the explicit development path.
- Added `--require-production` to configuration validation and made install/upgrade activation use it under each service identity.
- Added bounded `runtime: production`/`non-production` diagnostics without exposing environment values.
- Added `npm run production:check -- <https-url>` to verify the public homepage, HSTS, CSP, sanitized `/health` and `/ready`, and `Secure; HttpOnly; SameSite=Strict` without printing cookie values or response bodies.
- Added operator recovery instructions that preserve strict cookies and constrained proxy trust.

### Evidence

- A fresh public check against `https://hellodeploy.online` passed homepage, sign-in, checkout-derived frontend assets, HSTS, CSP, sanitized health, and dependency readiness, but failed `session-cookie: missing secure`.
- Focused configuration, lifecycle, ingress, public-check, and session-security tests passed: 40 tests, 8 suites, 0 failures, 0 skipped.
- `npm run lint`, `npm run format:check`, `npm run config:check`, `npm audit --omit=dev --audit-level=moderate`, and `git diff --check` passed; the production dependency audit reported zero vulnerabilities.
- Full Node.js suite passed after the production gate was completed: 697 tests, 154 suites, 0 failures, 0 skipped.
- The live failure remains open until the new production start path is deployed and the external check passes; local changes are not production evidence.

## Hybrid Render and Ubuntu Worker Foundation

- Status: Implemented and verified locally; external services and host drills remain blocked
- Implemented: 2026-07-13

### Changes

- Added shared `REDIS_URL` support for the web queue, rate limiting, live-log subscription, maintenance CLI, and worker. Managed production endpoints require `rediss://`; URL configuration takes precedence while loopback host/port/password remains backward compatible.
- Replaced Redis endpoint and raw connection-error logging with bounded connection modes and error classifications.
- Separated the Render dashboard hostname from wildcard application routing through `PLATFORM_DOMAIN`, `DEPLOYMENT_DOMAIN`, and the aligned dashboard suffix.
- Added production hostname validation so schemes, ports, wildcards, paths, control syntax, and other Nginx-unsafe domain values fail before startup.
- Added a hybrid checklist and deployment guide for Render web, shared MongoDB Atlas and managed TLS Redis, and an Ubuntu Docker/Nginx/Cloudflare Tunnel worker plane.
- Added a hybrid worker preflight mode that requires managed TLS Redis without probing or exposing its endpoint and does not require a local Redis daemon.
- Added worker-only install, upgrade, and verification roles. Worker installation requires an explicit immutable release and securely pre-provisioned shared configuration; it never generates a replacement encryption key or starts a local web service.

### Verification

- Focused Redis, configuration, routing, installer, privilege, upgrade, queue, SSE, and rate-limit tests passed during implementation.
- `npm ci` installed 314 packages, reported zero vulnerabilities, and left `package-lock.json` unchanged at SHA-256 `6363f11311bed8124fecefe42240d0ce5e85a43631456fcc20edde171a968b3e`.
- `npm run lint`, `npm run format:check`, `npm run config:check`, `npm audit --omit=dev --audit-level=moderate`, and `git diff --check` passed.
- Full Node.js suite passed after the hybrid preflight was added: 717 tests, 156 suites, 0 failures, 0 skipped.
- The public production check passed homepage, checkout-derived assets, HSTS, CSP, sign-in, health, and readiness, but still failed `session-cookie: missing secure`.
- Managed Redis connectivity, Render environment changes, immutable deployment, Ubuntu host verification, real Docker runtimes, authenticated QA, upgrade failure recovery, and second-host restore were not run and remain external blockers.

## Grouped Production Completion Baseline

- Status: Group 0 in progress; external execution groups remain blocked by their documented dependencies
- Recorded: 2026-07-13

### Execution Structure

- Grouped the remaining production work into release, Render security, Ubuntu routing, deployment/product QA, recovery, and final-decision stages in the authoritative implementation tracker.
- Kept individual live results in the existing acceptance checklist instead of creating a second status source.
- Selected guided execution for credentialed Render, Cloudflare, Ubuntu, S3-compatible backup, and restore-host actions.
- Selected an annotated `v0.1.0` tag on the reviewed `main` merge commit as the first immutable release reference.

### Release Evidence

- Draft PR #1 contains three coherent commits for settings/secrets UX, the hybrid worker foundation, and production-readiness documentation.
- The PR head is cleanly mergeable at `85428baacf6cd5b80cf8d3b3aff1a5094e9fd363`.
- GitHub Actions completed the Node.js 22 CI workflow successfully for that head, including clean dependency installation, lint, formatting, configuration validation, tests, and the production dependency audit.
- Local release verification passed with 717 tests across 156 suites, no failures or skips, and zero reported production dependency vulnerabilities.
- Review, merge, annotated-tag creation, Render redeployment, and every target-host or authenticated acceptance row remain unverified and must not be inferred from this repository evidence.

## Immutable v0.1.0 Release Baseline

- Status: Group 0 complete; Group 1 blocked on guided Render configuration and deployment confirmation
- Published: 2026-07-13

### Release Evidence

- The grouped documentation update passed focused workflow-documentation checks and the full local release gate: lint, formatting, configuration validation, 717 tests across 156 suites, production dependency audit, and diff validation.
- PR #1 passed the refreshed Node.js 22 CI workflow and was merged into `main` as `740b9a83d4414bf85b97894ea6a1dca0056cfc9e`.
- Published annotated tag `v0.1.0`; local and remote verification resolve the tag to that exact merge commit.
- A fresh public production check passed homepage, expected frontend assets, HSTS, CSP, sign-in, sanitized health, and dependency readiness, but still failed `session-cookie: missing secure`.
- Public asset matching does not prove the deployed Render commit. Exact commit identity, production environment, supported start command, managed TLS Redis configuration, and redeployment remain guided provider checks.

### Provider Environment Compatibility

- Confirmed Node.js exits before startup when `--env-file` references a missing file, which would make the supported workspace command incompatible with a Render service that supplies process environment variables without creating `.env`.
- Changed both production service scripts to `--env-file-if-exists=../../.env`. Local and Ubuntu `.env` loading remains supported, while provider-managed environments can start without a physical file.
- Added a configuration contract test for both service start scripts and documented the provider behavior in the hybrid guide.
