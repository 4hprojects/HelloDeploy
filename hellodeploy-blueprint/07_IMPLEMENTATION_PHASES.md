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

| Status  | Task                                             | Notes                                                                                            |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Done    | Implement hostname normalization and uniqueness. | Covered by domain service validation, unique hostname index, and focused tests.                  |
| Done    | Implement ownership-verification records.        | Verification tokens are generated for DNS TXT proof and stored hashed.                           |
| Done    | Generate provider-neutral DNS instructions.      | Project domain UI shows TXT record instructions for domain owners.                               |
| Done    | Implement Admin approval.                        | Verified domains require administrator approval before route activation is queued.               |
| Done    | Activate routing only after verification.        | Worker marks domains active only after approved route activation succeeds when Nginx is enabled. |
| Blocked | Verify HTTPS and canonical-domain behavior.      | Requires target-host ingress, TLS, and canonical-domain checks.                                  |

### Acceptance Criteria

- A domain cannot be claimed by two projects.
- Unverified domains never receive active routing.

## Phase 10: Administration and Operations

### Tasks

| Status  | Task                                                                             | Notes                                                                                               |
| ------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Done    | Build server and capacity dashboard.                                             | Admin server view reports capacity and queue state.                                                 |
| Done    | Add queue pause/resume and maintenance mode.                                     | Super Admin controls and middleware gating are implemented.                                         |
| Done    | Add project suspension and neutral suspension routes.                            | Admin suspension/reactivation and worker maintenance route behavior are implemented.                |
| Done    | Add quota editing and consumption views.                                         | Quota override parsing, storage, audit events, and consumption context are implemented.             |
| Done    | Add audit search and export.                                                     | Filtered audit CSV export and export audit events are implemented.                                  |
| Partial | Add inactivity reports and notifications.                                        | Inactivity reporting scaffolding exists; delivery and alert behavior need browser/ops verification. |
| Done    | Add cleanup schedules and disk safeguards.                                       | Cleanup skips deployments still referenced as active.                                               |
| Done    | Write incident, backup, restore, and upgrade runbooks.                           | Operations runbooks cover incident, backup, restore, upgrade, rollback, and uninstall workflows.    |
| Partial | Complete responsive mobile sidebar, tables, cards, forms, and dashboard layouts. | Responsive CSS exists, but final cross-viewport browser verification remains pending.               |
| Partial | Complete light and dark mode behavior and persistence.                           | Theme tokens and localStorage persistence exist; final browser verification remains pending.        |

### Acceptance Criteria

- Super Admin can protect the server without terminal access for routine operations.
- Cleanup cannot delete active or retained release assets.
- Operational alerts reach the configured Super Admin.

## Phase 11: Hardening and Pilot

### Tasks

| Status  | Task                                                                                                | Notes                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Done    | Complete security test suite and threat review.                                                     | Local full test suite passed during P11.                                                           |
| Partial | Perform load, build concurrency, and resource-exhaustion tests.                                     | Local capacity snapshot exists; HTTP sampling and build/resource-exhaustion checks remain pending. |
| Blocked | Test failure recovery for MongoDB, Redis, Docker, Nginx, worker, and tunnel.                        | Requires target-host service control.                                                              |
| Blocked | Conduct usability pilot.                                                                            | Requires a real noncritical repository and pilot user flow on target host.                         |
| Done    | Finalize acceptable-use, privacy, retention, and service-limit policies.                            | Legal/policy markdown and public policy surfaces were completed.                                   |
| Partial | Establish measured server capacity.                                                                 | Local host snapshot exists; safe production thresholds require target-host measurements.           |
| Blocked | Deploy a noncritical pilot application.                                                             | Requires target-host deployment run.                                                               |
| Done    | Run keyboard, screen-reader landmark, contrast, zoom, and reduced-motion checks.                    | Documented as completed in the P11 scope.                                                          |
| Done    | Verify all final favicon, manifest, email-logo, and social-preview assets or approved placeholders. | Documented as completed in the P11 scope.                                                          |

### Acceptance Criteria

- No unresolved critical security finding.
- Safe operating thresholds are documented from measurements.
- Pilot users complete deployment without administrator terminal work.

## Phase 12: Distribution and Self-Hosted Edition

### Tasks

| Status  | Task                                                                | Notes                                                                                              |
| ------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Partial | Remove remaining environment assumptions.                           | Self-hosted docs and checklist reduce assumptions; target-host install validation remains pending. |
| Done    | Create preflight checker and installer.                             | `scripts/preflight.js` and `infrastructure/install.sh` are present.                                |
| Done    | Support Ubuntu 22.04 and 24.04.                                     | Installer, preflight, and self-hosted docs declare supported versions.                             |
| Done    | Generate secure initial secrets.                                    | Setup wizard supports production environment generation.                                           |
| Done    | Create upgrade, rollback, backup, restore, and uninstall workflows. | Infrastructure scripts and operations docs cover lifecycle workflows.                              |
| Done    | Create administrator setup wizard.                                  | `scripts/setup.js` and `scripts/self-hosted-checklist.js` are present.                             |
| Done    | Document local-only, public-IP, and Cloudflare Tunnel modes.        | Covered in the self-hosted install guide and checklist script.                                     |
| Done    | Choose and document software license.                               | MIT license is present and referenced by self-hosted docs.                                         |

### Acceptance Criteria

- A clean supported Ubuntu machine can install HelloDeploy using documented steps.
- Installation contains no credentials or identifiers from the original server.
- Backup and restore succeed on a second test machine.
