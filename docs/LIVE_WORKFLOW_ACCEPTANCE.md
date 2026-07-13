# Live Workflow Acceptance Checklist

Updated: 2026-07-13

## Status Contract

Use exactly one status for every check:

- **Passed** — observed directly with evidence appropriate to the boundary.
- **Failed** — executed and did not satisfy the expected result.
- **Blocked** — cannot run without named access, infrastructure, or coordination.
- **Not Run** — runnable but not yet executed.

Public HTTP evidence never proves authenticated behavior, host isolation, Docker behavior, upgrade recovery, or backup restoration. Evidence must exclude credentials, cookie values, session identifiers, secret values, internal addresses, and private service identifiers.

## Public Production Boundary

| Check            | Expected result                                         | Status | Evidence or next action                                                                                                                                                          |
| ---------------- | ------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public homepage  | HTTPS response through the configured public edge       | Passed | `https://hellodeploy.online/` returned `200` through Cloudflare on 2026-07-13                                                                                                    |
| Sign-in page     | Authentication entry point is reachable                 | Passed | `/auth/sign-in` returned `200`                                                                                                                                                   |
| Liveness         | Sanitized web-process response                          | Passed | `/health` returned `200` with service and timestamp only                                                                                                                         |
| Readiness        | Sanitized MongoDB, Redis, and queue state               | Passed | `/ready` returned `200`; all three named checks were true                                                                                                                        |
| HTTPS policy     | HSTS and CSP present                                    | Passed | Public response included HSTS and the application CSP                                                                                                                            |
| Frontend release | Deployed asset identifiers match the evaluated checkout | Passed | The production check found the JavaScript and stylesheet identifiers extracted from this checkout in the live homepage                                                           |
| Session cookie   | `Secure; HttpOnly; SameSite=Strict`                     | Failed | A fresh check after publishing `v0.1.0` still reports `missing secure`; confirm Render deployed the tagged merge commit with production configuration, then redeploy and recheck |

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

| Stage         | Expected result                                                                                            | Stop condition                                                          | Status  |
| ------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| Preflight     | Supported Ubuntu, Node/npm, Docker, Redis, Nginx, systemd, capacity, and required tools pass               | Any blocking preflight failure                                          | Blocked |
| Configuration | Render web and Ubuntu worker validation pass with shared MongoDB/master key and managed TLS Redis          | Missing, invalid, partial, insecure Redis, or unreadable configuration  | Blocked |
| Installation  | Immutable worker-plane release installed without a local web service or regenerated shared secrets         | Permission repair, generated replacement secrets, or unverified startup | Blocked |
| Verification  | Identities, protected files, helper socket, Nginx, services, and `/ready` pass                             | Web has Docker/helper access or routing validation fails                | Blocked |
| Real deploy   | Every supported runtime serves through production routing with non-root and resource limits                | Secret leak, unsafe binding, residue, or healthy-release displacement   | Blocked |
| Upgrade       | Backup verifies; queue pauses/drains; candidate installs and verifies before prior queue state is restored | Drain timeout, candidate verification failure, or unknown queue state   | Blocked |
| Rollback      | Previous full commit, dependencies, units, ingress, services, readiness, and queue state restore           | Critical rollback-verification failure; keep queue paused               | Blocked |
| Backup        | Required state is complete, checksummed, encrypted, access-controlled, and stored off-host                 | Missing database/route/config state or failed integrity check           | Blocked |
| Restore       | Second clean host restores the platform and representative project with recorded RPO/RTO                   | Integrity, startup, route, or representative-project failure            | Blocked |

## Production Decision

Current decision: **NO-GO**. Public availability is confirmed, but the failed session-cookie check and every authenticated, privilege-isolation, Docker, upgrade-recovery, and cross-host-restore row must be resolved with evidence before a GO decision.
