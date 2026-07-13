# Live Workflow Acceptance Checklist

Updated: 2026-07-13T16:04:00+08:00

## Status Contract

Use exactly one status for every check:

- **Passed** — observed directly with evidence appropriate to the boundary.
- **Failed** — executed and did not satisfy the expected result.
- **Blocked** — cannot run without named access, infrastructure, or coordination.
- **Not Run** — runnable but not yet executed.

Public HTTP evidence never proves authenticated behavior, host isolation, Docker behavior, upgrade recovery, or backup restoration. Evidence must exclude credentials, cookie values, session identifiers, secret values, internal addresses, and private service identifiers.

## Product and Architecture Boundary

| Check                    | Expected result                                                                 | Status | Evidence or next action                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| Product responsibility   | HelloDeploy builds, runs, routes, and rolls back hosted projects itself         | Passed | Blueprint, web/worker code, Docker pipeline, and Nginx routing establish HelloDeploy as the hosting layer   |
| V1 topology              | One administrator-controlled Ubuntu host with privilege-separated services      | Passed | Canonical target is defined in the blueprint and product architecture                                       |
| Repository conformance   | Installer, preflight, tests, and runbooks expose only the supported V1 topology | Passed | Local source and focused tests contain only the complete V1 platform role; supported-host proof is separate |
| Multi-node/remote worker | Remains deferred until an approved ADR and implementation plan                  | Passed | Blueprint decision log explicitly defers this capability                                                    |

## Public Production Boundary

| Check            | Expected result                                         | Status | Evidence or next action                                                                                                                                            |
| ---------------- | ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public homepage  | HTTPS response through the configured public edge       | Passed | `https://hellodeploy.online/` returned `200` through Cloudflare on 2026-07-13                                                                                      |
| Sign-in page     | Authentication entry point is reachable                 | Passed | `/auth/sign-in` returned `200`                                                                                                                                     |
| Liveness         | Sanitized web-process response                          | Passed | `/health` returned `200` with service and timestamp only                                                                                                           |
| Readiness        | Sanitized MongoDB, Redis, and queue state               | Passed | `/ready` returned `200`; all three named checks were true                                                                                                          |
| HTTPS policy     | HSTS and CSP present                                    | Passed | Public response included HSTS and the application CSP                                                                                                              |
| Frontend release | Deployed asset identifiers match the evaluated checkout | Passed | The production check found the JavaScript and stylesheet identifiers extracted from this checkout; this does not prove the target host topology or exact release   |
| Session cookie   | `Secure; HttpOnly; SameSite=Strict`                     | Failed | The fresh public check reports `missing secure`; validate production mode and trusted HTTPS forwarding on the actual HelloDeploy ingress, then restart and recheck |

## Local Ubuntu 26.04 Pilot Host

Observed directly on the current host on 2026-07-13. Ubuntu 26.04 is a candidate platform until installation, deployment, rollback, and recovery gates pass; these observations do not promote it to supported status.

| Check                        | Expected result                                                    | Status  | Evidence or next action                                                                                           |
| ---------------------------- | ------------------------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------- |
| Host identity                | The inspected machine is the active local HelloDeploy pilot        | Passed  | Web, worker, and the HelloDeploy tunnel run from the current Ubuntu 26.04 host                                    |
| Web and worker               | Both repository-run processes are active                           | Passed  | The workspace start process has active web and worker children under the interactive account                      |
| Local Redis                  | The configured local queue dependency responds                     | Passed  | `redis-cli ping` returned `PONG`                                                                                  |
| Local health and readiness   | The active web port returns sanitized healthy responses            | Passed  | Local `/health` and `/ready` returned `200`                                                                       |
| Dashboard tunnel             | Public dashboard traffic reaches the active local web process      | Passed  | The HelloDeploy tunnel maps the dashboard hostnames directly to the active web port                               |
| Production cookie            | Public sessions use `Secure; HttpOnly; SameSite=Strict`            | Failed  | The sanitized public checker reports `missing secure`                                                             |
| Docker execution plane       | Docker is installed, active, and available only to the worker path | Blocked | Docker CLI and socket are absent; no real application container can be validated                                  |
| Isolated service identities  | Web, worker, and helper run as separate systemd identities         | Blocked | HelloDeploy identities and units are absent; current processes run from the repository under the interactive user |
| Constrained routing helper   | Helper socket and managed application route directory are active   | Blocked | The helper runtime directory and HelloDeploy Nginx route directory are absent                                     |
| Dashboard Nginx path         | Nginx routes the dashboard to the active candidate web service     | Blocked | The configured Nginx upstream has no listener; the tunnel currently bypasses Nginx                                |
| Wildcard application ingress | `*.apps.hellodeploy.online` reaches managed project routes         | Blocked | The current tunnel has dashboard routes but no wildcard application route                                         |
| Upgrade and rollback         | In-place candidate failure restores the live pilot                 | Blocked | Requires backup, immutable candidate, isolated units, queue control, and privileged execution                     |
| Backup and restore           | Encrypted backup restores on a second machine                      | Blocked | No cross-machine restore evidence has been recorded                                                               |

## Project-Owner Workflow

Use a user-guided session or restricted staging account. Do not share credentials.

| Stage                  | Action and expected feedback                                                                                  | Recovery expectation                                                      | Status  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------- |
| Authentication         | Sign in, confirm authenticated navigation, then sign out and invalidate the session                           | Generic errors; no account enumeration                                    | Blocked |
| Repository             | Connect GitHub App access, choose repository and branch, and show connected state                             | Actionable incomplete-integration or access error                         | Blocked |
| Detection              | Run detection and review runtime, commands, output directory, port, filters, and warnings                     | Retry without losing safe submitted values                                | Blocked |
| Settings               | Edit one group, Save/Cancel, validate fragments, pending states, focus restoration, and server errors         | Return to the active group with inline errors                             | Blocked |
| Environment import     | Select `.env`, see detected count and replacement warning, confirm import, and receive imported count         | Reject invalid/oversized files without partial writes or reflected values | Blocked |
| Stored secrets         | Verify masked display, audited reveal, Show/Hide, Clear, blank-means-unchanged replacement, and deletion      | Plaintext remains page-scoped and responses remain `no-store`             | Blocked |
| Deployment             | Choose mode, trigger a manual deploy, prevent duplicates, follow live stages/logs, and reach a terminal state | Reconnect logs and retain the healthy release after candidate failure     | Blocked |
| Domain and maintenance | Add/verify a domain, observe approval state, enable/disable maintenance                                       | Actionable DNS/routing errors and safe built-in fallback                  | Blocked |
| Authorization          | Repeat relevant reads and mutations as Owner, Maintainer, and Viewer                                          | Owner-only controls absent and direct mutations rejected                  | Blocked |
| Accessibility          | Complete supported actions on desktop/mobile with keyboard and screen reader                                  | Errors and pending states announced; focus remains logical                | Blocked |

## Operator Lifecycle Workflow

| Stage         | Expected result                                                                                            | Stop condition                                                         | Status  |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------- |
| Preflight     | Supported or candidate Ubuntu, Node/npm, Docker, Redis, Nginx, systemd, capacity, and tools pass           | Any blocking preflight failure                                         | Blocked |
| Configuration | Web and worker validation pass on the V1 host with one database, queue, encryption key, and routing policy | Missing, invalid, partial, insecure Redis, or unreadable configuration | Blocked |
| Installation  | Immutable full-platform release installs web, worker, helper, Nginx integration, and protected config      | Permission repair, regenerated existing secrets, or unverified startup | Blocked |
| Verification  | Identities, protected files, helper socket, Nginx, services, and `/ready` pass                             | Web has Docker/helper access or routing validation fails               | Blocked |
| Real deploy   | Every supported runtime serves through production routing with non-root and resource limits                | Secret leak, unsafe binding, residue, or healthy-release displacement  | Blocked |
| Upgrade       | Backup verifies; queue pauses/drains; candidate installs and verifies before prior queue state is restored | Drain timeout, candidate verification failure, or unknown queue state  | Blocked |
| Rollback      | Previous full commit, dependencies, units, ingress, services, readiness, and queue state restore           | Critical rollback-verification failure; keep queue paused              | Blocked |
| Backup        | Required state is complete, checksummed, encrypted, access-controlled, and stored off-host                 | Missing database/route/config state or failed integrity check          | Blocked |
| Restore       | Second clean host restores the platform and representative project with recorded RPO/RTO                   | Integrity, startup, route, or representative-project failure           | Blocked |

## Production Decision

Current decision: **NO-GO for customer application hosting**. The dashboard is a verified live local pilot, but the failed session-cookie check and every authenticated, privilege-isolation, Docker, wildcard-routing, upgrade-recovery, and cross-host-restore row must pass directly before a GO decision. Public dashboard availability is not evidence that hosted project deployment works.
