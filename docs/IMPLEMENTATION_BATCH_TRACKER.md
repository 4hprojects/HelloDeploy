# Implementation Batch Tracker

Updated: 2026-07-12T19:02:25+08:00

This is the authoritative monitor for current HelloDeploy production-readiness work. The [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md) defines release requirements and strategy, this tracker records execution status, the [Autonomous Work Loop](WORK_LOOP.md) defines how Codex selects and continues work, and the [Worklog](../WORKLOG.md) preserves detailed completion and verification history.

## Current Status

| Field          | Value                           |
| -------------- | ------------------------------- |
| Overall status | Blocked                         |
| Current batch  | Batch 2 — Host validation       |
| Next action    | Run Batches 1–5 on target hosts |
| Release state  | NO-GO                           |

The safe local implementation loop is green through the locally executable portions of Batches 1–5. Completion is blocked on review/CI plus supported-host, production-configuration, Nginx/systemd, backup, restore, and real deployment evidence. A batch may be marked `Complete` only after every required task is checked, its completion gate is satisfied, and verification evidence is recorded or linked.

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

## Batch 1 — Green Quality Baseline

**Status:** In Review
**Started:** 2026-07-12T05:39:00+08:00
**Completed:** —
**Objective:** Establish a clean, reproducible release baseline with reliable automated quality gates.
**Dependencies:** Node.js 22+, npm 10+, and access to install locked dependencies.
**Blockers:** Review/commit is required to produce a clean release checkout; remote CI has not yet run on this change set.

### Tasks

- [ ] Confirm the release checkout is clean and based on a reviewed commit.
- [x] Align local-development and production documentation with the Node.js 22 support policy.
- [x] Verify `npm ci` installs from `package-lock.json` without modifying it.
- [x] Run lint, formatting, full tests, production dependency audit, and diff validation.
- [ ] Confirm CI runs clean installation, lint, formatting, tests, and the production dependency audit.
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
**Evidence:** Local verification on Node.js `v22.23.1` and npm `10.9.8` completed 2026-07-12. `npm ci` installed 314 packages and left `package-lock.json` unchanged (SHA-256 `6363f11311bed8124fecefe42240d0ce5e85a43631456fcc20edde171a968b3e`). Lint and formatting passed; all 601 tests passed with no skips; the production dependency audit reported zero vulnerabilities. See the Batch 1 entry in `WORKLOG.md`.

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
- [ ] Update lifecycle tooling and documentation for the separate web, worker, and route-helper identities.
- [x] Automate ownership and permission checks in post-install diagnostics.
- [ ] Prove the web service cannot access Docker or the privileged route helper.
- [ ] Validate route creation, replacement, removal, rollback, and reload on a clean supported host.

### Verification

- Run focused Nginx helper, route-manager, installer privilege, and path-safety tests.
- Run the full Batch 1 quality gate.
- Record target-host users, groups, socket permissions, route file ownership, `nginx -t`, activation, and rollback results without secrets.

**Completion gate:** The worker activates routes through the constrained helper, the web process has no Docker or Nginx-control access, and invalid configuration leaves the last healthy route active.
**Evidence:** Route transactions now require a successful backup before removal and restore the prior route on candidate-validation or reload failure. `infrastructure/verify-installation.sh` automatically checks service identities and groups, `.env`/route-directory/helper-socket metadata, private-key readability, service activity, `nginx -t`, and `/ready`; installer and upgrade run it as a blocking gate. Focused routing/helper/privilege/verifier tests passed locally. Clean-host execution, live reload, and route activation proof remains required.

## Batch 3 — Production Configuration

**Status:** Blocked
**Started:** 2026-07-12T05:52:00+08:00
**Completed:** —
**Objective:** Make valid production configuration start reliably and invalid configuration fail early with safe diagnostics.
**Dependencies:** Batches 1–2 and the intended production GitHub App and routing details.
**Blockers:** Final startup proof requires production-equivalent configuration.

### Tasks

- [ ] Complete and verify GitHub App configuration, including `GITHUB_APP_NAME`.
- [ ] Select and document the production routing mode.
- [ ] Align `.env.example`, environment documentation, setup output, and runtime validation.
- [ ] Clearly distinguish blocking configuration from optional integrations.
- [ ] Confirm web and worker startup under their intended service identities.
- [x] Confirm invalid secrets, ports, routing settings, unreadable keys, and partial integrations fail before accepting work.
- [ ] Confirm diagnostics expose configuration names and statuses but never values.

### Verification

- Run configuration validation and focused configuration tests with valid and intentionally invalid fixtures.
- Start both services with production-equivalent configuration.
- Run the full Batch 1 quality gate.

**Completion gate:** Both services start with valid production configuration, all invalid cases fail safely before listening or processing jobs, and configuration sources agree.
**Evidence:** Production worker configuration now rejects disabled local routing unless external routing is explicitly acknowledged, and focused valid/invalid routing fixtures pass. Real GitHub App credentials, the production routing selection, service-identity startup, and production-equivalent configuration remain external blockers.

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
- [ ] Install immutable release tags or commits with lockfile-reproducible dependencies.
- [ ] Verify service readiness, Nginx configuration, and route activation after installation.
- [x] Refuse unsafe dirty-checkout upgrades and record the prior full commit.
- [ ] Make failed upgrades automatically return to a verified working release and record outcomes.
- [ ] Back up required application, database, route, and ingress state to an encrypted access-controlled destination.
- [x] Add explicit failure handling, checksums, and a machine-readable backup manifest.
- [ ] Restore the platform and a representative deployed project on a second clean host and record RPO/RTO results.

### Verification

- Exercise clean install, upgrade, failed-upgrade rollback, uninstall, backup, and restore scripts.
- Verify service identities, permissions, readiness, `nginx -t`, and a known route after each lifecycle action.
- Run the full Batch 1 quality gate.

**Completion gate:** A clean host installs without permission repair, upgrades either succeed fully or roll back safely, and an encrypted backup restores successfully on a second host.
**Evidence:** `upgrade.sh` now requires an explicit immutable tag or commit, resolves it to a full SHA, uses detached checkouts, rejects dirty production trees before backup, and retains the full prior SHA for rollback. Backups fail closed on missing/failed local MongoDB dumps unless an external snapshot is explicitly acknowledged, include Nginx routing state, SHA-256 checksums, and a JSON manifest; restore verifies integrity before changing services and treats database restore failure as fatal. Install and upgrade run blocking identity, permission, service, Nginx, and dependency-readiness verification. Shell syntax and focused safety tests pass. Queue drain, clean-host lifecycle, encrypted off-host storage, and cross-host restore proof remain open.

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
