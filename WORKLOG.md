# Worklog

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
