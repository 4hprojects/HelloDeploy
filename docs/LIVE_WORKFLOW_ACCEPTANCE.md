# Live Workflow Acceptance Checklist

Updated: 2026-07-31T00:33:54+08:00

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

| Check             | Expected result                                                     | Status | Evidence or next action                                                                                                             |
| ----------------- | ------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Public homepage   | HTTPS response through the configured public edge                   | Passed | `https://hellodeploy.online/` returned `200` through Cloudflare on 2026-07-13                                                       |
| Sign-in page      | Authentication entry point is reachable                             | Passed | `/auth/sign-in` returned `200`                                                                                                      |
| Liveness          | Sanitized web-process response                                      | Passed | `/health` returned `200` with service and timestamp only                                                                            |
| Readiness         | Sanitized MongoDB, Redis, and queue state                           | Passed | `/ready` returned `200`; all three named checks were true                                                                           |
| HTTPS policy      | HSTS and CSP present                                                | Passed | Public response included HSTS and the application CSP                                                                               |
| Frontend release  | Deployed asset identifiers match the evaluated checkout             | Failed | The 2026-07-31 production check found one candidate asset missing because the PM2 web has not been cut over to the merged candidate |
| Session cookie    | `Secure; HttpOnly; SameSite=Strict`                                 | Passed | The production web-only pilot passed the value-safe public cookie check on 2026-07-14; no cookie or session value was captured      |
| HelloRun fallback | Existing HelloRun remains publicly available before managed cutover | Failed | The PM2 process is stable, but the public hostname returns Cloudflare error 1033 and is absent from the active tunnel configuration |

## Local Ubuntu 26.04 Pilot Host

Observed directly on the current host and refreshed on 2026-07-31. Ubuntu 26.04 is a candidate platform until installation, deployment, rollback, and recovery gates pass; these observations do not promote it to supported status.

| Check                        | Expected result                                                    | Status  | Evidence or next action                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host identity                | The inspected machine is the active local HelloDeploy pilot        | Passed  | Web, worker, and the HelloDeploy tunnel run from the current Ubuntu 26.04 host                                                                                                          |
| Web and worker               | Both repository-run processes are active                           | Failed  | The reviewed web starts in production through a temporary PM2 pilot; the combined entry is stopped and the worker remains offline until helper preparation                              |
| Immutable runtime identity   | Active processes correspond to one reviewed commit or release tag  | Passed  | The active web-only process starts from the clean tagged `v0.1.5` checkout; Node.js 22 and isolated-service normalization remain separate gates                                         |
| Production configuration     | Web and worker pass value-safe production validation               | Failed  | The web passes with the verified GitHub App key; the worker fails closed because the required constrained local Nginx helper is not installed                                           |
| Local Redis                  | The configured local queue dependency responds                     | Passed  | `redis-cli ping` returned `PONG`                                                                                                                                                        |
| Local health and readiness   | The active web port returns sanitized healthy responses            | Passed  | Local `/health` and `/ready` returned `200`                                                                                                                                             |
| Dashboard tunnel             | Public dashboard traffic reaches the active local web process      | Passed  | The HelloDeploy tunnel maps the dashboard hostnames directly to the active web port                                                                                                     |
| Production cookie            | Public sessions use `Secure; HttpOnly; SameSite=Strict`            | Passed  | The sanitized public checker passed every required attribute after the production web-only pilot started; no cookie value was captured                                                  |
| Docker execution plane       | Docker is installed, active, and available only to the worker path | Blocked | Docker CLI and socket are absent; no real application container can be validated                                                                                                        |
| Isolated service identities  | Web, worker, and helper run as separate systemd identities         | Blocked | HelloDeploy identities and units are absent; current processes run from the repository under the interactive user                                                                       |
| Constrained routing helper   | Helper socket and managed application route directory are active   | Blocked | The helper runtime directory and HelloDeploy Nginx route directory are absent                                                                                                           |
| Dashboard Nginx path         | Nginx routes the dashboard to the active candidate web service     | Blocked | The configured Nginx upstream has no listener; the tunnel currently bypasses Nginx                                                                                                      |
| Wildcard application ingress | `*.apps.hellodeploy.online` reaches managed project routes         | Blocked | The current tunnel has dashboard routes but no wildcard application route                                                                                                               |
| Upgrade and rollback         | In-place candidate failure restores the live pilot                 | Blocked | Requires backup, immutable candidate, isolated units, queue control, and privileged execution                                                                                           |
| Backup media                 | Encrypted off-host storage and separate recovery-key custody       | Passed  | Dedicated LUKS2/ext4 backup storage is root-only; the protected recovery export is on separate media, ephemeral secret-key import passed, and only the public key persists on the pilot |
| Database export              | Recoverable database state exists before host mutation             | Passed  | Atlas Free has no managed snapshot; signed Database Tools created a compressed export directly on encrypted storage and the non-restoring archive check passed                          |
| Emergency pilot capture      | Current pilot state decrypts and verifies after media remount      | Passed  | The encrypted artifact and recovery media passed checksums; temporary recovery-key decryption, fixed archive inventory, and every internal checksum passed                              |
| Backup and restore           | Encrypted pilot backup restores on a second machine                | Blocked | Same-host retrieval integrity passed, but a second clean host has not restored the platform or representative project                                                                   |

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
| Configuration | Web and worker validation pass on the V1 host with one database, queue, encryption key, and routing policy | Missing, invalid, partial, insecure Redis, or unreadable configuration | Failed  |
| Installation  | Immutable full-platform release installs web, worker, helper, Nginx integration, and protected config      | Permission repair, regenerated existing secrets, or unverified startup | Blocked |
| Verification  | Identities, protected files, helper socket, Nginx, services, and `/ready` pass                             | Web has Docker/helper access or routing validation fails               | Blocked |
| Real deploy   | Every supported runtime serves through production routing with non-root and resource limits                | Secret leak, unsafe binding, residue, or healthy-release displacement  | Blocked |
| Upgrade       | Backup verifies; queue pauses/drains; candidate installs and verifies before prior queue state is restored | Drain timeout, candidate verification failure, or unknown queue state  | Blocked |
| Rollback      | Previous full commit, dependencies, units, ingress, services, readiness, and queue state restore           | Critical rollback-verification failure; keep queue paused              | Blocked |
| Backup        | Required state is complete, checksummed, encrypted, access-controlled, and stored off-host                 | Missing database/route/config state or failed integrity check          | Passed  |
| Restore       | Second clean host restores the platform and representative project with recorded RPO/RTO                   | Integrity, startup, route, or representative-project failure           | Blocked |

## Production Decision

Current decision: **NO-GO for customer application hosting**. The dashboard and strict session-cookie contract are verified on the live local pilot, but the worker, authenticated workflows, privilege isolation, Docker, wildcard routing, upgrade recovery, and cross-host restore rows must pass directly before a GO decision. Public dashboard availability is not evidence that hosted project deployment works.
