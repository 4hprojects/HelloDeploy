# Project Status Review

Updated: 2026-08-18

This is a synthesized snapshot — architecture, test/code-quality posture, whether the
project is still heading toward its original goal, and an estimated completion
percentage. It is not a live-updating source of truth: for current execution status
see [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md), for the
HelloUniversity-hosting goal see
[HelloDeploy and HelloUniversity Production Plan](HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md),
for what to work on next see [Priorities](PRIORITIES.md), and for detailed evidence
see [Worklog](../WORKLOG.md). Refresh this review at major milestones (a phase or
priority completing), not on every small change.

## 1. Web App Architecture Snapshot

`apps/web/src` follows a controllers → services → models pattern, but with the model
layer centralized in `packages/database` rather than duplicated per app —
`apps/web/src/models`/`repositories` are intentionally empty:

| Layer          | Files | Lines  | Role                                                                                                                                   |
| -------------- | ----- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `services/`    | 20    | ~5,011 | Business logic — the largest layer (deployment, auth, GitHub, domain, quota, readiness, SSE log streaming, admin, email, audit search) |
| `views/`       | 59    | ~5,185 | EJS templates (`pages/`, `partials/`, `layouts/`)                                                                                      |
| `controllers/` | 11    | ~3,011 | HTTP handlers (admin, auth, dashboard, deploy-hook, deployment, detection, domain, env-secret, github, project, webhook)               |
| `middleware/`  | 10    | ~516   | Session, CSRF, rate-limit, correlation-id, auth/role guards, maintenance mode                                                          |
| `routes/`      | 6     | ~445   | `api/` and `pages/` subtrees wiring paths to controllers                                                                               |
| `validators/`  | 3     | ~342   | Request-body validation (admin, auth, project)                                                                                         |
| `config/`      | 2     | ~220   | App configuration/env loading                                                                                                          |

Spot-checked directly against `docs/PLATFORM_ARCHITECTURE.md`'s claims rather than
trusting the doc: SSE log streaming is real (`deployment.controller.js` sets
`text/event-stream`, backed by `services/deploy-log-stream.js`), session auth is real
(`express-session` + `connect-mongo`, `middleware/session.js`), and CSRF is real
(`middleware/csrf.js`, tokens rendered into mutating views). All three match the
architecture doc's description.

## 2. Test Coverage Characterization

137 test files under `tests/` (up from 118 as of 2026-08-06), run via a custom
`node:test` wrapper (`scripts/run-tests.js`, no Jest/Mocha). Breadth by directory:
ui 23, operations 19, security 18, deployment 14, installer 12, admin 12, worker 10,
projects 7, nginx 5, github 4, auth 4, domain 3, repository 2, detection 1, config 1,
plus 2 top-level files (`contracts.test.js`, `api.test.js`).

Two caveats worth knowing before trusting this number as "coverage":

- **`tests/ui` is not real browser/DOM testing.** Spot-checked
  (`theme-persistence.test.js`): these read raw `.ejs`/`.css`/`.js` source with
  `fs.readFile` and assert on string/regex patterns. No Playwright/Puppeteer/jsdom
  anywhere in the repo. It verifies the right code is _present_, not that the UI
  _behaves_ correctly when rendered and interacted with.
- **No coverage tooling exists anywhere** — no `nyc`/`c8`/`istanbul` in
  `package.json` or as config. There is no quantifiable "X% of lines covered" number
  to report; test breadth here is characterized by file count and directory, not
  measured coverage. This is itself a tracked, still-open gap — see backlog item P1
  below.

## 3. Code Quality Snapshot

- **TODO markers**: zero in the strict `TODO(author): desc (#issue)` format this
  repo's own `.claude/rules/code-quality.md` requires. One legacy non-compliant
  marker found directly: `apps/web/src/controllers/webhook.controller.js:193`
  (`// TODO Phase 8: notify owner and flag project for review`) — tied to open
  backlog item U5 (webhook-triggered deploy failures are invisible to users).
- **Dependency audit**: `npm audit --omit=dev --audit-level=moderate` → 0
  vulnerabilities (confirmed current; a high-severity `ip-address` SSRF advisory was
  found and fixed 2026-08-06).
- **Dependency staleness** — real major-version gaps exist, none yet a security
  issue: `mongoose` 8.24→9.9, `bullmq` 5.79→6.0, `connect-mongo` 5.1→6.0, `ioredis`
  5.11→6.0, `resend` 4.8→6.18, `eslint` 9.39→10.8, `argon2` 0.41→0.45, `dotenv`
  16→17.
- **Doc/reality mismatch, resolved 2026-08-14**: `CLAUDE.md` described the
  stack as "Express 5," but the installed, actually-running version is
  **Express 4.22** (`apps/web/package.json` pins `^4.21.2`). Corrected
  `CLAUDE.md` to say Express 4 — the actual dependency was not touched;
  migrating to Express 5 for real remains a separate, un-scheduled
  decision if ever wanted.

## 4. Direction / Goal Alignment Check

Checked the current execution state against `hellodeploy-blueprint/`'s original
scope (the stable, un-touched product spec) rather than against any interim status
doc, to answer "are we still building what we set out to build":

- **P0 (Protect the Existing Pilot) and P1 (Install the Production Service
  Foundation): Complete.** Isolated service identities, Docker, protected
  configuration, and systemd units all match the blueprint's single-host V1
  topology exactly — no scope drift here.
- **P2 (Activate Worker, Queues, and Public Routing): Nearly complete.** Wildcard
  DNS/TLS, dashboard traffic cutover, and queue resume have all since passed live —
  `hellodeploy.online`/`www.hellodeploy.online` serve via the isolated
  `hellodeploy-web` through Nginx, and `queue_state=resumed`. Two items remain:
  exercising `revert-dashboard-cutover.sh` to a clean success (its stated blocker
  cleared 2026-08-13; the script itself still hasn't been run), and verifying real
  application routing under the wildcard once a project can actually be deployed
  (depends on P3). See `docs/PRIORITIES.md` Track A.
- **P3-P4 (real deployment validation and HelloUniversity cutover): In Progress.**
  The real project was connected, detected, configured, submitted, and approved.
  Five clone-stage deployments failed; build, activation, and managed routing remain
  unproven. P5-P6 (multi-project proof and formal recovery/GO) remain Not Started.

**Conclusion: yes, still aligned.** Nothing in the blueprint has been abandoned,
descoped, or quietly replaced. The project is intentionally infra-first — proving the
host, isolation boundaries, and routing are safe before validating the product
workflow on top of them — which is a defensible ordering, not drift.

## 5. Completion Estimate

No coverage tool or velocity data exists to derive a precise number (see §2), so this
is a structural estimate from the project's own tracked checklists, shown by axis
rather than as one number pretending to be more precise than it is:

| Axis                                                                     | Completion              | Basis                                                                                                                                                                                                              |
| ------------------------------------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core infrastructure (Batches 1-2: quality baseline, privilege isolation) | 100%                    | Both Complete                                                                                                                                                                                                      |
| P0-P1 (protect pilot, service foundation)                                | 100%                    | Both Complete                                                                                                                                                                                                      |
| P2 (routing and production cutover)                                      | ~85-90%                 | DNS/TLS, dashboard cutover, and queue resume all now passed live (2026-08-08/09/10); 2 items remain — exercise the revert script to a clean success, and verify real routing once a project deploys                |
| P3-P4 (real deployment and HelloUniversity cutover)                      | In Progress             | Repository/detection/configuration/approval passed; five clone attempts failed before build, activation, or route creation                                                                                         |
| P5-P6 (multi-project workflow, recovery, formal GO)                      | 0%                      | Not Started                                                                                                                                                                                                        |
| Full HelloUniversity production plan (P0-P6), raw checklist              | Not recounted this pass | Recount only after the immutable release and first healthy platform deployment; failed attempts and manual live patches do not satisfy checklist rows                                                              |
| `IMPROVEMENTS.md` Round 2 quality/security backlog                       | 26/28 = ~93%            | Resolved 2026-08-13 in a dedicated Track B pass (`docs/PRIORITIES.md`, `WORKLOG.md`) — only E2 (bare-clone caching, deliberately deferred) and U5 (partially — the broader webhook-failure-signal gap) remain open |

**Blended headline estimate: meaningfully higher than the 2026-08-06 35-40%
figure, driven almost entirely by P2's near-completion and the quality/security
backlog dropping from 15 open items to 2.** The platform's foundation (host
isolation, Docker, routing, candidate services) is fully proven, P2 is down to two
concrete, unblocked items, and code quality/security is essentially clean. What's
left is now overwhelmingly concentrated in P3-P6 — the larger remaining body of
work: completing the first HelloUniversity deployment, real multi-runtime validation,
the custom-domain cutover, multi-project/RBAC proof, and recovery drills. Only the
first pilot's pre-deployment workflow has started. A
precise new blended number isn't given here deliberately — the raw P0-P6 checklist
count needs recalculating (see table above) before a number would mean anything
more than the qualitative picture already states.

## 6. What This Means for Priorities

See [Priorities](PRIORITIES.md) for the actionable list. In short: P2 is down to
two concrete items (revert-script exercise, real-routing verification); P3/P4 has
started but has not passed clone — completing it and P5/P6 is the dominant gap
between where the project is and a formal production GO; the quality/security
backlog is essentially clean (26/28 resolved 2026-08-13) and no longer a material
blocker in parallel.
