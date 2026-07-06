# HelloDeploy Improvements Backlog

Full-codebase analysis covering security, efficiency, user experience, and documentation.

- **Analyzed at:** commit `1b19028`, 2026-07-02
- **Scope:** whole monorepo — `apps/web`, `apps/worker`, `packages/*`, all markdown docs
- **Severity:** how much it matters. **Effort:** S (< 1 hour), M (half day), L (multi-day)
- Items marked `[x]` were fixed in the same session this document was created.

---

## 1. Security

Overall the fundamentals are strong: session fixation is handled (`req.session.regenerate` after auth), cookies are `httpOnly`/`sameSite:strict`/`secure`, CSRF and webhook HMAC both use `timingSafeEqual`, passwords use Argon2id, worker processes spawn with argument arrays (no shell), builds run with `--network none`, build context enforces path-traversal and symlink-escape checks, and rate limiters fail closed with Redis required in production. The items below are defense-in-depth gaps, not open holes.

### HIGH

- [x] **Dockerfile directive injection via build config** — `apps/worker/src/deployment/dockerfile-generator.js` bakes user input directly as `RUN ${buildCommand}` / `CMD ${startCommand}`. A value containing newlines injects arbitrary Dockerfile instructions. Blast radius is limited by `--network none` and resource caps, but it is attacker-controlled build execution. **Fix (applied):** reject newlines/control characters in `validateUpdateBuildConfiguration` — the only write path. _Effort: S. Fixed 2026-07-02._
- [x] **Containers run as root inside the namespace** — `apps/worker/src/deployment/container.js` sets no `--user`, and generated Dockerfiles set no `USER`. `--cap-drop ALL` + `no-new-privileges` mitigate, but user code still runs as uid 0. **Fix (applied):** static runtimes use `nginxinc/nginx-unprivileged` (uid 101, port 8080); node runtimes get `USER node` + `--chown`-ed app files. See `docs/phases/phase-2-non-root-containers.md`. _Effort: M. Fixed 2026-07-03._

### MEDIUM

- [x] **Webhook replay dedup is in-memory** — `apps/web/src/controllers/webhook.controller.js:10-34`. Bypassable across instances/restarts; eviction is FIFO by insertion, not expiry. Already flagged with an in-code TODO. **Fix (applied):** atomic `SET webhook:delivery:<id> EX 3600 NX` on the shared web Redis connection; falls back to the in-memory map (with a warning/error log) when Redis is absent or not ready, since dropping webhooks on a Redis outage would lose real deployments. _Effort: S–M. Fixed 2026-07-03._
- [x] **ObjectId cast errors → 500 on public deploy-hook route** — `verifyDeployHookToken` called `Project.findById` on the raw `:projectId` param; a non-ObjectId value threw a CastError → 500 instead of 404. **Fix (applied):** `isValidObjectId` guard. _Effort: S. Fixed 2026-07-02._
- [x] **Same CastError class on admin routes** — `apps/web/src/routes/pages/admin.routes.js` `:userId`/`:projectId`/`:scopeId` params reach `findById` unguarded (authenticated admin-only, so lower urgency). **Fix (applied):** shared `validateObjectId` `router.param` guard (`apps/web/src/middleware/validate-object-id.js`) on `userId`/`projectId`/`requestId`/`domainId`/`scopeId` → 404 page instead of CastError 500. _Effort: S. Fixed 2026-07-03._
- [x] **Log-redaction pattern gaps** — `apps/worker/src/deployment/log-capture.js` matched only fixed-length `ghp_…` tokens; missed `github_pat_…` fine-grained PATs and AWS keys. `packages/security/src/redact.js` was exact-key/case-sensitive, so `Authorization`, `deployHookTokenHash`, `installationToken` etc. were not redacted. **Fix (applied):** broadened patterns; case-insensitive key matching; added missing keys. _Effort: S. Fixed 2026-07-02._

### LOW

- [x] **Non-constant-time deploy-hook token compare** — `hashToken(raw) === storedHash` string compare. Exploitation requires a SHA-256 preimage (infeasible), but the codebase's own webhook path models the right pattern. **Fix (applied):** `crypto.timingSafeEqual` on the hash buffers. _Effort: S. Fixed 2026-07-02._
- [x] **`deployHookTokenHash` leaked into render context** — `require-project-role.js` put the full project doc (including the hash) on `res.locals.currentProject`, and the deploy-hook GET passed raw `req.project` to the view. Only a hash, so minimal impact. **Fix (applied):** field stripped from locals; GET masks like the POST already did. _Effort: S. Fixed 2026-07-02._
- [x] **Deploy triggers had no dedicated rate limiter** — deployment-create/rollback relied on the production-only `generalLimiter`. **Fix (applied):** `deployActionLimiter` on `POST /:slug/deployments` and `/:slug/rollback`. _Effort: S. Fixed 2026-07-02._

---

## 2. Efficiency & code quality

### HIGH

- [x] **`noCache` flag was dead code** — "Deploy without cache" threaded `noCache` from the UI through the job payload, but the worker never read it and `buildDockerImage` never added `--no-cache`. The UI option silently did nothing. **Fix (applied):** flag now passed through `build-deployment.job.js` into `buildDockerImage`. _Effort: S. Fixed 2026-07-02._
- [x] **~80% duplicated worker pipeline** — `activate-release.job.js` and `rollback-release.job.js` duplicate port-alloc → network → secrets → start → startup delay → health-check → nginx → container-swap almost verbatim, plus identical `logEvent`/`updateStatus` helpers (also in `build-deployment.job.js`) and constants. **Fix (applied):** shared `apps/worker/src/deployment/pipeline.js` (`runReleasePipeline` + shared helpers); jobs are thin handlers, -800/+83 lines. See `docs/phases/phase-4-worker-pipeline-extraction.md`. _Effort: M–L. Fixed 2026-07-03._
- [x] **One-active-deployment check triplicated** — identical `Deployment.findOne({projectId, status: {$in: [...]}})` block at `deployment.service.js:162`, `:316`, `:427`. **Fix (applied):** `findInFlightDeployment(projectId)` + `IN_FLIGHT_STATUSES` in `deployment.service.js`. _Effort: S. Fixed 2026-07-03._
- [x] **In-memory state breaks under multi-instance** — webhook dedup Map (above) plus SSE per-user/per-IP stream-cap maps in `deployment.controller.js:150`. With >1 web replica, dedup and limits are per-process. **Fix (applied):** webhook dedup moved to Redis 2026-07-03; SSE stream caps moved to Redis INCR/DECR with TTL (`apps/web/src/services/sse-limiter.js`, in-memory fallback) 2026-07-04. See `docs/phases/phase-10-sse-redis.md`. _Effort: M. Fixed 2026-07-04._
- [x] **Docker images leak on activation failure** — `retention.js` only trims excess HEALTHY releases and `removeDockerImage` ran only on build failure; a deployment that built OK but failed activation (crash-loop, health check, nginx) kept its image forever. **Fix (applied):** image removed on post-build failure paths in `activate-release.job.js` (safe: fresh builds have unique tags; rollback-release untouched since it reuses the source image). _Effort: S. Fixed 2026-07-02._

### MEDIUM

- [x] **SSE log streaming is DB-heavy** — `deployment.controller.js:254` polls every 1.5 s with two queries per tick per viewer. **Fix (applied):** the worker's `logEvent` publishes to `deploy-logs:<deploymentId>`; SSE subscribes on a dedicated connection and the DB poll drops to a 10 s completeness sweep (or stays at 1.5 s as the sole source when Redis is down). Terminal statuses are also pushed. See `docs/phases/phase-10-sse-redis.md`. _Effort: M. Fixed 2026-07-04._
- [x] **Fixed 3 s sleep in activation** — `STARTUP_DELAY_MS` flat `setTimeout` in activate/rollback ties up a worker slot. **Fix (applied):** the shared pipeline polls `inspectContainer` every 500 ms within the startup window, failing as soon as a crash is visible. _Effort: S. Fixed 2026-07-03._
- [x] **Port allocator race + full scan** — `port-allocator.js` scans all non-terminal deployments and has a check-then-use race; two concurrent activations can claim the same port. **Fix (applied):** `allocatePort(deploymentId)` now claims scan → write → verify with a deterministic lower-`_id` tie-break and bounded retries; the full-range scan remains (fine at current scale). _Effort: M. Fixed 2026-07-03._
- [x] **No cache policy on static assets** — `express.static` served CSS/JS with no `maxAge`; every page load revalidated. **Fix (applied):** `maxAge: '1h'` (modest because filenames aren't content-hashed). Follow-up: hashed filenames + `immutable, 1y`. _Effort: S (applied) / M (hashing). Fixed 2026-07-02._
- [x] **Sequential awaits with no dependency** — e.g. `project.controller.js:85-96` (repository → deployment → deployments list) and the create/retry lookup chains in `deployment.service.js`. **Fix (applied):** overview render now fetches repository/deployments/secret-names via `Promise.all`. The deployment.service chains turned out to be genuinely dependent (project → repository), so they stay sequential. _Effort: S. Fixed 2026-07-03._
- [ ] **`getUserProjects` sorts in JS** — populates all memberships then sorts client-side, no limit. Fine at current scale; fix when project counts grow. _Effort: S._ → Phase 16

### LOW

- [x] **Silently swallowed errors** — empty `catch {}` in `domain.service.js:45,252`, `github.service.js:210`, `auth.controller.js:41` (the `server-stats.service.js` ones are acceptable defaults). **Fix (applied):** warn logs on the domain queue-failure revert and Turnstile outage paths; debug log on webhook signature buffer errors. `domain.service.js:45` already converted the exception into a typed validation error, so it was left alone. _Effort: S. Fixed 2026-07-03._
- [x] **Test coverage gaps (biggest untested surfaces)** — no direct tests for worker job orchestration (`build/activate/rollback.job.js`), `port-allocator`, `retention`/`cleanup`, `project.service` CRUD, `admin.service` quota consumption, or the SSE controller loop. These are prerequisites for the pipeline-extraction refactor above. **Fix (applied):** +56 tests on an in-memory-Mongo harness (`tests/worker/`, `tests/helpers/`); SSE controller loop still untested. See `docs/phases/phase-3-worker-pipeline-tests.md`. _Effort: L. Fixed 2026-07-03._
- [ ] **`requireProjectRole` does two sequential finds per request** — project then membership; could be one aggregation or parallel. _Effort: S._ → Phase 16

---

## 3. User experience

### HIGH

- [x] **No guided onboarding** — creating a project drops the user on the overview with no stepper/checklist for the required path (connect repo → detection → env secrets → submit for review → deploy). Each page repeats the sequence only inside its own empty state. A DRAFT project shows "Submit for Review" with no hint about what must be completed first. **Fix (applied):** "Get your app live" checklist card on `show.ejs` (owner-only, hidden after first deploy) driven by repositoryId/runtimeType/secret count/status/activeDeploymentId. _Effort: M. Fixed 2026-07-03._
- [x] **Inline form errors are inconsistent** — `new/edit/repository` show per-field errors, but the build-configuration, build-filters, deploy-hook, and maintenance forms surface failures only as flash banners; `environment.ejs` shows only `errors.form`. **Fix (applied):** build-configuration, build-filters, maintenance, and environment forms now re-render with `form-errors` + per-field errors and sticky values. Deploy-hook generate/revoke are button-only actions with no input fields, so flash remains the right surface there. _Effort: M. Fixed 2026-07-03._

### MEDIUM

- [ ] **Navigation drift** — the contextual sidebar and the show-page "Quick Links" card expose different sets of pages (sidebar has Domains but not Deploy Hook; Quick Links vice-versa; Settings appears in neither). **Fix:** single source of truth for project nav — ideally the consolidated Settings sub-nav noted in the Render-parity plan. _Effort: M._ → Phase 18
- [ ] **Thin dashboard** — shows only a 5-row project table duplicating `/projects`. **Fix:** recent deployment activity, failure alerts, "needs attention" items. _Effort: M._ → Phase 18
- [ ] **Deployments list doesn't auto-refresh** — in-progress rows show "Running…" statically until manual reload (the detail page has live SSE). Also the detail page hard-reloads 1.2 s after terminal status, which is jarring. **Fix:** light polling on the list; replace reload with in-place status swap. _Effort: S–M._ → Phase 18

### LOW

- [ ] **Raw enum copy** — `APPROVAL_REQUIRED`, `triggerType`, `deploymentMode` values shown semi-raw in places (`show.ejs:60`). _Effort: S._ → Phase 18
- [ ] **"● Live" indicator is color/glyph-only** — minor a11y gap; status badges elsewhere have aria-labels. _Effort: S._ → Phase 18
- Positives worth keeping: skip link, focus-trapped drawer/modals, `aria-live` flash regions, reduced-motion support, responsive tables, consistent confirm-modal pattern for destructive actions.

---

## 4. Documentation

### HIGH

- [x] **New features entirely undocumented** — deploy hooks, build filters, per-project maintenance mode, notification preferences, delete-vs-archive, health-check path, and deploy-without-cache appear nowhere in `docs/USER_GUIDE.md`, `docs/FAQ.md`, or `README.md`. **Fix (applied):** USER*GUIDE sections + README feature list added. \_Effort: S. Fixed 2026-07-02.*

### MEDIUM

- [x] **No environment-variable reference** — config keys are scattered across `.env.example` and install docs. **Fix (applied):** `docs/ENVIRONMENT.md` tables (name, used by, required-in-prod, default, purpose). _Effort: S. Fixed 2026-07-04._
- [x] **CLAUDE.md is only a skill router** — it doesn't describe web/worker/package responsibilities or the feature set, so agent sessions re-derive the architecture every time. **Fix (applied):** Architecture section added (apps, packages, pipeline stages, infra assumptions, test harness). _Effort: S. Fixed 2026-07-04._
- [x] **Transient working notes live in docs/** — `WEB_APP_COMPREHENSIVE_ANALYSIS.md` and `TODAY_WEB_APP_REMEDIATION_TODO.md` are session artifacts, now superseded by this file. **Fix (applied):** both had zero open items; deleted (history preserves them). _Effort: S. Fixed 2026-07-04._

### LOW

- [x] **No CONTRIBUTING.md** — dev setup is 5 lines in the README. **Fix (applied):** CONTRIBUTING.md with setup, quality gates, conventions, and doc pointers. _Effort: S. Fixed 2026-07-04._
- [x] **FAQ freshness** — covers health checks but none of the newer features. **Fix (applied):** "Automation and Operations" FAQ section covering deploy hooks, build filters, maintenance mode, notifications, no-cache deploys, and health-check paths. _Effort: S. Fixed 2026-07-04._

---

## 5. Explicitly out of scope / accepted risks

- **CSP `upgradeInsecureRequests` disabled** — TLS terminates at Cloudflare; nginx listens HTTP-only internally. Accepted.
- **`generalLimiter` production-only** — intentional for local dev ergonomics; dedicated limiters (auth, deploy hook, deploy actions) run in all environments' production config.
- **Blueprint docs (`hellodeploy-blueprint/`) diverging from code** — they are forward-looking specs, not code truth; treat accordingly rather than trying to keep in lockstep.

---

## Suggested order of attack

1. Remaining security MEDIUMs: Redis webhook dedup, admin ObjectId guards (small, close the audit).
2. Test coverage for the worker pipeline (unblocks the big refactor safely).
3. Worker pipeline extraction + one-active-deployment helper (largest maintainability win).
4. UX: onboarding checklist + inline-error standardization (biggest user-facing wins).
5. SSE → Redis pub/sub and multi-instance state, when/if scaling beyond one web replica.

---

# Round 2 — analyzed 2026-07-06 (commit `0adee42`)

Second full-codebase pass (web, worker, packages, tests, tooling). Round 1 fundamentals held up; these are the remaining gaps, phased in [docs/phases/README.md](phases/README.md) as Phases 11–18. Item IDs (W/S/E/P/U) are referenced by the phase files.

## 1. Security & correctness

### HIGH

- [x] **W1 — Rollback shares its image with the source deployment; retention can delete it** — `recordImageTagOnStart` copies `imageTag` onto the rollback's deployment record (`pipeline.js:238`, `rollback-release.job.js:109`), so two records reference one image. When the source falls out of the 3-HEALTHY retention window, `retention.js:57` removes that image; a later restart/rollback resolving the surviving record's `imageTag` fails. `retention.js` also lacks the `activeDeploymentId` guard `cleanup-releases.job.js:9-11` has — the two cleanup paths disagree. **Fix (applied):** `isImageTagInUse` guard shared by `retention.js` and `cleanup-releases.job.js`; both also now skip the project's `activeDeploymentId`. _Effort: M. Fixed 2026-07-06._ → Phase 11
- [x] **W3 — Silent stuck-in-DEPLOYING when the queue singleton is unset** — `enqueueActivateRelease` no-ops if `getWorkerQueue()` is null (`build-deployment.job.js:20-23`): build reports success, activation is never enqueued, deployment stays DEPLOYING forever. Unknown job types also complete successfully (`worker.js:88`). **Fix (applied):** `enqueueActivateRelease` throws and the deployment is marked FAILED (`ACTIVATION_ENQUEUE_FAILED`); unknown job types throw in `worker.js` so BullMQ marks the job failed. _Effort: S. Fixed 2026-07-06._ → Phase 11
- [ ] **S1 — No master-key rotation path** — `packages/security/src/encryption.js` uses the raw 32-byte key (no KDF), hardcodes `CURRENT_VERSION = 1`, and `decrypt` rejects any other version. Rotating `HELLODEPLOY_MASTER_KEY` bricks every stored secret. **Fix:** key-id + HKDF-derived data keys, `HELLODEPLOY_MASTER_KEY_PREVIOUS` keyring (decrypt-any/encrypt-newest), re-encrypt script. _Effort: L._ → Phase 14

### MEDIUM

- [ ] **W2 — Dockerfile injection defense is single-layer** — `dockerfile-generator.js:65,84` interpolates `buildCommand`/`startCommand` raw into `RUN`/`CMD`; the only guard is the web-side control-char validator (`project.validator.js:40`). Any other write path to the DB bypasses it. **Fix:** shared validation helper re-run in the worker before templating. _Effort: S._ → Phase 12
- [x] **W4 — ACTIVATE_RELEASE retry can leak the first attempt's container** — attempts:2; a thrown error after `startContainer` re-runs the pipeline without cleaning up the prior container. **Fix (applied):** the pipeline inspects the deterministic container name before `startContainer` and removes any leftover from a prior attempt. _Effort: S–M. Fixed 2026-07-06._ → Phase 11
- [x] **W5 — Per-deployment `resourceLimits` is dead config** — `build-deployment.job.js:286` sends limits in the ACTIVATE payload but `pipeline.js:227-228` hardcodes 256MB/0.25cpu; quota-driven limits are never applied. **Fix (applied):** payload `resourceLimits` threaded into `startContainer` (memoryMb/cpuCores/pidsLimit), current values kept as defaults. _Effort: S. Fixed 2026-07-06._ → Phase 11
- [x] **W7 — `NGINX_ENABLED=false` marks deployments HEALTHY with no route** (`pipeline.js:325`) — a prod misconfiguration yields "successful" but unreachable deploys. **Fix (applied):** worker refuses to boot in production with nginx disabled unless `NGINX_DISABLED_ACK=true`; dev mode logs a WARN deploy event instead. _Effort: S. Fixed 2026-07-06._ → Phase 11
- [ ] **W10 — Worker emits zero audit events** — build/activate/rollback/delete-project/secret decryption never call `writeAuditEvent`; only 30-day-TTL deployment events exist. _Effort: M._ → Phase 15
- [ ] **S2 — Audit-event TTL is 7 days; metadata is unvalidated `Mixed`** (`audit-event.model.js`) — short for a security trail. **Fix:** env-configurable TTL (default 90d), bounded/redacted metadata. _Effort: S–M._ → Phase 15
- [ ] **S3 — Redaction is key-name-only** — `redact.js` misses secrets under unlisted keys; no value-pattern matching (JWT, `ghp_`/`github_pat_`, PEM, AWS keys); `Error` serializes to `{}`. _Effort: S–M._ → Phase 14
- [ ] **S4 — Admin role granularity** — audit CSV export, user/project suspension, and quota overrides are reachable by any ADMIN; only maintenance mode requires SUPER*ADMIN. Authorization is split between routes and services. **Fix:** SUPER_ADMIN gating + one consistent layer. \_Effort: M.* → Phase 15
- [ ] **S6 — Job payloads unvalidated at dequeue** — contracts typedefs are JSDoc-only; a malformed/tampered payload reaches handlers unchecked. **Fix:** per-JobType validators in `packages/contracts`, fail typed at dispatch. _Effort: M._ → Phase 12
- [ ] **P6 — All-zeros dev master key has no prod tripwire** — if prod forgets `NODE_ENV=production`, the zero key is silently used. **Fix:** refuse to start when the key equals the dev default outside development. _Effort: S._ → Phase 14

### LOW

- [ ] **W8 — Build-context symlink scrub is top-level only** (`build-context.js:75-89`) — nested symlinks escaping root aren't unlinked (docker tar limits impact). _Effort: S._ → Phase 12
- [x] **W9 — Port allocator never probes the OS** — DB-claim only; TOCTOU window before `docker run`. **Fix (applied):** `probePortFree` loopback bind test after claim; busy ports excluded from subsequent scans and the claim retries. _Effort: S. Fixed 2026-07-06._ → Phase 11
- [ ] **S5 — Residual validation gaps** — `postAdminSetQuota` silently drops unparseable numerics (`admin.controller.js:234`); `postAddDomain` has no controller-level hostname validation; project routes' `:deploymentId`/`:userId`/`:domainId` skip `validateObjectId`. _Effort: S._ → Phase 12
- [ ] **S7 — Hand-rolled GitHub App JWT untested** (`apps/worker/src/git/github-token.js`). _Effort: S._ → Phase 17
- [ ] **S8 — Failed nginx-config restore only logs "CRITICAL"** (`route-manager.js:120`) — no alert hook or audit event. _Effort: S._ → Phase 15

## 2. Efficiency & code quality

### HIGH

- [ ] **W6 — Docker disk-growth vectors** — `delete-project.job.js` stops only the active container: project images, the per-project network, and retained non-active containers leak on every deletion. No dangling-image pruning anywhere; container logs are unbounded (no `--log-opt max-size`); the build-workspace sweep promised in `cleanup-releases.job.js:19-20`'s docstring is unimplemented (crashed-worker workspaces never reclaimed). _Effort: M._ → Phase 13
- [ ] **E1 — Maintenance-mode check hits Mongo on every request** — `maintenance-mode.js:14` → uncached `PlatformSetting.findOne()` platform-wide. **Fix:** short-TTL cache + Redis pub/sub invalidation on toggle. _Effort: S–M._ → Phase 16

### MEDIUM

- [ ] **E2 — Fresh full clone per deploy** — no per-repository bare-clone cache; `getDirectorySize` does an O(n) stat walk per build (`build-context.js:34`). _Effort: M._ → Phase 16
- [ ] **P3 — Duplicated env-config helpers** — `apps/web/src/config/env.js` and `apps/worker/src/config/env.js` re-declare `required`/`optional` and overlapping vars. **Fix:** shared `packages/config`. _Effort: S–M._ → Phase 16

### LOW

- [ ] **E4 — `getRollbackTargets` unbounded** (`deployment.service.js:538`) — add a limit. _Effort: S._ → Phase 16
- Round 1 leftovers `getUserProjects` JS sort and `requireProjectRole` double find → Phase 16 (annotated above).

### Deferred

- **E3 — SSE keeps a 10 s DB sweep alongside pub/sub** — intentional completeness fallback (DB is source of truth); 2 queries/tick/stream is acceptable at current scale.

## 3. Process & tooling

### HIGH

- [ ] **P1 — CI has no security or coverage gates** — `ci.yml` runs lint/format/test only: no `npm audit`, no dependency scan, no coverage report, no CodeQL/SAST. **Fix:** `npm audit --omit=dev` (fail on high), coverage report-only first (threshold once baselined), CodeQL workflow. _Effort: S–M._ → Phase 17

### MEDIUM

- [ ] **P4 — Untested risk surfaces** — `delete-project.job` / `stop-project.job` (destructive; → Phase 13), `github-token.js` JWT, `deploy-log-stream.js`, and webhook/deployment controllers have no direct tests. _Effort: M._ → Phases 13 & 17

### LOW

- [ ] **P2 — No git hooks** — lint/format enforced only in CI. **Fix:** pre-commit lint-staged. _Effort: S._ → Phase 17
- [ ] **P5 — Repo hygiene** — WORKLOG.md at ~1145 lines; unused `.gitkeep` scaffolding dirs (`apps/web/src/{models,repositories}`, `apps/worker/src/{docker,metrics,nginx,security}`). _Effort: S._ → Phase 17

## 4. User experience

Open Round 1 §3 items (navigation drift, thin dashboard, deployments auto-refresh, enum copy, Live-indicator a11y) → Phase 18, annotated in place above. One new item:

### MEDIUM

- [ ] **U5 — Webhook-triggered deploy failures are invisible to users** — after the fast 200, handler errors are only logged (`webhook.controller.js:314`); a failed push-deploy leaves no user-facing signal. Resolves the `webhook.controller.js:193` TODO. **Fix:** persist last trigger failure on the project; surface on dashboard/overview. _Effort: M._ → Phase 18

## Positives confirmed this round

Nonce-based CSP with `scriptSrcAttr 'none'`; timing-safe compares on every token path; Argon2id at OWASP params; session regeneration on sign-in; secrets AES-256-GCM at rest and never rendered; argv-only spawns (no shell) across git/docker/nginx; `--network none` + memory-capped builds; cap-dropped, loopback-published, pids-limited containers; zero-downtime nginx swap ordering; Redis-backed rate limits failing closed in prod; comprehensive Mongo indexes; 74 behavioral test files with no skipped tests; exactly one TODO marker in the whole tree.
