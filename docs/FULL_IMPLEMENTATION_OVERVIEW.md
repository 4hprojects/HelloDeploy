# HelloDeploy Full Implementation Overview

Updated: 2026-07-13T16:04:00+08:00

Current release state: **NO-GO**
Local baseline: **717 tests passing**
Pilot state: **Dashboard live on the current Ubuntu 26.04 laptop**
Primary blocker: productionize the current candidate host without disrupting the dashboard, then prove Docker-backed application hosting and recovery.

| Priority | Objective                                | Current status | Remaining outcome                                                    |
| -------- | ---------------------------------------- | -------------- | -------------------------------------------------------------------- |
| 0        | Documentation and release reconciliation | In progress    | Correct and merge green draft PR #5                                  |
| 1        | Safe baseline and service foundation     | Blocked        | Back up, install Docker, and isolate services without dashboard loss |
| 2        | Routing and production cutover           | Blocked        | Route dashboard and wildcard applications through validated Nginx    |
| 3        | Application and product validation       | Not started    | Deploy every runtime and complete authenticated QA                   |
| 4        | Recovery and Ubuntu 26 graduation        | Not started    | Prove rollback/restore and promote candidate OS support              |
| 5        | Release decision                         | Not started    | Review direct evidence and issue formal GO/NO-GO                     |

## Phase 1 — Reconcile Documentation and Release

- Record that the current Ubuntu 26.04 laptop is the live pilot host.
- Distinguish the reachable dashboard from the incomplete application-hosting plane.
- Keep Ubuntu 22.04 and 24.04 supported and Ubuntu 26.04 candidate-supported.
- Revise draft PR #5 and run Node.js 22 CI:
  - Clean `npm ci`
  - Lint
  - Formatting
  - All tests
  - Configuration fixtures
  - Production dependency audit
- Create an immutable release candidate using a full commit SHA or annotated SemVer tag.

Completion: the tracker, architecture, runbooks, evidence, code, and green PR agree before merge.

## Phase 2 — Establish a Safe In-Place Foundation

Use the current Ubuntu 26.04 pilot as the in-place productionization target. Preserve dashboard availability throughout this phase.

- Capture and verify protected backups of configuration, routes, tunnel state, application data, and the current immutable release.
- Define rollback for the current repository-run processes, candidate units, Nginx, and tunnel configuration.
- Add Ubuntu 26.04 candidate validation without declaring general support.
- Install and validate Docker.
- Configure separate identities:
  - `hellodeploy-web`
  - `hellodeploy-worker`
  - Privileged Nginx helper
- Configure MongoDB, Redis, Nginx, systemd, and ingress while retaining the pilot process until candidate readiness passes.
- Provide GitHub App credentials outside source control.
- Enable the constrained local Nginx helper; an external application router is not part of the V1 production topology.
- Run:

```bash
sudo bash infrastructure/verify-installation.sh
```

Completion: every identity, permission, Docker, service, Nginx, readiness, and rollback check passes without losing the live dashboard.

## Phase 3 — Validate service lifecycle

- Confirm `/health` reports process liveness.
- Confirm `/ready` follows MongoDB, Redis, and queue availability.
- Exercise repeated `SIGTERM` and `SIGINT`.
- Confirm web requests drain within the shutdown deadline.
- Confirm worker jobs stop safely.
- Restart services through systemd.
- Test invalid configuration and unreadable private keys.
- Confirm failed upgrades return to the exact previous full commit.
- Implement and verify safe queue pause/drain during upgrades.

Completion: service restarts and upgrades do not corrupt or abruptly abandon normal work.

## Phase 4 — Validate Routing, Cutover, and Isolation

- Prove the web user cannot access Docker.
- Prove the web user cannot access the Nginx helper socket.
- Confirm only the required processes can read secrets.
- Test:
  - Route creation
  - Route replacement
  - Route removal
  - Invalid candidate rejection
  - `nginx -t` failure
  - Reload failure
  - Restoration of the last healthy route
- Confirm all route files are written atomically.
- Correct the inactive dashboard upstream and route the dashboard through Nginx only after readiness passes.
- Add and validate the wildcard application tunnel route.
- Require the production session cookie to include `Secure; HttpOnly; SameSite=Strict`.

Completion: compromised web access cannot become host control, and routing failures preserve live traffic.

## Phase 5 — Prove Recovery and Graduate Ubuntu 26.04

- Choose an encrypted, access-controlled off-host backup destination.
- Decide the database backup mode:
  - Successful local `mongodump`, or
  - Explicitly verified external snapshot
- Create a backup containing:
  - Protected configuration
  - Application data
  - Database data or external snapshot evidence
  - Nginx routes and platform ingress
  - Full release commit
  - JSON manifest
  - SHA-256 checksums
- Restore onto a second clean host.
- Run the installation verifier and application smoke tests.
- Record measured RPO and RTO.

Completion: a verified second host can recover the platform and a representative application.

Ubuntu 26.04 becomes officially supported only after this recovery evidence and the application validation phase both pass.

## Phase 6 — Run real deployment tests

Deploy representative projects for:

- Static HTML
- React
- Vue
- Express
- Generic Node.js
- Supported Next.js configuration

For every runtime, verify:

- Non-root container execution
- Loopback-only published ports
- CPU, memory, process, and log limits
- Health checks
- Live logs
- Route activation
- Retention and rollback
- Container, image, network, workspace, and route cleanup

Exercise hostile and failure scenarios:

- Invalid build commands
- Nested and escaping symlinks
- Oversized build contexts
- Startup crashes
- Failed health checks
- Docker interruptions
- Nginx failures
- Concurrent port allocation
- Secret-leakage attempts
- Broken release while a healthy release is active

Completion: every runtime deploys successfully, and failures leave no leaked secrets or uncontrolled resources.

## Phase 7 — Run the product pilot

Using a noncritical real GitHub repository:

- Create and verify a normal user.
- Connect and approve a repository.
- Detect and configure its runtime.
- Test automatic, manual, and approval-gated deployments.
- Test selected commits and build filters.
- Exercise Owner, Maintainer, Viewer, Admin, and Super Admin permissions.
- Test custom domains, maintenance mode, notifications, and deploy hooks.
- Deploy a broken commit and confirm service continuity.
- Roll back to a retained release.
- Drill MongoDB, Redis, Docker, Nginx, worker, and ingress outages.
- Record errors, timings, usability issues, and operator actions.

Completion: no unresolved critical or high-severity pilot defects.

## Phase 8 — Production release decision

Production becomes **GO** only after:

- The release checkout is clean and immutable.
- CI and all local gates pass.
- Production configuration validation passes.
- Host verification passes.
- Privilege isolation is proven.
- Every supported runtime passes real deployment testing.
- Upgrade and rollback are demonstrated.
- Backup restoration succeeds on a second host.
- Monitoring thresholds, retention, alerts, and incident ownership are defined.
- All critical/high defects are closed.
- Remaining lower risks are explicitly accepted.

Until every release-blocking item has recorded evidence, customer application hosting remains **NO-GO**. The public dashboard remains a live pilot, not proof of the execution plane.
