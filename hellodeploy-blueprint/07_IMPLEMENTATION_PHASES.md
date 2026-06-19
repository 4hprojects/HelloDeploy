# Implementation Phases

## Phase 0: Repository and Decision Baseline

### Tasks

- [ ] Create monorepo structure from the architecture document.
- [ ] Configure modern JavaScript with ECMAScript modules, ESLint, Prettier, JSDoc where useful, and test runners.
- [ ] Create `.env.example` without real credentials.
- [ ] Add architecture decision records for framework, database, queue, authentication, and encryption.
- [ ] Define shared status enums and API contracts.
- [ ] Document local development startup and shutdown.
- [ ] Create placeholder brand assets and public asset directories.
- [ ] Implement approved CSS tokens for color, spacing, typography, radius, and themes.
- [ ] Create base EJS layouts and shared partials.

### Acceptance Criteria

- A new developer can install dependencies and start placeholder Express web and worker processes.
- CI runs type checks, linting, and tests.
- No secrets or machine-specific paths exist in source control.
- Public pages render with the placeholder icon, approved palette, and responsive base layout.

## Phase 1: Identity and Platform Foundation

### Tasks

- [ ] Implement MongoDB connection and migrations/index initialization.
- [ ] Implement registration with Turnstile verification.
- [ ] Implement Resend email verification.
- [ ] Implement login, logout, password reset, and revocable sessions.
- [ ] Implement platform roles and account statuses.
- [ ] Seed the first Super Admin through a secure one-time process.
- [ ] Implement audit-event service.
- [ ] Add rate limits and CSRF protections.
- [ ] Implement the shared Hello ecosystem authentication layout.
- [ ] Implement consistent field validation, password visibility, loading, and error states.
- [ ] Implement the three-step password-recovery interface.

### Acceptance Criteria

- Verified users can authenticate securely.
- Suspended users cannot authenticate or mutate data.
- Super Admin creation cannot be repeated without authorization.
- Authentication and privilege actions are audited.
- Registration, sign-in, email verification, and password recovery meet the authentication UX standard.

### Security Gate

- Session fixation, token replay, privilege escalation, and account enumeration tests pass.

## Phase 2: Projects, Membership, and Quotas

### Tasks

- [ ] Implement project draft CRUD and slug reservation.
- [ ] Implement Owner, Maintainer, and Viewer memberships.
- [ ] Implement invitations and ownership transfer.
- [ ] Implement plan defaults and user/project overrides.
- [ ] Implement project status transitions.
- [ ] Build Super Admin user and project management screens.
- [ ] Add approval-request records and administrative decisions.
- [ ] Build reusable EJS cards, tables, forms, badges, alerts, and confirmation dialogs.

### Acceptance Criteria

- Users cannot exceed effective quotas.
- Project permissions match the documented matrix.
- Super Admin can increase limits for individual Hello projects.
- Every approval, suspension, and ownership change is audited.

## Phase 3: GitHub App Integration

### Tasks

- [ ] Register development GitHub App.
- [ ] Implement installation callback and repository selection.
- [ ] Store repository identifiers without personal access tokens.
- [ ] Implement branch and commit retrieval.
- [ ] Implement signed webhook receiver and replay prevention.
- [ ] Implement available-commit indicator.
- [ ] Implement manual versus automatic deployment settings.

### Acceptance Criteria

- A user can connect only repositories authorized by their installation.
- Invalid webhook signatures are rejected.
- Non-production branch pushes never trigger production deployment.
- Manual mode does not deploy on push.

### Security Gate

- GitHub permissions are minimum necessary and short-lived tokens are not logged.

## Phase 4: Project Detection and Validation

### Tasks

- [ ] Safely retrieve repository metadata and selected files.
- [ ] Detect static, Node.js, Express, React, Vue, and Next.js projects.
- [ ] Validate `package.json`, scripts, lock files, output directory, and port.
- [ ] Detect unsupported runtimes and explain rejection.
- [ ] Identify high-risk configuration files.
- [ ] Implement approval report and revision workflow.
- [ ] Implement encrypted environment-variable storage.

### Acceptance Criteria

- Supported sample repositories receive deterministic recommendations.
- Unsupported repositories fail before build with actionable explanations.
- Secret values are never returned after storage.

## Phase 5: Queue and Deployment Worker

### Tasks

- [ ] Add Redis and BullMQ.
- [ ] Implement durable deployment records and job contracts.
- [ ] Implement project locks and idempotency.
- [ ] Create restricted build workspace lifecycle.
- [ ] Fetch exact commits.
- [ ] Generate safe build definitions for supported runtimes.
- [ ] Build images with time and resource controls.
- [ ] Capture and redact build output.
- [ ] Implement cancellation, timeout, cleanup, and retry classification.

### Acceptance Criteria

- Only one deployment runs per project.
- Duplicate requests do not create duplicate active releases.
- Timed-out builds terminate and clean resources.
- The web process has no direct Docker control.

### Security Gate

- Malicious filenames, commands, oversized contexts, and Dockerfile attempts cannot escape the build boundary.

## Phase 6: Runtime Containers and Health Checks

### Tasks

- [ ] Allocate container names, networks, and loopback ports.
- [ ] Enforce CPU, memory, process, and storage policies.
- [ ] Inject encrypted environment values only at runtime.
- [ ] Start candidate containers.
- [ ] Implement readiness and application health checks.
- [ ] Collect sanitized runtime logs and basic metrics.
- [ ] Protect against crash loops.

### Acceptance Criteria

- Each sample application runs in its own restricted container.
- Resource limits are observable and enforced.
- Failed health checks never replace the active release.

## Phase 7: Nginx, Subdomains, and Cloudflare Tunnel

### Tasks

- [ ] Build Nginx template generator.
- [ ] Reserve and route platform subdomains.
- [ ] Validate all generated configuration with `nginx -t`.
- [ ] Implement atomic route replacement and rollback.
- [ ] Configure development Cloudflare Tunnel routes.
- [ ] Verify public health after activation.
- [ ] Implement reserved-subdomain policy.

### Acceptance Criteria

- An approved app is reachable at its assigned subdomain.
- A failed route change leaves existing routes operational.
- Existing PM2 application routes are not modified.

### Operations Gate

- Nginx and tunnel backups and restoration steps are tested.

## Phase 8: Deployment Experience and Rollback

### Tasks

- [ ] Implement deploy latest, selected commit, current commit, and no-cache options.
- [ ] Add deployment timeline and stage display.
- [ ] Add safe build and runtime log viewers.
- [ ] Implement cancellation and manual retry.
- [ ] Retain three healthy releases.
- [ ] Implement health-checked rollback.
- [ ] Add Resend deployment notifications.
- [ ] Add Server-Sent Events for live deployment logs and progress.
- [ ] Apply documented deployment status colors, icons, and labels.

### Acceptance Criteria

- Users can understand whether a failure occurred during validation, build, startup, health, or routing.
- Rollback restores a retained healthy release without manual server commands.

## Phase 9: Custom Domains

### Tasks

- [ ] Implement hostname normalization and uniqueness.
- [ ] Implement ownership-verification records.
- [ ] Generate provider-neutral DNS instructions.
- [ ] Implement Admin approval.
- [ ] Activate routing only after verification.
- [ ] Verify HTTPS and canonical-domain behavior.

### Acceptance Criteria

- A domain cannot be claimed by two projects.
- Unverified domains never receive active routing.

## Phase 10: Administration and Operations

### Tasks

- [ ] Build server and capacity dashboard.
- [ ] Add queue pause/resume and maintenance mode.
- [ ] Add project suspension and neutral suspension routes.
- [ ] Add quota editing and consumption views.
- [ ] Add audit search and export.
- [ ] Add inactivity reports and notifications.
- [ ] Add cleanup schedules and disk safeguards.
- [ ] Write incident, backup, restore, and upgrade runbooks.
- [ ] Complete responsive mobile sidebar, tables, cards, forms, and dashboard layouts.
- [ ] Complete light and dark mode behavior and persistence.

### Acceptance Criteria

- Super Admin can protect the server without terminal access for routine operations.
- Cleanup cannot delete active or retained release assets.
- Operational alerts reach the configured Super Admin.

## Phase 11: Hardening and Pilot

### Tasks

- [ ] Complete security test suite and threat review.
- [ ] Perform load, build concurrency, and resource-exhaustion tests.
- [ ] Test failure recovery for MongoDB, Redis, Docker, Nginx, worker, and tunnel.
- [ ] Conduct usability pilot.
- [ ] Finalize acceptable-use, privacy, retention, and service-limit policies.
- [ ] Establish measured server capacity.
- [ ] Deploy a noncritical pilot application.
- [ ] Run keyboard, screen-reader landmark, contrast, zoom, and reduced-motion checks.
- [ ] Verify all final favicon, manifest, email-logo, and social-preview assets or approved placeholders.

### Acceptance Criteria

- No unresolved critical security finding.
- Safe operating thresholds are documented from measurements.
- Pilot users complete deployment without administrator terminal work.

## Phase 12: Distribution and Self-Hosted Edition

### Tasks

- [ ] Remove remaining environment assumptions.
- [ ] Create preflight checker and installer.
- [ ] Support Ubuntu 22.04 and 24.04.
- [ ] Generate secure initial secrets.
- [ ] Create upgrade, rollback, backup, restore, and uninstall workflows.
- [ ] Create administrator setup wizard.
- [ ] Document local-only, public-IP, and Cloudflare Tunnel modes.
- [ ] Choose and document software license.

### Acceptance Criteria

- A clean supported Ubuntu machine can install HelloDeploy using documented steps.
- Installation contains no credentials or identifiers from the original server.
- Backup and restore succeed on a second test machine.
