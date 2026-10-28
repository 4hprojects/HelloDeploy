# Phase 0B: Read-Only Visual and Workflow Audit for Claude Code

Status: EXECUTE AUDIT ONLY. Do not modify product code or commit.
Date: 2026-10-27

## Mission

Verify which proposed HelloDeploy UI/UX issues exist in the rendered application and measure their impact before implementing changes. Make results reproducible and distinguish source evidence, fixture evidence, local browser evidence, and production evidence.

## Preflight

1. Read `CLAUDE.md`, `AGENTS.md`, `docs/PRIORITIES.md`, `docs/UI_DESIGN_SYSTEM.md`, `docs/SCREEN_READER_CHECK.md`, and `playwright.config.js`.
2. Record branch, HEAD SHA, worktree status. Do not clean, reset, stash or alter unrelated files.
3. Inventory current EJS views, shared partials, CSS components, routes and current test setup.
4. Verify existing `tests/browser/ui-ux.spec.js`, `tests/browser/status-pages.spec.js` and any current screenshots.
5. Identify how the fixture server exposes demo users and UI states without credentials or production side effects.
6. Do not expose secrets, tokens or private user information in screenshots or outputs.

## Baseline commands (only if safe in the local test environment)

- `npm run assets:verify`
- `npm run lint`
- `npm run test:browser`
- `npm run format:check`
- Any Playwright screenshot capture must use the existing fixture/test server or other authorized nonproduction environment.
- If running tests would change tracked source, production state, or user data, stop and report the blocker instead.
- Preserve exit codes, console errors, test output paths and environment descriptions.

## Screenshots and responsive audit

Capture public homepage, account creation/sign-in, dashboard, project list, project overview, onboarding/setup, deployment history, deployment detail, repository setup, environment variables, admin overview, admin reviews, admin builder, service status, and public docs.

For each meaningful state, use 390, 768 and 1440 CSS pixel widths. Test 320px and 200% zoom on critical pages. Test light/dark where supported. Capture empty, success, error, loading, attention-required, pending, healthy, failed and restricted states where the fixture can actually produce them.

Evaluate:

- Visual hierarchy and primary action.
- Navigation path, active state, breadcrumbs and scope.
- Readability, spacing, overlap, clipping, horizontal scroll and small tap targets.
- Logical headings, forms, labels, validation and help text.
- Keyboard-only focus order, Esc handling, modal focus return and screen-reader output.
- Whether current live release status differs clearly from latest deployment attempt status.
- Whether informational timestamps indicate freshness and timezone.
- Whether actions accurately reflect owner/maintainer/viewer/admin authorization.
- Whether public compatibility and service limits match actual enabled functionality.

## Task journeys

1. First visit: decide if app is supported, understand pilot limits and reach getting started.
2. New account: understand verification, create a project, connect repository, review detected setup and reach approval.
3. Established user: locate a live app URL and identify current health.
4. Failure recovery: inspect failed deployment while recognizing live release health, locate logs and safe retry/rollback controls.
5. Advanced deployment: locate exact-commit and no-cache actions without distracting basic users.
6. Administrator: identify worker/queue/resource issues, pending approvals and audit activity.
7. Builder administrator: inspect builder status and warnings without starting/stopping service during the audit.

## Evidence format for every issue

- ID and short title
- Page URL or view file
- Environment: source / fixture / local browser / production
- Git SHA and date
- State, role, viewport and theme
- Steps to reproduce
- Expected result and observed result
- Screenshot/test/log reference
- User impact, severity and confidence
- Smallest safe proposed correction
- Affected components/routes/tests
- Existing feature or behavior that must remain unchanged
- Verification plan

## Explicit risk boundaries

Do not create projects on production, trigger deployments, reveal secrets, change permissions, run destructive operations, or use real customer data to manufacture states. Do not enable feature flags or the builder. Prefer deterministic fixtures, no new dependencies, and no runtime configuration changes. Do not alter production status or monitoring endpoints. Audit findings are recommendations, not approvals.

## Report format

1. Baseline and access limitations.
2. Route/view/partial map and existing design-system reuse.
3. Screenshot index and viewport coverage.
4. Executed test results, with failures and reproduction.
5. Confirmed usability issues ranked P0/P1/P2/P3.
6. Hypotheses not confirmed, including reasons.
7. Updated implementation scope and token estimates.
8. Clear request for owner review BEFORE any code change.

Stop after the report. No feature branch, PR, Markdown write-back, product patch, merge or production deployment unless separately authorized.
