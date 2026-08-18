# Second-Site Deployment Checklist

Updated: 2026-08-18

## Purpose

This is a narrow, practical checklist for one specific question: **is HelloDeploy
ready to onboard and deploy a second real site through it right now?** It is not a
replacement for the full production-readiness system already tracked in
[`DEPLOYMENT_READINESS_ROADMAP.md`](DEPLOYMENT_READINESS_ROADMAP.md) (8-phase
release gate), [`PRIORITIES.md`](PRIORITIES.md) (current sequencing),
[`HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md`](HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md)
(the P0–P6 live-cutover plan), and [`WORKLOG.md`](../WORKLOG.md) (evidence log).
Those remain the source of truth for sequencing and history — this file extracts
only what matters for the onboarding question and gives a place to record the
attempt when it happens.

## Bottom line

**Not yet.** Platform infrastructure is live, and the first production pilot has
begun, but HelloUniversity has not completed a deployment. Five clone-stage attempts
failed before build or activation, so the platform URL is not application evidence.
The tarball/retry fixes are live only as manually copied drift. The next attempt is
blocked on reconciling that work into a reviewed immutable release and normalizing
the host through the supported upgrade path. Treat this as validation work, not a
routine onboarding.

## Pre-flight checklist

Confirm these before attempting a real onboarding, in order:

- [ ] **Track A blockers cleared** (per `PRIORITIES.md`):
  - [x] The one paused domain-verification job — resolved. Found on
        2026-08-13 (retrospective live check) to have already completed on
        2026-08-10 as a side effect of `scripts/resume-deployment-queue.js`,
        not a deliberate watched requeue as originally planned. The domain
        (`hellorun.online`) is now in `PENDING_ADMIN_APPROVAL`.
  - [ ] `infrastructure/revert-dashboard-cutover.sh` has reached a clean success —
        its stated blocker (`hellorun.online`'s PM2 port-3000 conflict) is cleared
        as of a 2026-08-13 live check (now returns `200`). The script itself still
        hasn't actually been run.
- [ ] **GitHub App config re-verified live.** A historical audit found
      `GITHUB_APP_NAME` missing from the production GitHub App env group. That
      group is all-or-nothing (`docs/ENVIRONMENT.md`) — an incomplete group means
      repo connection, webhooks, and deploys will not work. Confirm all five
      GitHub App vars are set in the live production `.env`, not just assumed
      fixed since the audit.
- [ ] **Quality gates green on the release commit**:
  ```sh
  npm ci
  npm run lint
  npm run format:check
  npm test
  npm audit --omit=dev --audit-level=moderate
  ```

## Workflow status

Every workflow below has dedicated `node --test` coverage with system boundaries
(Docker, git, Nginx, HTTP) injected via `deps`, including explicit failure-path
assertions — but **none have been exercised against a real GitHub repo, a live
Docker daemon, and live Nginx on the production host.** That live exercise is
exactly what P3 requires and what this checklist is for.

| Workflow                                                                                                           | Unit/integration coverage                                                                                                                                         | Proven live on production host                                  |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Repo connect + GitHub webhook (signature verify, push→deploy trigger)                                              | `tests/github/webhook.test.js`, `webhook-push.test.js`, `public-repository.test.js`, `tests/security/webhook-replay.test.js`                                      | Not yet                                                         |
| Build pipeline (clone exact commit → sanitize context → generate Dockerfile → `docker build`)                      | `tests/worker/build-deployment.job.test.js`, `tests/deployment/dockerfile-generator.test.js`, `tests/security/build-context.test.js`, `command-injection.test.js` | Not yet                                                         |
| Activate pipeline (port alloc → network → secrets → container start → health check → nginx route → swap → HEALTHY) | `tests/worker/activate-release.job.test.js`, `port-allocator.test.js`, `tests/deployment/health-check.test.js`, `container.test.js`, `tests/nginx/*`              | Not yet                                                         |
| Rollback pipeline                                                                                                  | `tests/worker/rollback-release.job.test.js`, `tests/deployment/rollback-flow.test.js`                                                                             | Not yet                                                         |
| Retention (last-3-HEALTHY cleanup)                                                                                 | `tests/worker/retention.test.js`                                                                                                                                  | Not yet                                                         |
| Quota/approval admin gating                                                                                        | `tests/admin/quota-service.test.js`, `quota-validator.test.js`, `tests/projects/approval-workflow.test.js`                                                        | Not applicable to a single onboarding, but part of the workflow |
| SSE deployment log streaming                                                                                       | `tests/deployment/live-progress-sse.test.js`, `sse-limiter.test.js`, `tests/worker/deploy-log-publish.test.js`                                                    | Not yet                                                         |

## Known risks to watch during the attempt

These are code-level observations from reading the pipeline, not blockers — worth
monitoring/logging closely during the first live run rather than fixing
speculatively beforehand:

- **`apps/worker/src/deployment/pipeline.js:410-435`** — the final container-swap
  and status-update sequence (`updateStatus(HEALTHY)` / `Project.updateOne` for
  `activeDeploymentId`) has no try/catch around it. If a DB write fails here after
  Nginx has already been pointed at the new container, the release could end up
  live in Nginx but not fully reflected as HEALTHY/active in the database. Watch
  logs around this step specifically.
- **`apps/web/src/controllers/webhook.controller.js:193`** — known TODO: when a
  high-risk file change auto-pauses a deployment, the project owner is never
  notified (tracked as backlog item U5 in `PRIORITIES.md` Track B). Not a
  correctness risk, but expect a silently paused deploy to look like nothing
  happened unless the dashboard is checked directly.

## Current attempt: hellouniversity (Express)

Started 2026-08-14, in progress. First real exercise of this checklist,
using a real project (`4hprojects/hellouniversity`) via the public-repo
HTTPS path rather than a throwaway repo, at the user's choice, with full
production environment configuration.

**Done:**

- Found and fixed a real build blocker: `hellouniversity`'s `postinstall`
  hook needs `tailwindcss` (a `devDependency`), but HelloDeploy's Express/
  Node.js Dockerfile template runs `npm ci --omit=dev` — the build would
  fail immediately. Fixed via
  [PR #3](https://github.com/4hprojects/hellouniversity/pull/3), moving
  `tailwindcss`/`postcss`/`autoprefixer` to `dependencies`, verified
  locally (`npm install` + `postinstall` succeed), merged to `main`.
- Established an authenticated admin session against the live site.

**Resolved — quota block and the account-lookup mystery**: the account
lookup contradiction (Compass showing `hellodeploy_db` as schema-matching
but empty of this account) turned out to have a simple explanation —
production's real `MONGODB_URI` points to a _different_ database
(`hellotasks`, same cluster) than what the local repo's `.env` claims.
Confirmed the admin's real `_id` (`6a35576283a1f129f22ed773`) by querying
`hellotasks` directly, then proved it was correct empirically: setting a
`USER`-scoped quota override (`maxOwnedProjects: 5`) via
`POST /admin/quotas/USER/<id>` and immediately retrying project creation
both succeeded — which only works if that `_id` matches the real
authenticated session's user, confirming `hellotasks` is genuinely the
live database. (The `hellotasks` vs. `hellodeploy_db` situation is a
separate, significant finding — see `docs/PRIORITIES.md`'s "HIGH —
production database is shared with an unrelated application" and the
migration plan in `WORKLOG.md`; deliberately not acted on until this
pipeline test is done.)

**More done:**

- Project created: `HelloUniversity` at slug `hellouniversity-4e6a`.
- Repository connected: `https://github.com/4hprojects/hellouniversity`,
  `main` branch (PR #3's fix already merged in).
- Detection run: `runtimeType: EXPRESS`, status **"Ready to deploy"** —
  no blocking errors.
- `.env` uploaded (39 variables, including `NODE_ENV=production` added
  after an initial gap was caught).
- Project submitted for review and approved (a required gate this
  attempt initially missed by driving the flow via direct API calls
  instead of the full browser UI — `submitForReview()` in
  `project.service.js`).

**GitHub connectivity recovered on 2026-08-18, but release normalization is now the
next action.** Five
consecutive attempts total, all failed identically with `status: FAILED`,
`failureCode: CLONE_FAILED`. The first three (deployment IDs
`6a80524c18873c53d635d783`, `6a8055a618873c53d635d79b`,
`6a805ba118873c53d635d7b6`) predate the fix below and failed with
`"git exited with code 128"` after ~2 minutes each — root-caused via
direct reproduction to a specific, reproducible incompatibility between
`git fetch`'s pack-transfer mechanism and this host's WiFi connection
(confirmed `enp7s0`, the wired interface, is unplugged/`NO-CARRIER`),
not a generic slow-network problem or a HelloDeploy code bug. Fixed by
replacing `git fetch` with a tarball download in
`apps/worker/src/git/clone.js`, tested, and deployed live to the worker
(2026-08-15). The fix works as designed — but two more attempts through
it (`6a806b3218873c53d635d7db`, `6a806d4018873c53d635d7f3`) still failed,
now with `"The operation was aborted due to timeout"` after 3 minutes
each. A live re-check right after confirmed `github.com` and
`codeload.github.com` both still hung past 15s with zero response while
a Cloudflare control endpoint returned clean — a sustained
GitHub-connectivity problem from this host, not something the code fix
alone could solve.

**2026-08-18 re-diagnosis**: a fuller diagnostic sweep (IPv4/IPv6
isolation, and — decisively — an actual end-to-end tarball download using
the exact URL pattern `clonePublicExactCommit` uses) found connectivity
is now fully healthy: `github.com` and `codeload.github.com` both respond
in under 1s, and a full 70.3MB tarball of the real `hellouniversity` repo
downloaded cleanly in 2m26s at ~480 KB/s with zero stalls. IPv6 was ruled
out entirely — this host has no IPv6 route configured, so it was never a
factor. The 08-16 failures were a genuine transient interruption that has
since cleared, not a persistent host misconfiguration. One new,
actionable finding: the repo's real tarball (~80MB uncompressed, mostly
image assets) takes ~146s to download at this host's real WiFi
throughput, against the worker's 180s abort timeout — a real but thin
~19% margin. To harden against exactly this kind of blip recurring, added
a bounded retry (3 attempts, 3s/9s backoff) around the clone step in
`apps/worker/src/jobs/build-deployment.job.js`, scoped to transient-shaped
errors only (deterministic failures like a bad SHA still fail fast).
Tested (`node --test tests/worker/build-deployment.job.test.js`, 19/19
pass; `git-clone.test.js`, 4/4 pass, no regression), clean lint/format.
**Now live** (2026-08-18 21:20 PST) — same manual-copy-and-restart path as
the tarball fix (still no working release mechanism): `clone.js` and
`build-deployment.job.js` copied into `/opt/hellodeploy`, both
`hellodeploy-web` and `hellodeploy-worker` restarted cleanly (new PIDs,
Nginx helper connected, database connected, ready and listening), public
`/ready` still `200` throughout. Full detail in `WORKLOG.md`'s "GitHub
Connectivity Recovered" entry (2026-08-18) and `docs/PRIORITIES.md`'s
host-reliability item.

**Remaining, to unblock:**

1. Reconcile and merge the reviewed release; prove its clean candidate gates.
2. Back up the host, prove the outstanding dashboard revert, reconcile manual-copy
   drift, and upgrade using the reviewed full commit SHA.
3. Retry the deploy trigger exactly once — needs an authenticated admin browser
   session.
4. Monitor `journalctl -u hellodeploy-worker -f` for the documented stage
   sequence (clone → Docker build → container start → nginx route →
   healthy); user watches the in-browser SSE log stream in parallel.
5. Confirm via `curl -I https://hellouniversity-4e6a.hellodeploy.online/`
   → `200`.

**Not blocking this attempt:** the email-verification delivery bug (see
`PRIORITIES.md`'s URGENT section) — this attempt uses the already-verified
admin account, not a new signup.

## Live pilot tracking

Fill in as the actual onboarding attempt runs. Mirrors the "Product pilot" list in
`DEPLOYMENT_READINESS_ROADMAP.md` Phase 7 and the P3 action list in
`HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md`.

| Step                                                                       | Status  | Evidence                                        | Date          | Notes                                       |
| -------------------------------------------------------------------------- | ------- | ----------------------------------------------- | ------------- | ------------------------------------------- |
| Connect and approve the new repository                                     | Passed  | Sanitized project/repository/approval records   | 2026-08-14    | Public repository connected; project Active |
| Runtime detected and build settings reviewed                               | Passed  | Detection result: Express, Ready to deploy      | 2026-08-14    | Revalidate exact commit before retry        |
| Deploy triggered (manual or webhook)                                       | Failed  | Five terminal `CLONE_FAILED` records            | 2026-08-14–16 | No attempt passed clone                     |
| Exact-commit checkout confirmed                                            | Failed  | Clone never completed in the worker             | 2026-08-14–16 | Retry only after immutable release          |
| Docker build succeeds, generated Dockerfile safe                           | Not Run |                                                 |               | Clone never reached build                   |
| Live build logs stream correctly (SSE)                                     | Not Run |                                                 |               | Browser and worker follow required on retry |
| Health check passes, container activates                                   | Not Run |                                                 |               |                                             |
| Nginx route created, application URL resolves publicly                     | Failed  | Platform hostname serves fallback Nginx content | 2026-08-18    | No managed route exists                     |
| Container confirmed non-root, resource-limited, loopback-only port         | Not Run |                                                 |               |                                             |
| Secrets confirmed absent from build output/logs/image history              | Not Run |                                                 |               |                                             |
| Deploy a broken commit — confirm the previously healthy release stays live | Not Run |                                                 |               |                                             |
| Roll back to a retained release                                            | Not Run |                                                 |               |                                             |
| Retention cleans up old releases correctly                                 | Not Run |                                                 |               |                                             |
| Concurrent deployment / port allocation exercised                          | Not Run |                                                 |               |                                             |
| Docker daemon interruption during a job exercised                          | Not Run |                                                 |               |                                             |

## Verdict recording

When this checklist is fully worked through, record the outcome (pass/fail per
row, any defects found and fixed) in `WORKLOG.md` per existing project convention,
and update `PRIORITIES.md` Track C / `HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md` P3
status accordingly. This file should stay a live tracker, not a historical
snapshot — update the rows above in place rather than appending new copies.
