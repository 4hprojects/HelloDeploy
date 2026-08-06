# Project Status Review

Updated: 2026-08-06

This is a synthesized snapshot — architecture, test/code-quality posture, whether the
project is still heading toward its original goal, and an estimated completion
percentage. It is not a live-updating source of truth: for current execution status
see [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md), for the
HelloRun-hosting goal see
[HelloDeploy and HelloRun Production Plan](HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md),
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

118 test files under `tests/`, run via a custom `node:test` wrapper
(`scripts/run-tests.js`, no Jest/Mocha). Breadth by directory: security 16, ui 23,
operations 15, deployment 13, installer 12, projects 7, worker 8, nginx 5, admin 4,
domain 3, auth 3, github 3, repository 2, config 1, detection 1.

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
- **A doc/reality mismatch worth flagging directly**: `CLAUDE.md` and the
  architecture docs describe the stack as "Express 5," but the installed,
  actually-running version is **Express 4.22** (`apps/web/package.json` pins
  `^4.21.2`). Either the Express 5 migration was planned but never done, or the docs
  describe aspirational state. Worth a deliberate decision (migrate, or correct the
  docs) rather than leaving the mismatch standing.

## 4. Direction / Goal Alignment Check

Checked the current execution state against `hellodeploy-blueprint/`'s original
scope (the stable, un-touched product spec) rather than against any interim status
doc, to answer "are we still building what we set out to build":

- **P0 (Protect the Existing Pilot) and P1 (Install the Production Service
  Foundation): Complete.** Isolated service identities, Docker, protected
  configuration, and systemd units all match the blueprint's single-host V1
  topology exactly — no scope drift here.
- **P2 (Activate Worker, Queues, and Public Routing): In Progress**, and every gate
  passed so far (routing foundation, wildcard tunnel ingress, candidate web/worker
  service activation, all proven live on the actual pilot host) matches the
  blueprint's deployment-lifecycle description — nothing has been substituted or
  skipped, just sequenced.
- **P3-P6 (real deployment validation, HelloRun cutover, multi-project proof,
  formal GO): Not Started**, but their scope as written in the production plan is a
  direct, unmodified translation of the blueprint's phases 6-8 (real deployment,
  pilot, and recovery drills) and testing/acceptance criteria.

**Conclusion: yes, still aligned.** Nothing in the blueprint has been abandoned,
descoped, or quietly replaced. The project is intentionally infra-first — proving the
host, isolation boundaries, and routing are safe before validating the product
workflow on top of them — which is a defensible ordering, not drift.

## 5. Completion Estimate

No coverage tool or velocity data exists to derive a precise number (see §2), so this
is a structural estimate from the project's own tracked checklists, shown by axis
rather than as one number pretending to be more precise than it is:

| Axis                                                                     | Completion   | Basis                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core infrastructure (Batches 1-2: quality baseline, privilege isolation) | 100%         | Both Complete                                                                                                                                                                                                                                                   |
| P0-P1 (protect pilot, service foundation)                                | 100%         | Both Complete                                                                                                                                                                                                                                                   |
| P2 (routing and production cutover)                                      | ~60-70%      | 3 of 10 P2 checklist items remain fully open (DNS record, dashboard cutover, queue resume); 2 more are functionally proven but left unchecked pending one narrow unverified sub-clause each (Nginx-reload-failure restoration; wildcard DNS/HTTPS/test-routing) |
| P3-P6 (real deployment, HelloRun cutover, multi-project, formal GO)      | 0%           | Not Started — no work begun on any of the four                                                                                                                                                                                                                  |
| Full HelloRun production plan (P0-P6), raw checklist                     | 21/74 = ~28% | Direct count across `docs/HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md`; understates true progress since it weights P3-P6's many unstarted items equally against P0-P1's finished ones                                                                               |
| `IMPROVEMENTS.md` Round 2 quality/security backlog                       | 6/21 = ~29%  | 6 items fixed (W1, W3, W4, W5, W7, W9); 15 open across phases 12-18                                                                                                                                                                                             |

**Blended headline estimate: roughly 35-40% toward a formal production GO for
hosting HelloRun through HelloDeploy.** The platform's foundation (host isolation,
Docker, routing, candidate services) is fully proven; what's left is concentrated in
finishing P2's last three gates (all currently unblocked except for one manual
operator action — the wildcard DNS record) and then P3-P6, which is the larger
remaining body of work: real multi-runtime deployment validation, the actual
HelloRun cutover, multi-project/RBAC proof, and recovery drills, none of which has
started. The open code-quality/security backlog (15 items) runs in parallel and
isn't blocking P2-P6, but does block the eventual formal release decision (Batch 8).

## 6. What This Means for Priorities

See [Priorities](PRIORITIES.md) for the actionable list. In short: one manual step
(wildcard DNS) unblocks the rest of P2; P3-P6 is the next major body of work after
that; the 15-item quality/security backlog can proceed independently and in
parallel, was analyzed 2026-07-06, and should be spot-checked for continued
relevance before implementation starts on any item.
