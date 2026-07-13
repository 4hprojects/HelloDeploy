# Implementation Batch Tracker

Updated: 2026-07-13T19:27:50+08:00

This is the authoritative monitor for current HelloDeploy production-readiness work. The [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md) defines release requirements and strategy, this tracker records execution status, the [Autonomous Work Loop](WORK_LOOP.md) defines how Codex selects and continues work, and the [Worklog](../WORKLOG.md) preserves detailed completion and verification history.

## Current Status

| Field            | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| Overall status   | Live local pilot; productionization pending               |
| Release progress | `v0.1.1` published; `v0.1.2` baseline tooling in progress |
| Current batch    | Priority 1 — Safe In-Place Baseline                       |
| Next action      | Publish `v0.1.2`, then attach and confirm recovery media  |
| Release state    | NO-GO for customer application hosting                    |

The current Ubuntu 26.04 laptop is the existing HelloDeploy pilot host, not a separate workstation controlling another server. It runs the web and worker from the repository, local Redis, and a Cloudflare Tunnel that sends dashboard traffic directly to the web process. Public liveness and readiness pass. It does not yet provide the complete production application-hosting plane: Docker, isolated HelloDeploy service identities, systemd units, the constrained Nginx helper, the application route directory, and wildcard application ingress are absent. The public session cookie also omits `Secure`. Ubuntu 26.04 remains a candidate platform until installation, deployment, rollback, and recovery evidence passes.

## Status Legend

- `Not Started`: Work has not begun.
- `In Progress`: Implementation or verification is active.
- `Blocked`: Progress requires an unmet dependency, external access, or target-host action.
- `In Review`: Work is implemented and awaiting final verification or review.
- `Complete`: All tasks, completion gates, and evidence requirements are satisfied.

## Batch Summary

| Batch | Name                                | Status      | Roadmap coverage |
| ----- | ----------------------------------- | ----------- | ---------------- |
| 1     | Green Quality Baseline              | Complete    | Phases 0–1       |
| 2     | Nginx Privilege Isolation           | Blocked     | Phase 2          |
| 3     | Production Configuration            | Blocked     | Phase 3          |
| 4     | Health and Graceful Shutdown        | In Review   | Phase 4          |
| 5     | Installer and Operational Lifecycle | In Progress | Phase 5          |
| 6     | Real Deployment Validation          | Not Started | Phase 6          |
| 7     | Pilot and Recovery Drills           | Not Started | Phase 7          |
| 8     | Final Release Decision              | Not Started | Phase 8          |

## Remaining Execution Groups

These groups order the remaining batches by dependency and identify work that can be executed together. Group status follows this tracker's status legend; individual live checks continue to use `Passed`, `Failed`, `Blocked`, or `Not Run` in the [Live Workflow Acceptance Checklist](LIVE_WORKFLOW_ACCEPTANCE.md).

| Priority | Group                                    | Status      | Dependency                              | Required outcome                                             |
| -------- | ---------------------------------------- | ----------- | --------------------------------------- | ------------------------------------------------------------ |
| 0        | Documentation and Release Reconciliation | Complete    | Green PR #5 merged                      | Repository and PR describe the observed local pilot          |
| 1        | Safe In-Place Baseline                   | In Progress | Priority 0 and privileged authorization | Verified backup, inventory, immutable ref, and rollback path |
| 1        | Production Service Foundation            | Blocked     | Safe baseline and privileged access     | Docker and isolated services work on Ubuntu 26.04            |
| 2        | Routing and Production Cutover           | Blocked     | Service foundation                      | Nginx and wildcard ingress cut over without dashboard loss   |
| 3        | Application and Product Validation       | Not Started | Production routing                      | Runtime, role, secret, and accessibility QA passes           |
| 4        | Recovery and Ubuntu 26 Graduation        | Not Started | Validated application plane             | Upgrade, rollback, restore, and OS-support evidence passes   |
| 5        | Final GO/NO-GO Decision                  | Not Started | Priorities 0–4                          | Every release gate has direct evidence                       |

### Priority 0 — Documentation and Release Reconciliation

- Treat commercial dashboard screenshots as UX references only; HelloDeploy builds and hosts applications itself.
- Record the current Ubuntu 26.04 laptop as the live pilot host and remove the assumption that a different Ubuntu host is required for initial productionization.
- Keep Ubuntu 22.04 and 24.04 supported; classify Ubuntu 26.04 as candidate support until its host and recovery gates pass.
- Revise draft PR #5, rerun CI, review, and merge only after the repository and evidence agree.

**Evidence:** Commit `3db74be` removed the unsupported vendor-dashboard, remote-worker, worker-only lifecycle, and external-router paths. Direct inspection on 2026-07-13 then proved that the current Ubuntu 26.04 laptop is the live pilot host. Commit `80a439b` reconciled the documentation and focused contract test with that evidence. PR #5 passed Node.js 22 CI, received a final local implementation/security diff review, and merged on 2026-07-13 at full commit `789b903157b3872d26c82721a9628063f8d82cc4`. GitHub recorded no separate submitted reviewer approval. No release tag was moved or invented; `v0.1.1` remains the latest published release.

### Priority 1 — Safe In-Place Baseline

- Capture a sanitized inventory and verified backup of the current environment, Nginx, tunnel, processes, repository release, and required state before host changes.
- [x] Add a read-only, value-safe host-baseline command for repeatable inventory evidence.
- [x] Add fail-closed Ubuntu 26.04 candidate checks and tests without declaring general support.
- [x] Add a fail-closed encrypted pilot-backup command and non-mutating verifier.
- [x] Add an inactive in-place installer preparation mode that preserves reviewed configuration and leaves ingress/services untouched.
- Define the exact service, Nginx, tunnel, and repository rollback path while the current dashboard remains available.
- Stop if current health, backup integrity, immutable release identity, or rollback preparation fails.

**Local and CI evidence:** Preflight and installation now reject Ubuntu 26.04 by default and require separate explicit acknowledgments. The shared classifier keeps 22.04/24.04 supported, labels 26.04 candidate, and rejects other releases. On the pilot, default preflight reports three blockers; candidate acknowledgment clears only the OS row and leaves both missing Docker checks failed. The read-only baseline command reports only bounded platform, release, prerequisite, service, identity, routing, health, and blocker fields. Its first pilot run confirmed healthy local endpoints and the previously recorded missing Docker, identities, units, helper, managed routes, and wildcard ingress. The pilot-backup path requires clean immutable state, a verified external database snapshot, required active configurations, root-owned private rollback instructions and destination, and an exact GPG fingerprint. Its verifier uses a fixed member/checksum allowlist, rejects duplicates and link/device members, and checks every payload checksum without restoring. Static and functional malicious-archive tests pass. Actual encrypted off-host creation, retrieval verification, and the rehearsed rollback baseline remain required before any installer or host mutation.

The current PM2 web and worker processes started before several later checkout changes, so the active runtime is not attributable to the current checkout or a single reviewed tag. The protected workflow therefore requires a verified emergency capture followed by a controlled restart on `v0.1.2`, production-cookie validation, and a second final capture before the backup and rollback acknowledgements can be used. The three-commit release candidate passed focused checks and an isolated Node.js 22/npm 10 clean-worktree gate with 747 tests. Draft PR #6 passed its Node.js 22 CI at the reviewed three-commit head; final merge and tag verification remain required.

### Priority 1 — Production Service Foundation

- Install and validate Docker, the web/worker/helper identities, protected files, helper socket, and systemd units on the current host.
- Keep the repository-run pilot processes available until replacement services pass readiness and authorization checks.
- Prove the web identity cannot access Docker or the helper while the worker can perform only the required deployment operations.
- Stop on unsafe group membership, regenerated secrets, permission repair, service failure, or loss of the current dashboard.

**Local preparation evidence:** The installer now has a fail-closed `HELLODEPLOY_PREPARE_ONLY=true` path for the pilot. Ubuntu 26.04 requires distinct candidate, off-host-backup, and rollback-baseline acknowledgements. Preparation requires a root-owned private reviewed configuration outside the checkout, copies it unchanged, and refuses existing active/enabled HelloDeploy units. It does not generate secrets, run setup, add the global Nginx include, configure platform ingress, or enable/start services. Before returning, a read-only verifier checks the expected full commit, clean checkout, identities, protected files, Docker allow/deny boundary, inactive/disabled units, absent helper socket, free candidate port, existing Nginx syntax, and both production configurations. Focused installer and workflow tests pass; no host preparation has been executed because the real backup gate remains blocked.

### Priority 2 — Routing and Production Cutover

- Correct the inactive Nginx dashboard upstream and install the constrained project route directory and helper path.
- Add `*.apps.hellodeploy.online` to the existing tunnel while retaining the dashboard routes.
- Validate candidate Nginx, dashboard readiness, wildcard routing, route activation/replacement/removal, and rollback before switching traffic.
- Run the web service in production mode and require `Secure; HttpOnly; SameSite=Strict` after cutover.

### Priority 3 — Application and Product Validation

- Deploy Static, React, Vue, Express, generic Node.js, and supported Next.js samples through the wildcard route.
- Verify non-root containers, loopback binding, limits, redaction, cleanup, concurrency, broken-candidate continuity, and retained-image rollback.
- Exercise authentication, repository/detection/settings, environment secrets, deployment/logs, domains, maintenance, role boundaries, responsive behavior, accessibility, duplicate submission, and recovery states.
- Stop on secret exposure, unsafe container state, privilege bypass, healthy-release displacement, or an unresolved critical/high defect.

### Priority 4 — Recovery and Ubuntu 26 Graduation

- Prove a successful upgrade and an intentionally failed candidate with automatic restoration of release, dependencies, units, ingress, services, readiness, routing, and queue state.
- Create and verify an encrypted off-host backup, then restore it on a second machine with a representative project and recorded RPO/RTO.
- Drill MongoDB, Redis, Docker, Nginx, worker, and tunnel interruptions.
- Promote Ubuntu 26.04 from candidate to supported only after installation, deployment, rollback, interruption, and restore evidence passes.

### Priority 5 — Final GO/NO-GO Decision

- Reconcile every batch and live-acceptance row, rerun every release gate, and define monitoring, retention, alert, and incident ownership.
- Resolve every critical/high defect and explicitly accept documented lower-severity risks.
- Mark customer application hosting `GO` only when cookie, authenticated QA, host isolation, runtime deployment, failed-upgrade rollback, and cross-host restore gates all pass directly.

### Evidence Safety

- Keep group status here, row-level live results in the acceptance checklist, strategy in the roadmap, and detailed command results in `WORKLOG.md`.
- Never infer host success from local tests or public HTTP evidence.
- Never record credentials, secret values, cookie/session values, private endpoints, internal addresses, or infrastructure identifiers.

## Batch 1 — Green Quality Baseline

**Status:** Complete
**Started:** 2026-07-12T05:39:00+08:00
**Completed:** 2026-07-13T14:29:00+08:00
**Objective:** Establish a clean, reproducible release baseline with reliable automated quality gates.
**Dependencies:** Node.js 22+, npm 10+, and access to install locked dependencies.
**Blockers:** None.

### Tasks

- [x] Confirm the release checkout is clean and based on a reviewed commit.
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
**Evidence:** Local verification on Node.js `v22.23.1` and npm `10.9.8` completed 2026-07-13. `npm ci` installed 314 packages and left `package-lock.json` unchanged (SHA-256 `6363f11311bed8124fecefe42240d0ce5e85a43631456fcc20edde171a968b3e`). Lint, formatting, configuration validation, and all 717 tests passed with no skips; the production dependency audit reported zero vulnerabilities. PR #1 passed Node.js 22 CI, was merged as reviewed commit `740b9a83d4414bf85b97894ea6a1dca0056cfc9e`, and annotated tag `v0.1.0` was published and verified to resolve to that full commit.

## Batch 2 — Nginx Privilege Isolation

**Status:** Blocked
**Started:** 2026-07-12T05:49:00+08:00
**Completed:** —
**Objective:** Complete safe route activation while keeping the web process isolated from Docker and Nginx control.
**Dependencies:** Batch 1; the current Ubuntu 26.04 candidate host with systemd and Nginx.
**Blockers:** Privileged in-place validation requires a verified backup, rollback plan, Docker installation, and explicit authorization.

### Tasks

- [x] Make route creation, replacement, and removal atomic.
- [x] Validate candidate configuration before activation and preserve the last healthy route on validation or reload failure.
- [ ] Restrict `.env` and GitHub private-key access to only the services that require them.
- [x] Update lifecycle tooling and documentation for the separate web, worker, and route-helper identities.
- [x] Automate ownership and permission checks in post-install diagnostics.
- [ ] Prove the web service cannot access Docker or the privileged route helper.
- [ ] Validate route creation, replacement, removal, rollback, and reload on the current candidate host without disrupting the dashboard.

### Verification

- Run focused Nginx helper, route-manager, installer privilege, and path-safety tests.
- Run the full Batch 1 quality gate.
- Record target-host users, groups, socket permissions, route file ownership, `nginx -t`, activation, and rollback results without secrets.

**Completion gate:** The worker activates routes through the constrained helper, the web process has no Docker or Nginx-control access, and invalid configuration leaves the last healthy route active.
**Evidence:** Route transactions now require a successful backup before removal and restore the prior route on candidate-validation or reload failure. Separate web, worker, and helper identities plus automated metadata checks are implemented in source. The inspected pilot does not yet have those identities, units, helper paths, or Docker. Focused tests pass; in-place activation, live reload, rollback, and denial-of-privilege proof remain required.

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
**Evidence:** `PLATFORM_DOMAIN` identifies the HelloDeploy dashboard and `DEPLOYMENT_DOMAIN` identifies the application wildcard in source. Shared queue clients prefer `REDIS_URL`, require `rediss://` for remote production Redis, retain loopback compatibility, and log only bounded modes/error classifications. Supported start/install/upgrade paths require production mode. On the pilot, the dashboard tunnel currently bypasses Nginx, wildcard ingress is absent, and the value-safe public checker fails the missing `Secure` attribute. Complete GitHub App proof, production-unit startup, shared-service connectivity, ingress cutover, and service-identity evidence remain blockers.

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
**Evidence:** Install and upgrade require explicit immutable refs, resolve full commits, and use detached checkouts. Upgrade pauses/drains BullMQ and verifies either candidate or rollback while preserving operator pause state. Backup/restore integrity protections remain in place. The superseded worker-only branches are removed without weakening immutable-release, queue, rollback, or secret-preservation safeguards. Shell syntax and focused lifecycle tests pass; aligned full-host installation, Redis connectivity, failed-upgrade execution, encrypted off-host storage, and cross-host restore proof remain open.

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
