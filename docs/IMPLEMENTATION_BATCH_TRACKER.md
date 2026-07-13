# Implementation Batch Tracker

Updated: 2026-07-13T14:24:00+08:00

This is the authoritative monitor for current HelloDeploy production-readiness work. The [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md) defines release requirements and strategy, this tracker records execution status, the [Autonomous Work Loop](WORK_LOOP.md) defines how Codex selects and continues work, and the [Worklog](../WORKLOG.md) preserves detailed completion and verification history.

## Current Status

| Field            | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| Overall status   | Deployed; validation blocked                              |
| Release progress | Baseline in review; external validation blocked           |
| Current batch    | Batch 1 / Group 0 — Tracker and Release Baseline          |
| Next action      | Update, review, and merge PR #1; create and verify v0.1.0 |
| Release state    | NO-GO                                                     |

The public application is deployed and externally reachable through Cloudflare. The selected production topology keeps the web dashboard on Render and runs the privileged deployment plane on a dedicated Ubuntu host, sharing MongoDB Atlas and managed TLS Redis. The public session cookie still omits `Secure`; the worker host and all authenticated/recovery gates remain unverified. See the [Live Workflow Acceptance Checklist](LIVE_WORKFLOW_ACCEPTANCE.md) and [Hybrid Deployment Guide](HYBRID_DEPLOYMENT.md).

## Status Legend

- `Not Started`: Work has not begun.
- `In Progress`: Implementation or verification is active.
- `Blocked`: Progress requires an unmet dependency, external access, or target-host action.
- `In Review`: Work is implemented and awaiting final verification or review.
- `Complete`: All tasks, completion gates, and evidence requirements are satisfied.

## Batch Summary

| Batch | Name                                | Status      | Roadmap coverage |
| ----- | ----------------------------------- | ----------- | ---------------- |
| 1     | Green Quality Baseline              | In Review   | Phases 0–1       |
| 2     | Nginx Privilege Isolation           | Blocked     | Phase 2          |
| 3     | Production Configuration            | Blocked     | Phase 3          |
| 4     | Health and Graceful Shutdown        | In Review   | Phase 4          |
| 5     | Installer and Operational Lifecycle | In Progress | Phase 5          |
| 6     | Real Deployment Validation          | Not Started | Phase 6          |
| 7     | Pilot and Recovery Drills           | Not Started | Phase 7          |
| 8     | Final Release Decision              | Not Started | Phase 8          |

## Remaining Execution Groups

These groups order the remaining batches by dependency and identify work that can be executed together. Group status follows this tracker's status legend; individual live checks continue to use `Passed`, `Failed`, `Blocked`, or `Not Run` in the [Live Workflow Acceptance Checklist](LIVE_WORKFLOW_ACCEPTANCE.md).

| Group | Name                                     | Status      | Dependency                        | Required outcome                                       |
| ----- | ---------------------------------------- | ----------- | --------------------------------- | ------------------------------------------------------ |
| 0     | Tracker and Release Baseline             | In Progress | Clean PR branch and green CI      | Reviewed merge commit and verified annotated `v0.1.0`  |
| 1     | Render Security and Shared Services      | Blocked     | Group 0                           | Exact release deployed and every public check passes   |
| 2     | Ubuntu Worker Plane and Cloudflare Route | Blocked     | Groups 0–1 and guided host access | Isolated worker plane and rollback-safe wildcard route |
| 3     | Deployment and Authenticated Product QA  | Not Started | Group 2                           | Runtime, security, role, and accessibility QA passes   |
| 4     | Upgrade, Rollback, Backup, and Restore   | Not Started | Group 3 and second-host/S3 access | Verified recovery from release and host failures       |
| 5     | Final GO/NO-GO Decision                  | Not Started | Groups 0–4                        | Every release gate has direct evidence                 |

### Group 0 — Tracker and Release Baseline

- Update this tracker and the worklog with dependency-ordered groups and sanitized PR/CI evidence.
- Push the documentation update to draft PR #1 and require the Node.js 22 CI workflow to pass again.
- Review and merge the clean PR into `main`, then create annotated tag `v0.1.0` on the merge commit.
- Record the tag and full commit SHA. Stop on review, CI, merge-state, clean-checkout, or tag-verification failure.

### Group 1 — Render Security and Shared Services

- Configure the Render web service for the supported production start path, Atlas, managed TLS Redis, domains, queue, and existing encryption key through provider secret management.
- Let Render auto-deploy the exact tagged `main` commit and verify its commit identity.
- Require the public checker to pass assets, HTTPS policy, sanitized health/readiness, and `Secure; HttpOnly; SameSite=Strict`.
- If the cookie remains insecure, inspect only bounded production/proxy booleans. Stop on any public, shared-service, configuration, or commit-identity failure.

### Group 2 — Ubuntu Worker Plane and Cloudflare Routing

- Run hybrid-worker preflight, securely deliver the shared configuration, and install immutable `v0.1.0` in worker-only mode.
- Route `*.apps.hellodeploy.online` through the Ubuntu Cloudflare Tunnel and Nginx.
- Verify identities, protected configuration and key permissions, helper socket, systemd, managed Redis mode, `nginx -t`, route transactions, and rollback.
- Prove that no web service runs on the worker host and the public web plane has no Docker/helper path. Stop on unsafe privileges, generated replacement secrets, tunnel failure, or rollback failure.

### Group 3 — Deployment and Authenticated Product QA

- In parallel lanes, deploy every supported runtime and exercise the complete Owner, Maintainer, and Viewer workflow with dedicated QA accounts and a noncritical repository.
- Verify non-root containers, loopback binding, limits, redaction, cleanup, concurrency, broken-candidate continuity, retained-image rollback, and controlled Docker interruption.
- Verify authentication, repository/detection/settings, environment secrets, deployment/logs, domains, maintenance, role boundaries, responsive behavior, keyboard/screen-reader behavior, duplicate submission, and recovery states.
- Stop on secret exposure, unsafe container state, privilege bypass, healthy-release displacement, or an unresolved critical/high defect.

### Group 4 — Upgrade, Rollback, Backup, and Restore

- Create, encrypt, checksum, upload, retrieve, and reverify a backup in private versioned S3-compatible storage.
- Upgrade from `v0.1.0` to a reviewed `v0.1.1`, proving queue pause/drain, candidate verification, routing, and prior queue-state restoration.
- Use a full-SHA, isolated, never-merged failing worker-unit drill commit to prove automatic rollback, then delete its remote branch after sanitized evidence is recorded.
- Restore on the available second clean Ubuntu host, verify a representative project, record RPO/RTO, and drill MongoDB, Redis, Docker, Nginx, worker, and tunnel interruptions.
- Keep the queue paused and stop immediately on rollback- or restore-verification failure.

### Group 5 — Final GO/NO-GO Decision

- Reconcile every batch and live-acceptance row, rerun all release gates, and define monitoring, retention, alert, and incident ownership.
- Resolve every critical/high defect and explicitly accept documented lower-severity risks.
- Mark production `GO` only when cookie, authenticated QA, host isolation, runtime deployment, failed-upgrade rollback, and cross-host restore gates all have direct passing evidence.

### Evidence Safety

- Keep group status here, row-level live results in the acceptance checklist, strategy in the roadmap, and detailed command results in `WORKLOG.md`.
- Never infer host success from local tests or public HTTP evidence.
- Never record credentials, secret values, cookie/session values, private endpoints, internal addresses, or infrastructure identifiers.

## Batch 1 — Green Quality Baseline

**Status:** In Review
**Started:** 2026-07-12T05:39:00+08:00
**Completed:** —
**Objective:** Establish a clean, reproducible release baseline with reliable automated quality gates.
**Dependencies:** Node.js 22+, npm 10+, and access to install locked dependencies.
**Blockers:** Review, merge, and immutable tag creation are required before the release checkout is complete.

### Tasks

- [ ] Confirm the release checkout is clean and based on a reviewed commit.
- [x] Align local-development and production documentation with the Node.js 22 support policy.
- [x] Verify `npm ci` installs from `package-lock.json` without modifying it.
- [x] Run lint, formatting, full tests, production dependency audit, and diff validation.
- [x] Confirm CI runs clean installation, lint, formatting, tests, and the production dependency audit.
- [x] Document the release branch, tag format, and rollback commit/tag policy.
- [x] Record exact command results and test counts in the worklog.

### Verification

```sh
npm ci
npm run lint
npm run format:check
npm test
npm audit --omit=dev --audit-level=moderate
git diff --check
git status --short
```

**Completion gate:** Every required local command and supported-runtime CI job passes, dependency installation leaves tracked files unchanged, and evidence is recorded.
**Evidence:** Local verification on Node.js `v22.23.1` and npm `10.9.8` completed 2026-07-13. `npm ci` installed 314 packages and left `package-lock.json` unchanged (SHA-256 `6363f11311bed8124fecefe42240d0ce5e85a43631456fcc20edde171a968b3e`). Lint, formatting, configuration validation, and all 717 tests passed with no skips; the production dependency audit reported zero vulnerabilities. Draft PR #1 is cleanly mergeable and its Node.js 22 CI run passed installation, lint, formatting, configuration validation, all tests, and the production dependency audit at head commit `85428baacf6cd5b80cf8d3b3aff1a5094e9fd363`. Review, merge, and immutable tag creation remain open.

## Batch 2 — Nginx Privilege Isolation

**Status:** Blocked
**Started:** 2026-07-12T05:49:00+08:00
**Completed:** —
**Objective:** Complete safe route activation while keeping the web process isolated from Docker and Nginx control.
**Dependencies:** Batch 1; supported Ubuntu host with systemd and Nginx.
**Blockers:** Target-host validation requires a supported Ubuntu environment.

### Tasks

- [x] Make route creation, replacement, and removal atomic.
- [x] Validate candidate configuration before activation and preserve the last healthy route on validation or reload failure.
- [ ] Restrict `.env` and GitHub private-key access to only the services that require them.
- [x] Update lifecycle tooling and documentation for the separate web, worker, and route-helper identities.
- [x] Automate ownership and permission checks in post-install diagnostics.
- [ ] Prove the web service cannot access Docker or the privileged route helper.
- [ ] Validate route creation, replacement, removal, rollback, and reload on a clean supported host.

### Verification

- Run focused Nginx helper, route-manager, installer privilege, and path-safety tests.
- Run the full Batch 1 quality gate.
- Record target-host users, groups, socket permissions, route file ownership, `nginx -t`, activation, and rollback results without secrets.

**Completion gate:** The worker activates routes through the constrained helper, the web process has no Docker or Nginx-control access, and invalid configuration leaves the last healthy route active.
**Evidence:** Route transactions now require a successful backup before removal and restore the prior route on candidate-validation or reload failure. Install, upgrade, and verification support an explicit worker-only host role that omits the web service and dashboard ingress, validates worker configuration, and still checks identities, groups, protected metadata, helper socket, service activity, and `nginx -t`. Focused routing/helper/privilege/verifier tests passed locally. Clean-host execution, live reload, and route activation proof remain required.

## Batch 3 — Production Configuration

**Status:** Blocked
**Started:** 2026-07-12T05:52:00+08:00
**Completed:** —
**Objective:** Make valid production configuration start reliably and invalid configuration fail early with safe diagnostics.
**Dependencies:** Batches 1–2 and the intended production GitHub App and routing details.
**Blockers:** The public web and readiness endpoints are running, but the session-cookie result indicates the deployed web runtime or proxy path is not satisfying the production cookie contract. Production start and lifecycle validation now require production mode locally; redeployment plus external revalidation and host-side service-identity evidence remain required.

### Tasks

- [ ] Complete and verify GitHub App configuration, including `GITHUB_APP_NAME`.
- [x] Select and document the production routing mode.
- [x] Align `.env.example`, environment documentation, setup output, and runtime validation.
- [x] Clearly distinguish blocking configuration from optional integrations.
- [ ] Confirm web and worker startup under their intended service identities.
- [x] Confirm invalid secrets, ports, routing settings, unreadable keys, and partial integrations fail before accepting work.
- [x] Confirm diagnostics expose configuration names and statuses but never values.

### Verification

- Run configuration validation and focused configuration tests with valid and intentionally invalid fixtures.
- Start both services with production-equivalent configuration.
- Run the full Batch 1 quality gate.

**Completion gate:** Both services start with valid production configuration, all invalid cases fail safely before listening or processing jobs, and configuration sources agree.
**Evidence:** The hybrid topology now explicitly routes the Render dashboard through `PLATFORM_DOMAIN` and worker-managed wildcard applications through `DEPLOYMENT_DOMAIN` with the local Nginx helper enabled on Ubuntu. Shared queue clients prefer `REDIS_URL`, require `rediss://` for remote production Redis, retain loopback compatibility, and log only bounded modes/error classifications. Supported start/install/upgrade paths require production mode, and the value-safe public checker still fails only the live missing `Secure` attribute. Redeployment, complete GitHub App proof, managed Redis connectivity, and service-identity evidence remain blockers.

## Batch 4 — Health and Graceful Shutdown

**Status:** In Review
**Started:** 2026-07-12T05:53:00+08:00
**Completed:** —
**Objective:** Provide accurate service health signals and bounded, idempotent shutdown behavior.
**Dependencies:** Batches 1–3 and controllable MongoDB and Redis test services.
**Blockers:** None recorded.

### Tasks

- [x] Preserve lightweight web-process liveness.
- [x] Add readiness checks for MongoDB, Redis, and required queue state without exposing topology or secrets.
- [x] Add protected worker readiness or diagnostics visibility.
- [x] Implement bounded graceful web shutdown for `SIGTERM` and `SIGINT`.
- [x] Make worker shutdown idempotent and safe under repeated signals or close errors.
- [x] Add safe fatal-startup and unexpected-process-failure logging.
- [x] Align systemd shutdown timeouts with application drain behavior.

### Verification

- Test healthy and unavailable MongoDB, Redis, and queue states.
- Test repeated shutdown signals, active-request draining, client closure, timeout failure, and worker shutdown errors.
- Verify systemd restarts on a supported host and run the full Batch 1 quality gate.

**Completion gate:** Readiness follows critical dependencies, responses reveal no sensitive details, and service restarts do not abruptly terminate normal in-flight work.
**Evidence:** `/health` remains liveness-only; `/ready` returns sanitized MongoDB, Redis, and queue state with `200/503`. The authenticated admin server page reports BullMQ worker availability using only a connected-worker count and fails closed without exposing Redis client metadata or errors. Web and worker bootstraps install fatal handlers before configuration modules load; startup, uncaught-exception, and unhandled-rejection logs contain only safe classifications before exiting nonzero. Web shutdown has a 25-second deadline under systemd's 30-second stop window. Worker shutdown drains jobs for at most 110 seconds, forces BullMQ closed on timeout, closes Redis/MongoDB idempotently, and returns failure under systemd's 120-second window. Automated readiness and lifecycle tests pass. Live systemd restart proof remains open.

## Batch 5 — Installer and Operational Lifecycle

**Status:** In Progress
**Started:** 2026-07-12T05:56:00+08:00
**Completed:** —
**Objective:** Make installation, upgrade, rollback, backup, and restore reproducible and recoverable.
**Dependencies:** Batches 1–4; clean supported hosts; an approved encrypted off-host backup destination.
**Blockers:** Restore proof requires a second clean host and backup-storage decision.

### Tasks

- [ ] Run comprehensive preflight before host changes and configuration validation before service startup.
- [x] Install immutable release tags or commits with lockfile-reproducible dependencies.
- [ ] Verify service readiness, Nginx configuration, and route activation after installation.
- [x] Refuse unsafe dirty-checkout upgrades and record the prior full commit.
- [x] Make failed upgrades automatically return to a verified working release and record outcomes.
- [ ] Back up required application, database, route, and ingress state to an encrypted access-controlled destination.
- [x] Add explicit failure handling, checksums, and a machine-readable backup manifest.
- [ ] Restore the platform and a representative deployed project on a second clean host and record RPO/RTO results.

### Verification

- Exercise clean install, upgrade, failed-upgrade rollback, uninstall, backup, and restore scripts.
- Verify service identities, permissions, readiness, `nginx -t`, and a known route after each lifecycle action.
- Run the full Batch 1 quality gate.

**Completion gate:** A clean host installs without permission repair, upgrades either succeed fully or roll back safely, and an encrypted backup restores successfully on a second host.
**Evidence:** Install and upgrade require explicit immutable refs, resolve full commits, and use detached checkouts. Worker-only installation requires securely pre-provisioned shared configuration and refuses to generate a different encryption key. Upgrade pauses/drains BullMQ and verifies either candidate or rollback while preserving operator pause state. Backup/restore integrity protections remain in place. Shell syntax and focused lifecycle tests pass; clean-host install, managed Redis connectivity, failed-upgrade execution, encrypted off-host storage, and cross-host restore proof remain open.

## Batch 6 — Real Deployment Validation

**Status:** Not Started
**Started:** —
**Completed:** —
**Objective:** Validate the real Docker-backed deployment pipeline and its security and failure behavior.
**Dependencies:** Batches 1–5 and a staging host with a reachable Docker daemon and production routing path.
**Blockers:** Requires Docker-enabled target-host access.

### Tasks

- [ ] Deploy Static HTML, React, Vue, Express/Node.js, and Next.js applications.
- [ ] Verify containers run non-root, bind published ports only to loopback, and enforce resource limits.
- [ ] Verify secrets do not appear in logs, image history, process arguments, or errors.
- [ ] Exercise symlink escapes, oversized contexts, dangerous build configuration, command injection, and hostile startup processes.
- [ ] Verify failed-build cleanup of workspaces, images, containers, ports, and routes.
- [ ] Test concurrent port allocation at realistic worker concurrency.
- [ ] Confirm a broken candidate never replaces the healthy release and retained-image rollback restores routing.
- [ ] Test Docker interruption and recovery with no job and with a controlled active job.

### Verification

- Run the release smoke test and record application URLs, runtime types, container identity, bindings, limits, and sanitized failure outcomes.
- Inspect Docker and route state after every success and failure scenario.
- Run the full Batch 1 quality gate.

**Completion gate:** Every supported runtime serves through production routing, containers are constrained, failure paths leak no secrets or unsafe state, and rollback meets the documented objective.
**Evidence:** Not recorded.

## Batch 7 — Pilot and Recovery Drills

**Status:** Not Started
**Started:** —
**Completed:** —
**Objective:** Validate realistic product use and operational recovery with a noncritical repository.
**Dependencies:** Batches 1–6, a noncritical GitHub repository, staging ingress, and a second restore host.
**Blockers:** Requires external GitHub, DNS/TLS, notification, ingress, and host access.

### Tasks

- [ ] Complete repository connection, runtime detection, approval, deployment, live logs, status, and notifications as a normal user.
- [ ] Exercise Owner, Maintainer, and Viewer permissions.
- [ ] Exercise automatic, manual, approval-gated, build-filtered, and selected-commit deployments.
- [ ] Deploy a broken commit, confirm continuity, and roll back to a retained release.
- [ ] Exercise custom domains and maintenance mode.
- [ ] Drill MongoDB, Redis, Docker, Nginx, worker, and public-ingress interruptions.
- [ ] Exercise low-disk and high-memory alert scenarios.
- [ ] Restore a backup on the second host and rerun the complete smoke test.
- [ ] Record timings, errors, operator actions, usability friction, and resolved follow-up work.

### Verification

- Follow the pilot and recovery runbooks and attach sanitized logs, timings, screenshots, or command output as appropriate.
- Confirm operator diagnostics use documented logs, correlation IDs, and admin tooling.
- Run the full Batch 1 quality gate after fixes arising from the pilot.

**Completion gate:** The pilot has no unresolved critical or high-severity defect, recovery matches the runbooks, and all results and follow-ups are recorded.
**Evidence:** Not recorded.

## Batch 8 — Final Release Decision

**Status:** Not Started
**Started:** —
**Completed:** —
**Objective:** Make an evidence-backed production go/no-go decision from a clean immutable release.
**Dependencies:** Batches 1–7 and approved operational ownership for monitoring and incidents.
**Blockers:** All incomplete release-gate items are blockers.

### Tasks

- [ ] Review and tag an immutable release commit from a clean checkout.
- [ ] Confirm supported-runtime CI, local quality gates, and production configuration validation.
- [ ] Confirm separate service identities, web privilege isolation, route activation, and route rollback.
- [ ] Confirm dependency health, liveness, readiness, DNS, TLS, and ingress.
- [ ] Confirm all runtime smoke tests and the real-repository pilot.
- [ ] Confirm backup restoration, release upgrade, and release rollback evidence.
- [ ] Define monitoring thresholds, log retention, alert ownership, and incident contacts.
- [ ] Resolve all critical and high-severity defects and explicitly accept documented lower-severity risks.
- [ ] Record the formal GO or NO-GO decision and its evidence.

### Verification

- Rerun every Batch 1 command against the release checkout.
- Review evidence links and completion gates for Batches 1–7.
- Execute the complete production release checklist from the readiness roadmap.

**Completion gate:** Production is `GO` only when every release-blocking roadmap requirement and every final release checklist item is complete with evidence; otherwise it remains `NO-GO`.
**Evidence:** Not recorded.

## Update Rules

- Update the timestamp, current batch, summary row, batch status, dates, blockers, and evidence whenever work advances.
- Set `Started` when a batch first becomes `In Progress`; set `Completed` only when its completion gate is met.
- Link concise evidence here and keep detailed implementation and verification notes in the [Worklog](../WORKLOG.md).
- Do not mark target-host work complete based only on mocks or local source-level tests.
- Keep roadmap requirements mapped to the batch summary; add tasks here if the roadmap gains a new release blocker.
