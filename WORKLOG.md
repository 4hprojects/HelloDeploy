# Worklog

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
- [ ] Confirm `/health` responds.
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
