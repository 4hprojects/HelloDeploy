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
- [ ] **~80% duplicated worker pipeline** — `activate-release.job.js` and `rollback-release.job.js` duplicate port-alloc → network → secrets → start → startup delay → health-check → nginx → container-swap almost verbatim, plus identical `logEvent`/`updateStatus` helpers (also in `build-deployment.job.js`) and constants. **Fix:** extract shared `apps/worker/src/deployment/pipeline.js` + `jobs/_helpers.js`. _Effort: M–L (touches the critical deploy path — do with good test coverage first, see test gaps below)._
- [ ] **One-active-deployment check triplicated** — identical `Deployment.findOne({projectId, status: {$in: [...]}})` block at `deployment.service.js:162`, `:316`, `:427`. **Fix:** extract `findActiveDeployment(projectId)` + a shared ACTIVE*STATUSES constant. \_Effort: S.*
- [ ] **In-memory state breaks under multi-instance** — webhook dedup Map (above) plus SSE per-user/per-IP stream-cap maps in `deployment.controller.js:150`. With >1 web replica, dedup and limits are per-process. **Fix:** move to Redis. _Effort: M._
- [x] **Docker images leak on activation failure** — `retention.js` only trims excess HEALTHY releases and `removeDockerImage` ran only on build failure; a deployment that built OK but failed activation (crash-loop, health check, nginx) kept its image forever. **Fix (applied):** image removed on post-build failure paths in `activate-release.job.js` (safe: fresh builds have unique tags; rollback-release untouched since it reuses the source image). _Effort: S. Fixed 2026-07-02._

### MEDIUM

- [ ] **SSE log streaming is DB-heavy** — `deployment.controller.js:254` polls every 1.5 s with two queries per tick per viewer. **Fix:** single combined query short-term; Redis pub/sub from the worker's `logEvent` long-term. _Effort: M._
- [ ] **Fixed 3 s sleep in activation** — `STARTUP_DELAY_MS` flat `setTimeout` in activate/rollback ties up a worker slot. **Fix:** poll `inspectContainer` with short backoff. _Effort: S._
- [ ] **Port allocator race + full scan** — `port-allocator.js` scans all non-terminal deployments and has a check-then-use race; two concurrent activations can claim the same port. **Fix:** atomic claim (unique partial index on `containerPort` or Redis-based allocation). _Effort: M._
- [x] **No cache policy on static assets** — `express.static` served CSS/JS with no `maxAge`; every page load revalidated. **Fix (applied):** `maxAge: '1h'` (modest because filenames aren't content-hashed). Follow-up: hashed filenames + `immutable, 1y`. _Effort: S (applied) / M (hashing). Fixed 2026-07-02._
- [ ] **Sequential awaits with no dependency** — e.g. `project.controller.js:85-96` (repository → deployment → deployments list) and the create/retry lookup chains in `deployment.service.js`. **Fix:** `Promise.all` the independent pairs. _Effort: S._
- [ ] **`getUserProjects` sorts in JS** — populates all memberships then sorts client-side, no limit. Fine at current scale; fix when project counts grow. _Effort: S._

### LOW

- [ ] **Silently swallowed errors** — empty `catch {}` in `domain.service.js:45,252`, `github.service.js:210`, `auth.controller.js:41` (the `server-stats.service.js` ones are acceptable defaults). **Fix:** log at debug level minimum. _Effort: S._
- [ ] **Test coverage gaps (biggest untested surfaces)** — no direct tests for worker job orchestration (`build/activate/rollback.job.js`), `port-allocator`, `retention`/`cleanup`, `project.service` CRUD, `admin.service` quota consumption, or the SSE controller loop. These are prerequisites for the pipeline-extraction refactor above. _Effort: L._
- [ ] **`requireProjectRole` does two sequential finds per request** — project then membership; could be one aggregation or parallel. _Effort: S._

---

## 3. User experience

### HIGH

- [ ] **No guided onboarding** — creating a project drops the user on the overview with no stepper/checklist for the required path (connect repo → detection → env secrets → submit for review → deploy). Each page repeats the sequence only inside its own empty state. A DRAFT project shows "Submit for Review" with no hint about what must be completed first. **Fix:** progress checklist card on `show.ejs` driven by project state (repo connected? runtime detected? secrets set? status). _Effort: M._
- [ ] **Inline form errors are inconsistent** — `new/edit/repository` show per-field errors, but the build-configuration, build-filters, deploy-hook, and maintenance forms surface failures only as flash banners; `environment.ejs` shows only `errors.form`. **Fix:** standardize on the `form-errors` + per-field pattern across all forms. _Effort: M._

### MEDIUM

- [ ] **Navigation drift** — the contextual sidebar and the show-page "Quick Links" card expose different sets of pages (sidebar has Domains but not Deploy Hook; Quick Links vice-versa; Settings appears in neither). **Fix:** single source of truth for project nav — ideally the consolidated Settings sub-nav noted in the Render-parity plan. _Effort: M._
- [ ] **Thin dashboard** — shows only a 5-row project table duplicating `/projects`. **Fix:** recent deployment activity, failure alerts, "needs attention" items. _Effort: M._
- [ ] **Deployments list doesn't auto-refresh** — in-progress rows show "Running…" statically until manual reload (the detail page has live SSE). Also the detail page hard-reloads 1.2 s after terminal status, which is jarring. **Fix:** light polling on the list; replace reload with in-place status swap. _Effort: S–M._

### LOW

- [ ] **Raw enum copy** — `APPROVAL_REQUIRED`, `triggerType`, `deploymentMode` values shown semi-raw in places (`show.ejs:60`). _Effort: S._
- [ ] **"● Live" indicator is color/glyph-only** — minor a11y gap; status badges elsewhere have aria-labels. _Effort: S._
- Positives worth keeping: skip link, focus-trapped drawer/modals, `aria-live` flash regions, reduced-motion support, responsive tables, consistent confirm-modal pattern for destructive actions.

---

## 4. Documentation

### HIGH

- [x] **New features entirely undocumented** — deploy hooks, build filters, per-project maintenance mode, notification preferences, delete-vs-archive, health-check path, and deploy-without-cache appear nowhere in `docs/USER_GUIDE.md`, `docs/FAQ.md`, or `README.md`. **Fix (applied):** USER*GUIDE sections + README feature list added. \_Effort: S. Fixed 2026-07-02.*

### MEDIUM

- [ ] **No environment-variable reference** — config keys are scattered across `.env.example` and install docs. **Fix:** `docs/ENVIRONMENT.md` table (name, required, default, used by web/worker). _Effort: S._
- [ ] **CLAUDE.md is only a skill router** — it doesn't describe web/worker/package responsibilities or the feature set, so agent sessions re-derive the architecture every time. **Fix:** add a short "Architecture" section (apps, packages, deploy pipeline stages, key models). _Effort: S._
- [ ] **Transient working notes live in docs/** — `WEB_APP_COMPREHENSIVE_ANALYSIS.md` and `TODAY_WEB_APP_REMEDIATION_TODO.md` are session artifacts, now superseded by this file. **Fix:** fold anything still relevant into this backlog, then delete them. _Effort: S._

### LOW

- [ ] **No CONTRIBUTING.md** — dev setup is 5 lines in the README. _Effort: S._
- [ ] **FAQ freshness** — covers health checks but none of the newer features. _Effort: S._

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
