# Deployment Readiness Roadmap

Updated: 2026-07-13T16:04:00+08:00

## Purpose

This roadmap tracks the work required to move HelloDeploy from late-stage staging/pilot quality to a production-ready release. It is based on a repository, configuration, security, test, operations, and deployment-path audit performed on July 10, 2026.

Work through the phases in order. Phase 0 through Phase 3 contain release-blocking work. Production deployment should not proceed until every blocking acceptance criterion is satisfied.

## Current Readiness Summary

| Area                     | Status            | Summary                                                                                                                       |
| ------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Application architecture | In review         | The single-host V1 boundary is implemented in source; the current Ubuntu 26.04 laptop is the live pilot and hardening target. |
| Security controls        | Strong foundation | CSRF, CSP, authorization, encryption, redaction, webhook validation, and rate limiting are covered.                           |
| Automated checks         | Locally green     | Lint, formatting, configuration validation, and the full local suite pass; reviewed CI evidence remains required.             |
| Production configuration | Blocking          | Public web/readiness is live, but the session cookie lacks `Secure` and the pilot runs outside isolated production units.     |
| Nginx routing            | Blocking          | The dashboard tunnel bypasses an inactive Nginx upstream; helper and wildcard application routing are absent on the pilot.    |
| Deployment validation    | Blocking          | Dashboard availability is confirmed, but Docker is absent and no application-runtime deployment has been proven.              |
| Operations               | Needs validation  | In-place backup, cutover, rollback, interruption, and second-machine restore drills remain.                                   |

## Phase 0 — Establish a Reproducible Release Baseline

**Goal:** Make the intended release state explicit and ensure all contributors and CI use the same supported runtime and commands.

### Tasks

- [ ] Decide whether the current modified and untracked files belong in the release.
- [ ] Review, commit, or intentionally remove every outstanding worktree change.
- [ ] Produce releases only from a clean Git worktree and a reviewed commit.
- [x] Standardize the supported runtime on Node.js 22 across:
  - [x] Root `package.json` `engines`.
  - [x] CI matrices.
  - [x] Installer and preflight checks.
  - [ ] Local development documentation.
  - [ ] Production host documentation.
- [x] Remove Node.js 20 from the supported runtime and CI matrix.
- [ ] Use `npm ci` for clean, lockfile-reproducible release installations where appropriate.
- [ ] Document the release branch, tag format, and rollback commit/tag policy.

### Acceptance criteria

- [ ] The release candidate is represented by one reviewed commit or tag.
- [ ] `git status --short` is empty on the release checkout.
- [ ] CI, development, preflight, and production all declare the same Node.js support policy.
- [ ] A clean clone can install dependencies from `package-lock.json` without modifying it.

## Phase 1 — Restore All Automated Quality Gates

**Goal:** Make the repository's standard validation commands reliable and green.

### Tasks

- [x] Fix the root `npm test` command so it discovers tests consistently on every supported Node.js version and shell.
- [x] Fix the failing preflight test or runtime matrix mismatch.
- [x] Restore test coverage for the refactored accessible admin quota tooltip controls.
- [x] Resolve the 21 files initially reported by Prettier, formatting product files and excluding non-product Claude tooling metadata.
- [ ] Ensure formatting changes do not overwrite intentional user edits.
- [ ] Run the full test suite after formatting and test fixes.
- [ ] Add or retain CI checks for:
  - [ ] Clean dependency installation.
  - [ ] Linting.
  - [ ] Formatting.
  - [ ] Full tests.
  - [x] Production dependency audit.
- [ ] Consider adding a CI assertion that the working tree remains clean after install and checks.

### Required verification

```sh
npm ci
npm run lint
npm run format:check
npm test
npm audit --omit=dev --audit-level=moderate
git diff --check
```

### Acceptance criteria

- [ ] Every required command exits with status 0.
- [ ] All tests pass with no unexpected skips.
- [ ] CI passes on every supported runtime.
- [ ] The dependency audit reports no unresolved moderate-or-higher production vulnerabilities.

## Phase 2 — Correct the Nginx and Host Privilege Model

**Goal:** Make route activation work on a clean production installation without granting the web process host-level control.

### Problem statement

The installer currently creates `/etc/nginx/hellodeploy.d` as `root:root` with mode `755`, while the deployment worker runs as `hellodeploy`. The worker then attempts to write route files and execute `nginx -s reload`. A non-root worker generally cannot perform either action as installed.

The installer also adds the shared `hellodeploy` account to the Docker group while both web and worker processes use that account. This gives the web process the same effective Docker access as the worker, despite comments stating otherwise. Docker socket access is effectively host-root access.

### Tasks

- [x] Choose and document a safe Nginx route-management design: a local, Unix-socket privileged helper.
  - [x] Implement a narrowly scoped privileged route-management service/API.
  - [ ] A root-owned watcher that validates and activates worker-generated candidate files.
  - [ ] Carefully constrained `sudoers` commands with fixed binaries and validated paths.
  - [ ] An external reverse-proxy integration that removes direct Nginx mutation from the worker.
- [ ] Ensure route files are written atomically and validated before activation.
- [ ] Preserve rollback behavior when `nginx -t` or reload fails.
- [x] Split runtime identities:
  - [x] `hellodeploy-web`, without Docker or Nginx privileges.
  - [x] `hellodeploy-worker`, with Docker and local helper-socket access.
- [ ] Restrict `.env` and GitHub private-key access to only the processes that require each secret.
- [x] Replace the shared PM2 process model with systemd services running under the intended identities.
- [ ] Update installer, upgrade, uninstall, backup, restore, and documentation for the new identities.
- [ ] Add installation tests or scripts that verify directory ownership and permissions.
- [ ] Test route creation, replacement, removal, invalid-config rollback, and reload on the current Ubuntu 26.04 candidate host without disrupting the dashboard.

### Acceptance criteria

- [ ] The web process cannot access the Docker socket.
- [ ] Compromising the web process does not directly grant Nginx configuration write/reload access.
- [ ] The worker can deploy and activate a route using the documented installation procedure.
- [ ] Invalid Nginx configuration is rejected and the last healthy route remains active.
- [ ] Ownership and permission checks are automated or included in preflight diagnostics.

## Phase 3 — Validate and Harden Production Configuration

**Goal:** Ensure invalid, incomplete, or contradictory production configuration fails early with actionable diagnostics.

### Tasks

- [ ] Complete the production GitHub App configuration, including `GITHUB_APP_NAME`.
- [ ] Choose one production routing mode:
  - [x] Set `NGINX_ENABLED=true` for the V1 Ubuntu host and constrained local helper path.
  - [x] Remove the external-router acknowledgment from V1 production configuration.
- [x] Resolve the port-range mismatch by reading and validating `PORT_RANGE_START` and `PORT_RANGE_END` in worker configuration.
- [x] Validate numeric environment variables for finite values and safe ranges:
  - [x] `PORT`.
  - [x] `REDIS_PORT`.
  - [x] `WORKER_CONCURRENCY`.
  - [x] `BUILD_TIMEOUT_MS`.
  - [x] Port allocation range.
- [x] Validate `HELLODEPLOY_MASTER_KEY` as exactly 32 decoded bytes during startup.
- [x] Enforce an appropriate minimum strength/length for `SESSION_SECRET` during production startup.
- [x] Fail startup when only part of an integration is configured, such as only one Turnstile key.
- [x] Validate GitHub private-key readability without logging key contents.
- [x] Add a production configuration validation command that reports names/statuses but never values.
- [ ] Make installer/setup output clearly identify blocking and optional configuration.

### Acceptance criteria

- [ ] Both web and worker start successfully with the intended production configuration.
- [ ] Invalid secrets, ports, routing modes, or partial integrations fail before listening for traffic or jobs.
- [ ] Configuration diagnostics never expose secret values.
- [ ] `.env.example`, environment documentation, setup tooling, and runtime behavior agree.

## Phase 4 — Improve Runtime Health and Shutdown Behavior

**Goal:** Give operators and process managers accurate service health signals and safe lifecycle behavior.

### Tasks

- [ ] Keep a lightweight liveness endpoint for detecting a responsive web process.
- [ ] Add a readiness endpoint that verifies critical dependencies, including:
  - [ ] MongoDB connectivity.
  - [ ] Redis connectivity.
  - [ ] Any required queue readiness signal.
- [ ] Do not expose credentials, internal addresses, stack traces, or sensitive topology in health responses.
- [ ] Add worker readiness/diagnostic visibility through the admin server page or a protected mechanism.
- [ ] Add graceful web shutdown for `SIGTERM` and `SIGINT`:
  - [ ] Stop accepting new HTTP connections.
  - [ ] Allow active requests a bounded drain period.
  - [ ] Close Redis clients.
  - [ ] Close MongoDB cleanly.
  - [ ] Exit nonzero if shutdown exceeds its safety timeout.
- [ ] Make worker shutdown idempotent and protect against repeated signals or shutdown errors.
- [ ] Add handling/logging for fatal startup and unexpected process-level failures without leaking secrets.
- [ ] Configure systemd shutdown timeouts to match application drain behavior.

### Acceptance criteria

- [ ] Liveness stays available when appropriate without falsely claiming dependency readiness.
- [ ] Readiness becomes unhealthy when MongoDB or Redis is unavailable.
- [ ] Systemd restarts do not abruptly terminate normal in-flight web requests or worker jobs.
- [ ] Shutdown behavior is covered by automated tests where practical.

## Phase 5 — Harden Installation, Upgrade, Rollback, and Backup Operations

**Goal:** Make routine operations reproducible, observable, and recoverable.

### Installation tasks

- [ ] Run preflight automatically before making host changes.
- [ ] Verify supported Ubuntu, Node.js, npm, Docker daemon, Redis, Nginx, systemd, disk, RAM, permissions, and required binaries.
- [ ] Use pinned release tags or commits rather than deploying a moving branch by default.
- [ ] Use lockfile-reproducible dependency installation.
- [ ] Validate configuration before starting services.
- [ ] Verify web readiness, worker readiness, Nginx configuration, and a route activation after installation.

### Upgrade and rollback tasks

- [ ] Refuse upgrades from a dirty production checkout unless explicitly overridden.
- [ ] Remove `|| true` from Git operations that must succeed.
- [ ] Record the exact previous commit before changing the checkout.
- [ ] Pause the queue and drain or safely stop active jobs before upgrade.
- [ ] Run required release checks before reloading services.
- [x] Replace the process-only health check with systemd status plus HTTP health verification:
  - [ ] Web readiness.
  - [ ] Worker/queue readiness.
  - [ ] `nginx -t`.
  - [ ] A known project route smoke test.
- [ ] Ensure rollback uses a full immutable commit, not an abbreviated reference where ambiguity is possible.
- [ ] Confirm rollback restores dependencies and routing state as well as source code.
- [ ] Record upgrade and rollback outcomes in logs suitable for incident review.

### Backup and restore tasks

- [ ] Define an encrypted, access-controlled off-host backup destination.
- [ ] Protect archives containing `.env`, the master key, database records, and project data.
- [ ] Back up generated Nginx route state and any external tunnel configuration required for recovery.
- [ ] Decide whether local MongoDB backup is required or Atlas snapshots are the authoritative path.
- [ ] Make backup failure explicit; do not report overall success when a required component failed.
- [ ] Add checksums and a machine-readable manifest to backup artifacts.
- [ ] Test restoration onto a second clean host.
- [ ] Record recovery point objective and recovery time objective results.

### Acceptance criteria

- [ ] A clean supported host can install a pinned release without manual permission repair.
- [ ] An upgrade either completes with full readiness or automatically returns to a verified working release.
- [ ] A backup can restore the platform and at least one representative deployed project on another host.
- [ ] Sensitive backups are encrypted at rest and access-controlled.

## Phase 6 — Complete Docker-Backed Security and Deployment Validation

**Goal:** Exercise the real deployment pipeline, not only mocked or unit-tested behavior.

### Tasks

- [ ] Run the release smoke test on a host with a reachable Docker daemon.
- [ ] Deploy representative applications for every supported runtime:
  - [ ] Static HTML.
  - [ ] React.
  - [ ] Vue.
  - [ ] Express/Node.js.
  - [ ] Next.js.
- [ ] Confirm generated containers run as non-root.
- [ ] Confirm published ports bind only to loopback.
- [ ] Confirm CPU, memory, and other resource limits are applied.
- [ ] Confirm secrets do not appear in build output, deployment logs, image history, process arguments, or error messages.
- [ ] Validate malicious or malformed repository cases:
  - [ ] Symlink escape attempts.
  - [ ] Oversized build context.
  - [ ] Dangerous Dockerfile/build configuration.
  - [ ] Command injection payloads.
  - [ ] Startup processes that fork, hang, crash, or ignore signals.
- [ ] Test failed-build cleanup for workspaces, images, containers, ports, and routes.
- [ ] Test concurrent deployment port allocation under realistic worker concurrency.
- [ ] Confirm a broken candidate never displaces the current healthy release.
- [ ] Confirm rollback reuses the intended retained image and restores routing.
- [ ] Test Docker daemon interruption and recovery while no job and while a controlled test job is active.

### Acceptance criteria

- [ ] Every supported runtime deploys and serves traffic through the production routing path.
- [ ] Runtime containers are non-root and resource-constrained.
- [ ] Failure paths leave no unsafe route, leaked secret, or uncontrolled resource residue.
- [ ] Rollback restores service within the documented operational objective.

## Phase 7 — Execute the Staging Pilot and Recovery Drills

**Goal:** Validate the complete product and operating model with realistic users and failure scenarios.

### Product pilot

- [ ] Use a noncritical real GitHub repository.
- [ ] Create and verify a normal user.
- [ ] Connect and approve a repository.
- [ ] Detect runtime and review build settings.
- [ ] Approve and deploy the project.
- [ ] Confirm live logs, deployment status, and notification behavior.
- [ ] Exercise Owner, Maintainer, and Viewer permissions.
- [ ] Exercise automatic, manual, and approval-gated deployments.
- [ ] Exercise build filters and selected-commit deployments.
- [ ] Deploy a broken commit and confirm the healthy release remains live.
- [ ] Roll back to a retained release.
- [ ] Exercise custom domains and maintenance mode.
- [ ] Record timings, errors, usability friction, and operator intervention.

### Recovery drills

- [ ] Restart MongoDB or simulate an outage and validate safe recovery.
- [ ] Restart Redis and confirm queue durability/reconnection.
- [ ] Restart Docker and confirm controlled job behavior.
- [ ] Restart Nginx and verify route continuity/recovery.
- [ ] Stop the worker during a queued and active test job, then verify retry semantics.
- [ ] Interrupt the Cloudflare Tunnel or public ingress and verify safe recovery.
- [ ] Exercise low-disk and high-memory alerts or simulations.
- [ ] Restore a backup on a second host and run the full smoke test.

### Acceptance criteria

- [ ] The documented pilot completes without an unresolved critical or high-severity defect.
- [ ] Recovery behavior matches the operations runbooks.
- [ ] Operators can diagnose failures using documented logs, correlation IDs, and admin tooling.
- [ ] Pilot findings and resolved follow-up work are recorded in `WORKLOG.md`.

## Phase 8 — Final Production Release Gate

**Goal:** Make a formal, evidence-backed go/no-go decision.

### Release checklist

- [ ] Release commit/tag is reviewed, immutable, and checked out cleanly.
- [ ] CI is green on every supported runtime.
- [ ] Lint, formatting, tests, and dependency audit pass.
- [ ] Production environment validation passes without exposing values.
- [ ] Web and worker start under separate intended identities.
- [ ] Web has no Docker socket or Nginx-control access.
- [ ] Nginx route activation and rollback pass on the target host.
- [ ] MongoDB, Redis, Docker, Nginx, systemd services, DNS, TLS, and ingress are healthy.
- [ ] Liveness and readiness endpoints behave correctly.
- [ ] All supported runtime smoke tests pass.
- [ ] Real-repository pilot is complete.
- [ ] Backup restoration has been demonstrated on a second host.
- [ ] Upgrade and rollback have been demonstrated using release artifacts.
- [ ] Monitoring thresholds, log retention, alert ownership, and incident contacts are defined.
- [ ] No unresolved critical or high-severity security or reliability defects remain.
- [ ] Remaining lower-severity risks are documented and explicitly accepted.

### Go/no-go rule

Production deployment is **GO** only when every release-blocking item in Phases 0–3 and every Phase 8 checklist item is complete. Any failure in routing, privilege isolation, automated checks, configuration validation, real deployment smoke testing, or restore testing is a **NO-GO**.

## Recommended Tracking Fields

When moving tasks into the phase tracker or issue system, record:

| Field           | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| Owner           | Person responsible for completion.                             |
| Priority        | Blocker, high, medium, or low.                                 |
| Target release  | Release tag or milestone.                                      |
| Evidence        | PR, CI run, test output, screenshot, or runbook record.        |
| Risk            | Security, availability, data loss, deployment, or operability. |
| Status          | Not started, in progress, blocked, in review, or complete.     |
| Acceptance date | Date the acceptance criteria were verified.                    |

## Historical Audit Evidence Snapshot

The initial audit observed the following results. These are a baseline, not substitutes for rerunning checks after fixes.

| Check                            | Result                                                      |
| -------------------------------- | ----------------------------------------------------------- |
| ESLint                           | Passed                                                      |
| Prettier                         | Failed; 21 files reported                                   |
| Standard `npm test`              | Failed during test discovery                                |
| Explicit full test run           | 588 passed, 2 failed, 590 total                             |
| Production dependency audit      | Passed; 0 known vulnerabilities                             |
| Redis connectivity               | Passed                                                      |
| Docker CLI                       | Installed                                                   |
| Docker daemon                    | Not reachable in audit environment                          |
| Nginx                            | Installed                                                   |
| systemd                          | Available in audit environment                              |
| Node.js                          | 20.20.2; project preflight requires 22 or newer             |
| Host OS                          | Ubuntu 26.04; candidate status pending full host validation |
| Current production worker config | Blocking because Nginx is disabled without acknowledgement  |
| GitHub App config                | Incomplete because `GITHUB_APP_NAME` is missing             |

## Current Local Pilot Evidence Snapshot

Observed directly on 2026-07-13. This replaces assumptions about where the public dashboard runs but does not replace the historical audit or prove production readiness.

| Check                         | Result                                                                    |
| ----------------------------- | ------------------------------------------------------------------------- |
| Host OS                       | Ubuntu 26.04 LTS candidate platform                                       |
| Web and worker                | Running from the repository under the interactive account                 |
| Redis                         | Local service active; `redis-cli ping` returned `PONG`                    |
| Local/public readiness        | `/health` and `/ready` returned `200`                                     |
| Cloudflare dashboard route    | Active and connected directly to the local web port                       |
| Public policy                 | Homepage, assets, HSTS, CSP, sign-in, and readiness pass                  |
| Session cookie                | Failed because `Secure` is missing                                        |
| Docker                        | CLI and socket absent                                                     |
| HelloDeploy identities/units  | Absent                                                                    |
| Nginx/helper application path | Dashboard upstream inactive; helper, route directory, and wildcard absent |

The next production work is an availability-preserving in-place migration on this host. Ubuntu 26.04 becomes supported only after the installer, Docker plane, isolation, routing, deployment, rollback, interruption, and recovery gates pass.
