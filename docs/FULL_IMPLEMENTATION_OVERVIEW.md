# HelloDeploy Full Implementation Overview

Current release state: **NO-GO**
Local baseline: **717 tests passing**
Primary blocker: validate the reconciled complete self-hosted platform on a supported Ubuntu host.

| Batch | Objective                  | Current status           | Remaining outcome                                              |
| ----- | -------------------------- | ------------------------ | -------------------------------------------------------------- |
| 1     | Green quality baseline     | In review                | Review changes, create clean commit, run CI                    |
| 2     | Nginx privilege isolation  | Blocked on host          | Prove identities, permissions, routing, reload, and rollback   |
| 3     | Production configuration   | Blocked on configuration | Supply GitHub App settings and select routing mode             |
| 4     | Health and shutdown        | In review                | Add worker diagnostics and prove systemd restart behavior      |
| 5     | Installation and recovery  | In progress              | Queue draining, encrypted off-host backup, second-host restore |
| 6     | Real deployment validation | Not started              | Deploy every runtime and exercise failure/security scenarios   |
| 7     | Pilot and recovery drills  | Not started              | Run realistic user, outage, rollback, and recovery workflows   |
| 8     | Release decision           | Not started              | Review all evidence and issue formal GO/NO-GO                  |

## Phase 1 — Prepare a release candidate

- Review the accumulated code and documentation changes.
- Resolve any unintended worktree changes.
- Commit the intended implementation to a reviewed branch.
- Run Node.js 22 CI:
  - Clean `npm ci`
  - Lint
  - Formatting
  - All tests
  - Configuration fixtures
  - Production dependency audit
- Create an immutable release candidate using a full commit SHA or annotated SemVer tag.

Completion: a clean, reviewed commit with passing CI.

## Phase 2 — Build the staging host

Use a clean Ubuntu 22.04 or 24.04 host.

- Install using the immutable release reference.
- Configure separate identities:
  - `hellodeploy-web`
  - `hellodeploy-worker`
  - Privileged Nginx helper
- Configure MongoDB, Redis, Docker, Nginx, systemd, and ingress.
- Provide GitHub App credentials outside source control.
- Enable the constrained local Nginx helper; an external application router is not part of the V1 production topology.
- Run:

```bash
sudo bash infrastructure/verify-installation.sh
```

Completion: every identity, permission, service, Nginx, and readiness check passes.

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

## Phase 4 — Validate routing and isolation

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

Completion: compromised web access cannot become host control, and routing failures preserve live traffic.

## Phase 5 — Prove backup and recovery

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

Until every release-blocking item has recorded evidence, HelloDeploy remains **NO-GO**.
