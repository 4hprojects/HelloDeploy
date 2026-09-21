# Task Backlog

Authoritative as of 2026-09-22.

This file is the single consolidated list of **what is left to do** on HelloDeploy. It supersedes
[Priorities](PRIORITIES.md) as the starting point for "what's next".

## Document ownership

| Question                                           | Read                                                            |
| -------------------------------------------------- | --------------------------------------------------------------- |
| What is left to do, in what order?                 | **This file**                                                   |
| What was done, with verification evidence?         | [Worklog](../WORKLOG.md)                                        |
| What is in flight right now, with command history? | [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md) |
| What must be true before release (requirements)?   | [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md) |

Do not copy evidence into this file. Link to the Worklog instead.

## Status at a glance

| Field                   | Value                                                                          |
| ----------------------- | ------------------------------------------------------------------------------ |
| Release decision        | **NO-GO for customer application hosting** (unchanged, consistent across docs) |
| Production release      | `e732476551f8900ad7f496d7dc6cf250361cd1d3`                                     |
| Deployment queue        | **Operator-paused** pending route-switch rollout                               |
| Pilot (HelloUniversity) | Healthy on managed and custom hostnames; no project has deployed to HEALTHY    |
| Working branch          | `fix/atomic-custom-domain-routes`, 3 commits ahead of `main`, unmerged         |
| Hard blocker            | **Cleared 2026-09-22** — see TB-001; the audit gate is green again             |
| Test suite              | 144 test files; 988 tests green on `main`, 78.11% statements / 89.33% branches |
| Lint / format           | Clean — 297 files, 0 errors, 0 warnings                                        |
| Docs currency           | Newest tracker entry is 2026-09-03; this backlog reflects a 2026-09-22 re-read |

## Priority scheme

| Code    | Meaning                                                      |
| ------- | ------------------------------------------------------------ |
| **P0**  | Release blocker. Nothing ships past it.                      |
| **P1**  | Gates the GO decision for customer hosting.                  |
| **P2**  | Needed for a credible public product, not for the pilot.     |
| **P3**  | Housekeeping and decision hygiene.                           |
| **ADR** | Decision boundary. Not schedulable until an ADR is accepted. |

Effort: **S** under a day · **M** a few days · **L** a week or more · **EXT** blocked on something
outside this repository.

---

## Phase 0 — Unblock the release gate

**Goal:** make CI green so anything at all can merge and ship.
**Exit criteria:** `npm audit --omit=dev --audit-level=moderate` exits 0; `fix/atomic-custom-domain-routes` is merged at an immutable SHA; the full local gate passes.

| ID     | Task                                                                                                                                                                                                                                                                                                                      | Pri | Effort | Evidence needed                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ------------------------------------ |
| TB-001 | **Done 2026-09-22.** `express@4.22.3` (published 2026-09-14, eleven days after the last worklog entry) pulls `body-parser@1.20.8` → `qs@6.16.0`, outside the vulnerable `2.2.5 - 6.15.3` range. `npm audit --omit=dev --audit-level=moderate` now reports **0 vulnerabilities**. **No Express 5 migration was required.** | P0  | S      | Audit exits 0; 988/988 tests pass    |
| TB-002 | Merge `fix/atomic-custom-domain-routes` (atomic multi-route switching, 106 focused tests green locally, held behind TB-001).                                                                                                                                                                                              | P0  | S      | PR + CodeQL pass; merged full SHA    |
| TB-003 | Re-run the complete gate after the merge: `lint`, `format:check`, `config:check`, 1,004 tests, coverage, audit, `git diff --check`.                                                                                                                                                                                       | P0  | S      | Worklog entry                        |
| TB-004 | Guarded production upgrade to the new immutable SHA.                                                                                                                                                                                                                                                                      | P0  | S      | Bounded installation verifier passes |

> **Note on TB-001:** every doc that claims "production audit: zero vulnerabilities" predates the
> two `qs` advisories. That claim is stale, not a contradiction to resolve.

---

## Phase 1 — Prove the pipeline actually deploys

**Goal:** one real project reaching HEALTHY through the real worker, then a repeatable runtime matrix.
**Exit criteria:** HelloUniversity live on its custom domain; every supported runtime proven; `LIVE_WORKFLOW_ACCEPTANCE.md` re-run and accurate.

This is the single largest body of remaining work. **No runtime has ever deployed end to end.**

| ID     | Task                                                                                                                                                                                                                       | Pri | Effort | Evidence needed                     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ----------------------------------- |
| TB-010 | Retry HelloUniversity to HEALTHY. Deployments #1–5 failed at clone, #6 at `npm ci`, #7 on an absent `uploads/`, #8 at route activation on an undefined `$connection_upgrade`. Every cause is fixed; none has been retried. | P0  | M      | Active pointer + live managed route |
| TB-011 | Resume the operator-paused deployment queue once the route-switch release is rolled out.                                                                                                                                   | P0  | S      | `queue_state=resumed`               |
| TB-012 | Runtime matrix proof through the real worker: static, React, Vue, Express, generic Node, Next.js.                                                                                                                          | P0  | L      | One HEALTHY deploy per runtime      |
| TB-013 | Rollback from a retained image, live.                                                                                                                                                                                      | P0  | M      | Previous release restored           |
| TB-014 | Retention cleanup proof — last 3 HEALTHY releases kept, shared rollback images not deleted.                                                                                                                                | P1  | S      | Live observation; depends on TB-030 |
| TB-015 | Concurrent port allocation under two simultaneous builds.                                                                                                                                                                  | P1  | S      | No collision                        |
| TB-016 | Docker interruption mid-job — fail closed, no orphaned route or container.                                                                                                                                                 | P1  | M      | Drill record                        |
| TB-017 | Failed-candidate continuity: a failed deploy must never disturb the live release.                                                                                                                                          | P0  | S      | Live proof                          |
| TB-018 | Custom-domain cutover for `hellouniversity.online` — the 11-step checklist in the Production Plan (0 of 11 done), including the 24 h healthy-fallback window and `www` → apex permanent redirect.                          | P0  | M      | Public HTTPS on the custom domain   |
| TB-019 | Re-run `LIVE_WORKFLOW_ACCEPTANCE.md` end to end and correct its two stale **Failed** rows (wildcard ingress, deployment) — both predate deployment #8.                                                                     | P1  | M      | Updated matrix                      |
| TB-020 | Live validation of the public-git-by-URL repository path (`PUBLIC_GIT_REPOSITORY_SPEC.md` is implemented, live validation pending; matches UX-14 _Partial_).                                                               | P1  | S      | One public-repo deploy to HEALTHY   |
| TB-021 | Re-verify the production GitHub App env group. `GITHUB_APP_NAME` was found missing in a past audit and the group is all-or-nothing.                                                                                        | P0  | S      | `config:check` on the host          |
| TB-022 | Widen the clone-timeout margin. The HelloUniversity tarball takes ~146 s against a 180 s abort — ~19% headroom. A bounded 3-attempt retry exists; the margin does not.                                                     | P1  | S      | Measured margin                     |

---

## Phase 2 — Signup and outbound delivery

**Goal:** a new user can actually get in the door.
**Exit criteria:** a fresh signup receives its verification email; email failures are visible to an operator.

| ID     | Task                                                                                                                                                                                                                                                                                                                                                                                                  | Pri | Effort | Evidence needed                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ---------------------------------------- |
| TB-030 | **URGENT — email verification is very likely broken for every new signup.** `hellodeploy.online` has zero SPF/DKIM/DMARC records. A reset to the Resend account owner arrives; signups to other addresses vanish with a success response — the signature of Resend's sandbox/unverified-domain restriction. Needs the Resend dashboard plus Cloudflare DNS; **cannot be fixed from this repository.** | P0  | EXT    | A signup to an unrelated address arrives |
| TB-031 | Give email delivery a failure surface. `sendEmail` silently returns when `RESEND_API_KEY` is unset ([email.service.js:31](../apps/web/src/services/email.service.js#L31)) and deployment notifications are swallowed by design ([pipeline.js:128](../apps/worker/src/deployment/pipeline.js#L128)). Add a send log and admin visibility; keep the pipeline unaffected by send failures.               | P1  | M      | Failed send visible in admin             |
| TB-032 | Rotate the Super Admin password — currently weak, dictionary-based, and exposed in a chat session. Use the app's own password-change flow.                                                                                                                                                                                                                                                            | P0  | S      | Rotation recorded                        |
| TB-033 | Remove the four stale `SUPER_ADMIN_*` lines from the local `.env`.                                                                                                                                                                                                                                                                                                                                    | P1  | S      | Diff                                     |

---

## Phase 3 — Recovery and operational safety

**Goal:** the platform can survive a host loss and an operator knows when it has not.
**Exit criteria:** a proven cross-host restore with recorded RPO/RTO; scheduled off-host backups; a named monitoring owner.

| ID     | Task                                                                                                                                                                                                             | Pri | Effort | Evidence needed                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ---------------------------------- |
| TB-040 | **Cross-host restore.** Restore the encrypted backup onto a second clean host, serve a representative deployed project, record RPO and RTO. Same-host retrieval passed; this is the hard remaining gate.         | P1  | L      | Working project on the second host |
| TB-041 | Provide a mounted off-host encrypted backup destination and the separate recovery key. The last host inspection found neither present.                                                                           | P1  | M      | Host inspection                    |
| TB-042 | Schedule `infrastructure/backup.sh`. The script is solid but nothing in the repo installs a timer or cron, so backups only exist when a human runs one.                                                          | P1  | S      | systemd timer unit + a timed run   |
| TB-043 | Add backup-age alerting — a silent backup failure is currently indistinguishable from success.                                                                                                                   | P1  | S      | Alert fires on a stale backup      |
| TB-044 | Interruption drills: MongoDB, Redis, Docker, Nginx, worker, Cloudflare Tunnel, low disk, high memory.                                                                                                            | P1  | L      | One record per drill               |
| TB-045 | Intentionally-failed upgrade plus full restore, end to end. Two readiness-race bugs surfaced while attempting this (PRs #41, #42); the drill itself is unfinished.                                               | P1  | M      | Drill record                       |
| TB-046 | Decide monitoring ownership: log retention, alert thresholds, incident owner, escalation path, response expectations. Blocks Batch 8 / P6.                                                                       | P1  | S      | Written decision                   |
| TB-047 | Choose and wire an external uptime pinger. Today's entire production monitoring stack is a GitHub Actions `curl` of `/ready` every 10 minutes, with no alert routing beyond a failed-workflow email.             | P1  | S      | Alert received in a test           |
| TB-048 | **Infrastructure decision owed:** production runs on a personal laptop over WiFi (`henz-Inspiron-3443`, `wlp6s0`; the wired NIC reports `NO-CARRIER`, with nonzero packet drops). No code change addresses this. | P1  | EXT    | Written decision                   |

---

## Phase 4 — Close the code-level gaps

**Goal:** remove the built-but-unreachable and declared-but-unenforced machinery found in a 2026-09-22 source review.
**Exit criteria:** no scheduled job without a producer; no quota field that is settable but not enforced; the untested security-relevant modules covered.

Every item below was verified directly in source on 2026-09-22.

### 4a. The missing scheduler

| ID     | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Pri | Effort | Evidence needed             |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | --------------------------- |
| TB-050 | **Highest-value fix in this phase.** `CLEANUP_RELEASES` has a complete handler ([cleanup-releases.job.js](../apps/worker/src/jobs/cleanup-releases.job.js)) and a dispatch arm ([runtime.js:93](../apps/worker/src/runtime.js#L93)), but **zero producers** — no `enqueueJob` call, no BullMQ repeatable, no cron, no systemd timer anywhere in the repo. Excess releases, dangling images and abandoned `/var/lib/hellodeploy/builds` workspaces accumulate forever on any project that stops deploying. | P1  | M      | Job runs on a schedule      |
| TB-051 | Same root cause — add a sweeper for deployments stuck in a non-terminal status. A job that dies between the DB write and the BullMQ ack leaves a deployment stuck with nothing to recover it.                                                                                                                                                                                                                                                                                                             | P1  | M      | Stuck deployment reconciled |
| TB-052 | Same root cause — re-check domains stuck in `PENDING_VERIFICATION`. Verification is one-shot and user-triggered only.                                                                                                                                                                                                                                                                                                                                                                                     | P2  | S      | Automatic re-verification   |
| TB-053 | Apply `logRetentionDays` to deployment events. The quota defaults to 7 days; the model's TTL index is a fixed 30 days and the quota is never read.                                                                                                                                                                                                                                                                                                                                                        | P2  | S      | Retention matches quota     |

> Phase 13 of the improvement tracker recorded "dangling-image pruning added" as resolved. The
> pruning code is real — it lives inside the cleanup job, which never runs. TB-050 is what makes
> that resolution true in production.

### 4b. Quotas declared but not enforced

| ID     | Task                                                                                                                                                                                                                                                                                                                                                       | Pri | Effort | Evidence needed                      |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ------------------------------------ |
| TB-060 | **Only 2 of 11 quota fields are enforced.** [quota.service.js:5-16](../apps/web/src/services/quota.service.js#L5-L16) defines eleven; only `maxOwnedProjects` ([:65](../apps/web/src/services/quota.service.js#L65)) and `maxProjectMembers` ([:73](../apps/web/src/services/quota.service.js#L73)) are ever checked. The rest are admin-settable fiction. | P1  | M      | Each limit rejects at its boundary   |
| TB-061 | Wire `memoryMb` and `cpuCores` from the project's quota into the release. [build-deployment.job.js:358-362](../apps/worker/src/jobs/build-deployment.job.js#L358-L362) hardcodes `DEFAULT_MEMORY_MB` / `DEFAULT_CPU_CORES` into the `resourceLimits` payload, so every container gets 256 MB / 0.25 cores regardless of what an admin set.                 | P1  | S      | A raised quota changes the container |
| TB-062 | Enforce `maxCustomDomains`, `deploymentsPerMonth`, `maxRunningApps`, `storageMb`, `buildTimeoutSeconds` at their respective call sites.                                                                                                                                                                                                                    | P2  | M      | Boundary tests                       |

### 4c. Runtime state reconciliation

| ID     | Task                                                                                                                                                                                                                                                                                              | Pri | Effort | Evidence needed                        |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | -------------------------------------- |
| TB-070 | **No container self-healing.** Nothing reconciles database state against `docker ps`. After a host reboot, a deployment whose container did not restart still reads HEALTHY in the UI. `ContainerStatus` ([enums.js:78](../packages/contracts/src/enums.js#L78)) has zero usages in the codebase. | P1  | M      | Reconciler corrects a killed container |
| TB-071 | Surface or delete `getContainerStats()` ([container.js:227](../apps/worker/src/deployment/container.js#L227)) — implemented, exported, and never called. Per-project CPU/memory metrics were built and never wired to anything.                                                                   | P2  | S      | Stats visible, or code removed         |
| TB-072 | Add dead-letter handling. `removeOnFail: { count: 500 }` ([queue/src/index.js:101](../packages/queue/src/index.js#L101)) is the only failure retention; there is no inspection or replay path.                                                                                                    | P2  | M      | Failed jobs inspectable                |

### 4d. Observability

| ID     | Task                                                                                                                                                                 | Pri | Effort | Evidence needed          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ------------------------ |
| TB-080 | Add a `/metrics` endpoint. Only `/health` (liveness) and `/ready` (dependencies) exist — there is no request timing, queue depth, or build-duration signal anywhere. | P2  | M      | Scrapeable metrics       |
| TB-081 | Add logrotate for `/var/log/hellodeploy` and a log retention policy. Logs go to stdout and journald with no shipping and no bound.                                   | P2  | S      | Rotation configured      |
| TB-082 | Add a version/commit endpoint. There is currently no way to ask a running process which release it is on.                                                            | P2  | S      | Endpoint returns the SHA |

### 4e. Test and CI gaps

| ID     | Task                                                                                                                                                                                                                                                                                                          | Pri | Effort | Evidence needed           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ------------------------- |
| TB-090 | Test `apps/web/src/middleware/require-project-role.js` — the per-project RBAC gate, with **zero** references from any test file.                                                                                                                                                                              | P1  | S      | Role boundary tests       |
| TB-091 | Test `apps/worker/src/deployment/secrets.js` — env-secret decryption into a release, zero test references.                                                                                                                                                                                                    | P1  | S      | Tests                     |
| TB-092 | Test `packages/security/src/sanitize.js` — `hasControlChars` / `assertNoControlChars` are injection-relevant and have zero test references.                                                                                                                                                                   | P1  | S      | Tests                     |
| TB-093 | Test `apps/web/src/utils/async-handler.js` — wraps every async route; a regression here fails silently.                                                                                                                                                                                                       | P2  | S      | Tests                     |
| TB-094 | Add Dependabot or Renovate. Nothing currently updates dependencies or Action versions.                                                                                                                                                                                                                        | P2  | S      | Config merged             |
| TB-095 | Add `shellcheck` to CI. 3,261 lines of production bash run as root under `infrastructure/`, linted by nothing.                                                                                                                                                                                                | P2  | S      | CI step                   |
| TB-096 | Run CI on pull requests into `develop`. `ci.yml` triggers only on PRs into `main`, so `develop` PRs run no checks at all.                                                                                                                                                                                     | P2  | S      | Workflow diff             |
| TB-097 | Add a `permissions:` block to `ci.yml` and `uptime-check.yml` (both inherit the default token scope) and pin Actions to SHAs rather than floating tags.                                                                                                                                                       | P2  | S      | Workflow diff             |
| TB-098 | Add secret scanning to CI. A real `.env` (mode 0600) sits in the repo root — gitignored, but nothing verifies that it stays so.                                                                                                                                                                               | P2  | S      | CI step                   |
| TB-099 | Set a coverage threshold. `test:coverage` passes `--experimental-test-coverage` with no threshold flags, so coverage is reported but can never fail a build.                                                                                                                                                  | P3  | S      | Threshold enforced        |
| TB-100 | **Corrected 2026-09-22 — the original finding was wrong.** `allowScripts` is not a stale `@lavamoat` field: npm 11.17 reads it natively and ships `npm approve-scripts`. The block is a working control. The real (small) task is to approve `mongodb-memory-server`, which npm currently warns is uncovered. | P3  | S      | No pending-script warning |
| TB-101 | Extend the pre-commit hook or accept the gap — it runs `lint` and `format:check` only, so a commit can pass locally and still break CI on tests or `config:check`.                                                                                                                                            | P3  | S      | Decision or diff          |

### 4f. Dependency drift

| ID     | Task                                                                                                                                                                                                                             | Pri | Effort | Evidence needed         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ | ----------------------- |
| TB-110 | Deliberate major-version upgrade pass: mongoose 8→9, bullmq 5→6, ioredis 5→6, connect-mongo 5→6, resend 4→6, dotenv 16→18, eslint 9→10, argon2 0.41→0.45. No security issue today; unmanaged drift with no automation behind it. | P2  | L      | Suite green per upgrade |
| TB-111 | Move `dotenv` to a root devDependency. It is declared in `apps/web` and `apps/worker`, but both start with `node --env-file`; only `scripts/*` import it.                                                                        | P3  | S      | Diff                    |

---

## Phase 5 — User-facing gaps

**Goal:** the product is credible for someone who is not the operator.
**Exit criteria:** Phase 18 UX items shipped; real assistive-technology pass done; account self-service exists.

| ID     | Task                                                                                                                                                                                                                                                                                             | Pri | Effort | Source          |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------ | --------------- |
| TB-120 | **U1** — the dashboard is a five-row project table duplicating `/projects`. Wants recent activity, failure alerts, and a "needs attention" surface.                                                                                                                                              | P2  | M      | Phase 18        |
| TB-121 | The deployments list does not auto-refresh — "Running…" stays static until a manual reload, and the detail page hard-reloads 1.2 s after a terminal status.                                                                                                                                      | P2  | M      | Phase 18        |
| TB-122 | Raw enum copy leaks to users: `APPROVAL_REQUIRED`, `triggerType`, `deploymentMode`.                                                                                                                                                                                                              | P2  | S      | Phase 18        |
| TB-123 | The "● Live" indicator is colour- and glyph-only, with no accessible name — every other badge has one.                                                                                                                                                                                           | P2  | S      | Phase 18        |
| TB-124 | **U5** — webhook-triggered deploy failures are invisible to users. The handler responds 200 immediately, then only logs downstream errors ([webhook.controller.js:348](../apps/web/src/controllers/webhook.controller.js#L348)). Persist the last trigger failure on the project and surface it. | P2  | M      | Phase 18        |
| TB-125 | Real browser / assistive-technology accessibility pass. `tests/ui/` (24 files) reads `.ejs` and `.css` with `fs.readFile` and asserts on regular expressions — it verifies that code is _present_, never that the UI _behaves_. There is no Playwright, Puppeteer or jsdom anywhere in the repo. | P2  | L      | UX-13 residual  |
| TB-126 | Account self-service is entirely absent: no `/account`, no change-password-while-signed-in, no email change, no account deletion or data export. Notable given the shipped `/privacy` and `/data-processing` pages.                                                                              | P2  | L      | Source review   |
| TB-127 | No running-application log view. Deployment logs stream over SSE; `docker logs` for a live container is not exposed anywhere.                                                                                                                                                                    | P2  | M      | Source review   |
| TB-128 | **P5 second-project workflow** — full lifecycle for a second real owner: manual and automatic modes, webhooks, build filters, selected commits, archive and deletion, and every role boundary.                                                                                                   | P2  | L      | Plan P5         |
| TB-129 | Authenticated UX acceptance rows currently **Blocked**: desktop, 390 px mobile, keyboard, screen reader, focus order, error association, long content.                                                                                                                                           | P2  | M      | Live acceptance |
| TB-130 | Operational notifications and responsive admin layouts are both recorded _Partial_; verify the Super Admin actually receives operational alerts in a safe test.                                                                                                                                  | P2  | M      | Archived P10    |

---

## Phase 6 — Housekeeping and decisions

**Goal:** the documentation tells the truth and the release process is real.

| ID     | Task                                                                                                                                                                                                                                                                                                                                  | Pri | Effort |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| TB-140 | Apply the superseding notes recorded below to `PRIORITIES.md`, `LIVE_WORKFLOW_ACCEPTANCE.md`, `DEPLOYMENT_READINESS_ROADMAP.md` and `PROJECT_STATUS_REVIEW.md`. Deliberately **not** done when this backlog was written.                                                                                                              | P3  | S      |
| TB-141 | Enforce or retire `RELEASE_POLICY.md` — it is explicitly unenforced, and operators are told to supply and verify immutable references by hand.                                                                                                                                                                                        | P2  | M      |
| TB-142 | Split `WORKLOG.md` again — 2,168 lines and 116 KB, already split once in 2026-08.                                                                                                                                                                                                                                                     | P3  | S      |
| TB-143 | Rewrite or close **E2**. Its title says "fresh full clone per deploy", but clones are shallow and the path no longer uses `git fetch` at all — it downloads a codeload tarball. The premise is obsolete; the underlying "no per-repo cache" question is still open and still needs real concurrency safety on the most critical path. | P3  | S      |
| TB-144 | Close the bookkeeping states: Batch 3 is "Blocked" with all 7 tasks ticked; Batch 4 is "In Review" with all 7 ticked. Neither represents work.                                                                                                                                                                                        | P3  | S      |
| TB-145 | Decide on Ubuntu 26.04 — promote from "candidate" to supported, or keep it out. Promotion needs installation, deployment, rollback, interruption and restore evidence.                                                                                                                                                                | P2  | M      |
| TB-146 | Resolve the PM2 / systemd duality. `ecosystem.config.cjs` and `infrastructure/systemd/*.service` are both live; the cutover scripts exist precisely because the repo is mid-transition.                                                                                                                                               | P2  | M      |
| TB-147 | Small efficiency items: `getUserProjects` sorts in JS with no limit; `requireProjectRole` issues two sequential finds per request.                                                                                                                                                                                                    | P3  | S      |
| TB-148 | Audit-metadata note — `audit-event.model.js` stringifies metadata _before_ the 10,000-character cap check. Not exploitable today; becomes real the moment any `writeAuditEvent` caller passes user-controlled metadata.                                                                                                               | P3  | S      |

---

## Appendix A — Reconciliation

### Old ID to new phase

| Old system                           | Open items                       | Now                 |
| ------------------------------------ | -------------------------------- | ------------------- |
| Track A (routing/cutover)            | Real managed-project routing     | Phase 1             |
| Track B (code quality)               | E2 only (26 of 28 resolved)      | TB-143              |
| Track C (GitHub App env)             | Env group re-verification        | TB-021              |
| Tracks D, E, F, G                    | **None — all closed 2026-08-13** | Appendix C          |
| Batch 1, Batch 2                     | **None — complete**              | Appendix C          |
| Batch 3, Batch 4                     | Bookkeeping only                 | TB-144              |
| Batch 5 (installer lifecycle)        | 4 of 8                           | Phase 3             |
| Batch 6 (real deployment validation) | 8 of 8                           | Phase 1             |
| Batch 7 (pilot and recovery drills)  | 9 of 9                           | Phases 1 and 3      |
| Batch 8 (release decision)           | 9 of 9                           | Gated on Phases 0–3 |
| Plan P0, P1                          | **None — complete**              | Appendix C          |
| Plan P2, P3, P4                      | In progress                      | Phase 1             |
| Plan P5 (second project)             | Not started                      | TB-128              |
| Plan P6 (drills, monitoring, docs)   | Not started                      | Phases 3 and 6      |
| Improvement Phases 1–15, 17          | **None — done or resolved**      | Appendix C          |
| Improvement Phase 16                 | E2 only                          | TB-143              |
| Improvement Phase 18                 | U1–U5                            | TB-120 … TB-124     |
| UX-01 … UX-13                        | **None — done**                  | Appendix C          |
| UX-14                                | Live validation pending          | TB-020              |
| Archived P8–P12                      | Partials and blocked rows        | Phases 1, 3, 5      |

### Stale claims — do not act on these

Verified directly on 2026-09-22. Each is a documentation defect, not open work.

1. `DEPLOYMENT_READINESS_ROADMAP.md`: "production audit: 0 vulnerabilities". Was false when this backlog was written (3 moderate `qs` findings); **true again as of 2026-09-22** via TB-001. The claim needs a date, not a correction.
2. `PROJECT_STATUS_REVIEW.md` §2: "no coverage tooling exists anywhere". **False** — `npm run test:coverage` reports 78.63% / 89.32% / 86.56%. The same section's "137 test files" is also wrong; there are 144.
3. `PRIORITIES.md` HIGH, production database shared with `hellotasks`: **resolved** by the 2026-09-02 migration, parity-verified across 12 collections. Never updated.
4. `PRIORITIES.md` Track A, "queue is resumed": **false** — the queue remains operator-paused.
5. `PRIORITIES.md` Track A, dashboard returning 502: **resolved** by the 2026-09-02 cutover.
6. `PRIORITIES.md` Track A, `revert-dashboard-cutover.sh` drill: **passed** 2026-09-02 against the PM2 fallback.
7. `LIVE_WORKFLOW_ACCEPTANCE.md`, "Wildcard ingress: Failed" and "Deployment: Failed": both predate deployment #8, which built, ran non-root, and passed its health check before failing at route activation — since fixed. Re-run under TB-019.
8. `SYSTEM_ANALYSIS.md` / `PROJECT_STATUS_REVIEW.md` disagree about a legacy TODO marker in `webhook.controller.js`. **There are zero `TODO`/`FIXME`/`HACK`/`XXX` markers in the entire JavaScript codebase.** This backlog cannot be reconstructed from source markers.
9. `SECOND_SITE_DEPLOYMENT_CHECKLIST.md` known risk, "the pipeline post-swap has no try/catch": **false** — [pipeline.js:409-430](../apps/worker/src/deployment/pipeline.js#L409-L430) wraps the pointer write and status update in a try/catch that logs `CRITICAL` and rethrows so BullMQ retries. No task needed.
10. **`DEPLOYMENT_READINESS_ROADMAP.md` is a requirements specification, not a status document.** Only 17 of roughly 150 checkboxes are ticked, including boxes for work the tracker records as Complete. Never read an unticked box there as open work without cross-checking the tracker.

**Rule of thumb:** `PRIORITIES.md` (2026-08-31) and `PROJECT_STATUS_REVIEW.md` (2026-08-18) are older than `IMPLEMENTATION_BATCH_TRACKER.md` and `WORKLOG.md` (both 2026-09-03). For anything dated after 2026-08-18, the tracker and worklog win.

---

## Appendix B — Deferred capabilities (decision boundary)

These are **not backlog items.** Each needs an accepted ADR before it becomes schedulable. Listed
here only so nobody mistakes their absence for an oversight. Source:
[Project Settings Deferred Capability Evaluations](PROJECT_SETTINGS_DEFERRED_CAPABILITIES.md).

| Capability                      | Capability                   |
| ------------------------------- | ---------------------------- |
| Pull-request previews           | Persistent disks             |
| Edge caching controls           | One-off jobs                 |
| Region selection                | Custom maintenance-page URL  |
| User-selectable instance sizing | Advanced networking controls |
| Interactive shell access        | Horizontal or manual scaling |

Two further items are deferred deliberately and should not be rescheduled: content-hashed static
asset filenames with immutable caching, and **E3** (the SSE 10-second database sweep alongside Redis
pub/sub — an intentional completeness fallback, since the database is the source of truth).

Also out of scope by design, recorded so it is not mistaken for a gap: **there is no billing,
no onboarding wizard, and no public REST API.** Horizontal worker scaling is not possible as
written — the port allocator probes loopback ports on the worker host, the Nginx helper talks to a
local unix socket, and both the SSE limiter and webhook deduplication fall back to per-process
memory.

---

## Appendix C — Explicitly closed

Listed so this work is never re-derived or re-opened.

- **Tracks D, E, F and G** — admin UX (10/10), guest experience (6/6), platform-wide UX (6/6), onboarding handoff (3/3). All resolved 2026-08-13.
- **UX-01 through UX-13** — all done 2026-07-01/02, each with a test under `tests/ui/`.
- **Improvement Phases 1–11** — done, each with its own phase file.
- **Improvement Phases 12, 13, 14, 15 and 17** — resolved 2026-08-13 in the direct "Track B" pass, without dedicated phase files.
- **Batch 1 (green quality baseline)** and **Batch 2 (Nginx privilege isolation)** — complete.
- **Plan P0 and P1** — complete.
- **Security reviews** — both passes (a roughly 90-file session diff, and the Track G auth diff) came back clean with no backlog created.
- **Database isolation** — the `hellotasks` → `hellodeploy_db` migration completed 2026-09-02 with count, identity, index and reference parity across all 12 owned collections.

Areas already covered well enough that they do not belong in this backlog: rate limiting (8 tuned
Redis-backed limiters, fail-closed in production), CSRF (global, with two deliberately-exempt
machine endpoints that carry their own authentication), secrets at rest (AES-256-GCM, versioned,
rotatable), command injection (argument arrays throughout, re-validated at the Dockerfile
boundary), and the audit trail (written on every privileged action, never able to fail a
deployment).
