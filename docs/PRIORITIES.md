# Priorities

A quick-scan punch list of what's next, across both active tracks. This is a
human-readable pointer, not a source of truth — for status detail, evidence, and
command history, see [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md),
[HelloDeploy/HelloRun Production Plan](HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md), and
[Worklog](../WORKLOG.md). For the full analysis behind this list — architecture,
test/code-quality posture, direction check, completion estimate — see
[Project Status Review](PROJECT_STATUS_REVIEW.md). Update this file's ordering as
priorities shift; don't copy evidence into it.

## Track A — P2 production-cutover completion (blocking)

1. Deliberately requeue the one paused domain-verification job and observe —
   per the plan's own "deliberately requeue... and observe" framing, a manual,
   watched step, not something to automate.
2. Exercise `infrastructure/revert-dashboard-cutover.sh` to a clean success —
   currently blocked on HelloRun's own unrelated recovery (see below), since its
   `fallback-verification` stage depends on HelloRun being reachable. A first
   attempt found and fixed a real rollback-consistency bug; the fix is merged but
   hasn't been proven end-to-end yet.
3. Verify real application routing under the wildcard once a project can be
   deployed (P3) — today's probe only confirmed TLS/DNS work, not that a real
   managed project route resolves correctly.

Dashboard traffic cutover and queue resume are **done** — `hellodeploy.online`/
`www.hellodeploy.online` serve live via the isolated `hellodeploy-web` through
Nginx (PM2 never stopped), and the deployment queue is resumed
(`queue_state=resumed`). Once the three items above land, P2 is complete and P3
(real deployment engine validation) is the next unblocked body of work — see
`docs/HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md` for its full action list.

## Urgent, but outside this project's scope

`hellorun.online` is currently returning `502` — its own PM2 process (a separate
project on this shared host) is crash-looping on `EADDRINUSE :::3000`; something
else already holds port 3000. Confirmed unrelated to anything in this repo or
session — no HelloDeploy script touches port 3000, HelloRun's `.env`, or its PM2
process. Needs attention directly in that project, not here.

## Track B — Code quality & security backlog (not blocking Track A, can run in parallel)

15 open items from `docs/IMPROVEMENTS.md`'s Round 2 review (analyzed 2026-07-06),
phased in `docs/phases/README.md` as Phases 12-18. **Spot-check each for continued
relevance before implementing** — nothing here has been re-verified against current
code since the original analysis. Ordered by the effort/impact grouping already in
`IMPROVEMENTS.md`:

**Security (HIGH/MEDIUM, Phases 12/14/15)**

- S1 — No master-key rotation path (`packages/security/src/encryption.js`); rotating
  `HELLODEPLOY_MASTER_KEY` bricks every stored secret. _Effort: L._
- W2 — Dockerfile injection defense is single-layer (`dockerfile-generator.js`);
  only the web-side validator guards it. _Effort: S._
- S6 — Job payloads unvalidated at dequeue; contracts typedefs are JSDoc-only.
  _Effort: M._
- W10 — Worker emits zero audit events (build/activate/rollback/delete/decrypt).
  _Effort: M._
- S2 — Audit-event TTL is 7 days; metadata is unvalidated `Mixed`. _Effort: S-M._
- S3 — Redaction is key-name-only, no value-pattern matching (JWT, `ghp_`, PEM, AWS
  keys). _Effort: S-M._
- S4 — Admin role granularity: only maintenance mode requires `SUPER_ADMIN`.
  _Effort: M._
- P6 — All-zeros dev master key has no production tripwire. _Effort: S._

**Security (LOW, Phases 12/15/17)**

- W8 — Build-context symlink scrub is top-level only. _Effort: S._
- S5 — Residual validation gaps (unparseable quota numerics, no hostname validation
  on domain add, some routes skip `validateObjectId`). _Effort: S._
- S7 — Hand-rolled GitHub App JWT untested (`apps/worker/src/git/github-token.js`).
  _Effort: S._
- S8 — Failed nginx-config restore only logs "CRITICAL," no alert/audit event.
  _Effort: S._

**Efficiency & code quality (Phase 13/16)**

- W6 — Docker disk-growth vectors: project images/networks/containers leak on
  deletion, no dangling-image pruning, unbounded container logs, unimplemented
  build-workspace sweep. _Effort: M._
- E1 — Maintenance-mode check hits Mongo on every request, uncached. _Effort: S-M._
- E2 — Fresh full clone per deploy, no per-repo bare-clone cache. _Effort: M._
- P3 — Duplicated env-config helpers between web and worker. _Effort: S-M._
- E4 — `getRollbackTargets` unbounded. _Effort: S._

**Process & tooling (Phase 17)**

- P1 — CI has no security or coverage gates (no `npm audit`, no coverage report, no
  CodeQL/SAST) — directly explains the "no coverage tooling" gap in
  `docs/PROJECT_STATUS_REVIEW.md` §2. _Effort: S-M._
- P4 — Untested risk surfaces: `delete-project.job`/`stop-project.job`,
  `github-token.js` JWT, `deploy-log-stream.js`, webhook/deployment controllers.
  _Effort: M._
- P2 — No git hooks; lint/format enforced only in CI. _Effort: S._
- P5 — Repo hygiene: `WORKLOG.md` is now 2,600+ lines; unused `.gitkeep` scaffolding
  dirs remain under `apps/web/src/{models,repositories}` and
  `apps/worker/src/{docker,metrics,nginx,security}`. _Effort: S._

**UX (Phase 18)**

- U5 — Webhook-triggered deploy failures are invisible to users (resolves the one
  remaining non-compliant `TODO` at `webhook.controller.js:193`). _Effort: M._

## Track C — Not started, after Track A completes

- **P3 — Validate the Real Deployment Engine**: deploy Static, React, Vue, Express,
  generic Node.js, and supported Next.js runtimes through the real pipeline.
- **P4 — Host HelloRun Through HelloDeploy**: the actual pilot-app cutover goal.
  Blocked on external GitHub, DNS/TLS, notification, and ingress access.
- **P5 — Prove the Workflow for Other Projects**.
- **P6 — Recovery and Formal Production GO**: all incomplete release-gate items are
  blockers here by definition; the Track B backlog above must also be resolved or
  explicitly accepted as risk before this gate.

## Also worth a deliberate decision (not urgent, not blocking anything)

- `CLAUDE.md`/architecture docs describe "Express 5"; the installed version is
  actually Express 4.22 (`apps/web/package.json`). Either migrate or correct the
  docs — see `docs/PROJECT_STATUS_REVIEW.md` §3.
- Several dependencies have open major-version gaps (`mongoose`, `bullmq`,
  `connect-mongo`, `ioredis`, `resend`, `eslint`) — none are security issues today,
  but worth a deliberate upgrade pass rather than indefinite drift.

## Recently resolved (kept brief — see Worklog for evidence)

- Wildcard tunnel ingress and candidate `hellodeploy-web`/`hellodeploy-worker`
  service activation both passed live (2026-08-05, 2026-08-06); a real session-write/
  shutdown-ordering race found during the latter is fixed. A pre-existing `ip-address`
  SSRF advisory that had been failing CI on `main` is also fixed. Batch 2 (Nginx
  Privilege Isolation) and Batch 3's session-cookie blocker are both resolved — both
  were stale in the tracker until this pass.
- `docs/LIVE_WORKFLOW_ACCEPTANCE.md` and `docs/DEPLOYMENT_READINESS_ROADMAP.md`'s
  stale rows (previously flagged here as "known doc debt") are fixed as part of this
  same documentation pass.
- The wildcard domain was restructured from `*.apps.hellodeploy.online` to
  `*.hellodeploy.online` (2026-08-08) after discovering the account's free Cloudflare
  certificate doesn't cover second-level wildcards. The live migration passed and a
  public wildcard HTTPS probe now returns a real TLS-terminated response. Two
  unrelated live issues were found and fixed along the way: a stale systemd
  `ReadWritePaths` bind-mount on the Nginx helper that broke daily after log
  rotation, and a `DEPLOYMENT_DOMAIN`/`PLATFORM_SUBDOMAIN_SUFFIX` mismatch that had
  the repository-run PM2 pilot crash-looping.
- Dashboard traffic cutover passed live (2026-08-09) — `hellodeploy.online`/
  `www.hellodeploy.online` now serve via the isolated `hellodeploy-web` through
  Nginx. Exercising the revert path surfaced and fixed a real rollback-consistency
  bug after an unrelated HelloRun failure triggered it and briefly took the
  dashboard down as a side effect; now fully restored.
