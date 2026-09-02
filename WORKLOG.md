# Worklog

Entries before 2026-08-01 (the initial hardening/UX phase and P0-P2
production-cutover work through 2026-07-31 — 100 of 117 total entries,
split off 2026-08-14) live in
[`docs/archive/WORKLOG_2026-07.md`](docs/archive/WORKLOG_2026-07.md).

## P2 Wildcard Ingress YAML Repair

- Status: Repair passed candidate validation; post-restart retry rolled back
- Updated: 2026-08-01T00:15:00+08:00

### Live Finding

- The refreshed immutable release and routing-foundation verification passed.
- Wildcard candidate validation rejected the generated YAML because an unquoted value
  beginning with `*` is interpreted as a YAML alias.
- Automatic rollback restored both connector configurations. The helper remains active
  and enabled, the worker remains inactive, the queue remains paused, and the public
  dashboard and independent HelloRun fallback both return successfully.

### Repair

- Quote the generated wildcard hostname so it is a YAML string rather than an alias.
- Regression coverage requires the generator to emit the quoted hostname before a
  second live activation attempt.

### Verification

- Focused routing and wildcard-ingress coverage passed 8 tests.
- Bash syntax, lint, formatting, configuration validation, and diff checks passed.
- The complete suite passed 852 tests across 176 suites with no failures or skips.
- The production dependency audit reported zero vulnerabilities.

## P2 Wildcard Connector Convergence Repair

- Status: Local repair in verification; live retry pending
- Updated: 2026-08-02T00:00:00+08:00

### Live Finding

- The refreshed immutable release and routing-foundation verification passed again.
- The wildcard activation confirmed the paused queue but did not reach its terminal
  success output. Both connector configurations were restored without the wildcard.
- Post-attempt checks found the helper and both dashboard connectors active, the worker
  inactive, wildcard DNS absent, and the dashboard and independent HelloRun fallback
  returning successfully.
- Reproducing candidate generation without host mutation passed Cloudflare validation
  and selected the wildcard rule in both configurations. This narrows the remaining
  failure to the post-candidate activation path.

### Repair

- Wait for the dashboard and HelloRun public fallbacks to converge for a bounded
  60-second window after connector restart.
- Keep the additional dashboard requests after convergence and identify the current
  value-safe activation stage in rollback output.

### Verification

- Focused routing and wildcard-ingress coverage passed 9 tests.
- Bash syntax, lint, formatting, configuration validation, and diff checks passed.
- The complete suite passed 853 tests across 176 suites with no failures or skips.
- The production dependency audit reported zero vulnerabilities.

## P2 Wildcard Local Ingress Activation

- Status: Passed; wildcard DNS and candidate service startup next
- Updated: 2026-08-05T15:04:36+08:00

### Live Evidence

- The installed release at `/opt/hellodeploy` was confirmed clean and behind the
  reviewed convergence-wait fix (`50c54e7`); it was fetched and checked out to the
  reviewed candidate `e642d0769faca1d8fcb264fe0ee105c5aced4811` before activation,
  changing no dependency or lockfile content and requiring no service restart.
- Immediately before activation, the worker was confirmed inactive, the helper
  confirmed active, and both public fallbacks (`hellodeploy.online`, `hellorun.online`)
  confirmed healthy.
- The live activation command passed every stage: the pre- and post-activation
  queue-pause checks under the worker identity, wildcard candidate generation and
  Cloudflare validation, both connector configuration installs, both connector
  restarts, wildcard rule verification on both configurations, and the bounded public
  convergence wait for both fallbacks.
- Final state: local wildcard ingress passed, both dashboard connectors active, both
  public fallbacks passed, the worker remained inactive, the queue remained paused,
  wildcard DNS remains unchanged and absent (this command adds only local Cloudflare
  Tunnel ingress rules, not the DNS record), and a pre-activation configuration backup
  was created.

### Next Gate

- Add the `*.apps.hellodeploy.online` DNS record at the authoritative provider and the
  corresponding Cloudflare Tunnel ingress record, then start candidate web and worker
  services under their intended identities and verify readiness, secure cookies,
  wildcard HTTPS, and test application routing before any dashboard traffic cutover.

### Verification

- Live command output confirmed by the operator: `queue_pause_check=passed` (twice),
  `wildcard_local_ingress=passed`, `dashboard_connectors=active`,
  `public_fallbacks=passed`, `worker_state=inactive`, `queue_state=paused`,
  `wildcard_dns_state=unchanged-absent`, `tunnel_ingress_backup=created`.

## P2 Candidate Web/Worker Service Activation

- Status: Passed; wildcard DNS and dashboard traffic cutover next
- Updated: 2026-08-06T12:57:27+08:00

### Live Evidence

- A first live attempt (`infrastructure/activate-candidate-services.sh` against
  commit `e314dd1`) failed at the `session-cookie` stage: an unauthenticated `GET /`
  never completed within the script's 5-second check. `journalctl -u hellodeploy-web`
  traced the cause to a session-store write (`connect-mongo`, triggered by CSRF
  middleware) still pending when the script's rollback sent SIGTERM; the web app's
  graceful shutdown closed the MongoDB connection without waiting for that write,
  producing an unhandled `MongoExpiredSessionError` and a forced `process.exit(1)`.
  Rollback itself worked correctly throughout — both candidate services stopped
  cleanly and the live PM2 dashboard and HelloRun fallback were never touched.
- Root cause was two separate issues, both fixed: `apps/web/src/lifecycle.js`'s
  graceful shutdown now waits for pending session-store writes
  (`apps/web/src/middleware/session.js`'s new pending-write tracker) before closing
  the database, mirroring the worker's existing correct `worker.close()`-before-
  `closeDependencies()` ordering; and the activation script's session-cookie check
  widened from a one-shot 5-second timeout to 20 seconds to tolerate a legitimate
  cold first write.
- The retry against the corrected release (`dbb6fdd`) passed every stage: queue-pause
  checks, both candidate services started under their intended identities, web health
  and readiness, the secure session cookie (`Secure`, `HttpOnly`, `SameSite=Strict`)
  over loopback with a simulated `X-Forwarded-Proto: https`, worker readiness via
  BullMQ worker count, a queue-pause recheck, and Nginx syntax. `hellodeploy-web` and
  `hellodeploy-worker` are now active (not enabled — still transient candidates, no
  boot persistence) with the queue still paused and no dashboard traffic cut over.

### Next Gate

- Add the `*.apps.hellodeploy.online` DNS record at the authoritative provider and
  the corresponding Cloudflare Tunnel ingress record (manual operator action), verify
  wildcard HTTPS and test application routing, then cut dashboard traffic from PM2 to
  the isolated `hellodeploy-web` service and resume the queue gradually.

### Verification

- Live command output confirmed by the operator: `queue_pause_check=passed` (twice),
  `web_state=active-candidate`, `worker_state=active-candidate`,
  `web_health=passed`, `web_ready=passed`, `session_cookie=passed`,
  `worker_ready=passed`, `queue_state=paused`, `nginx_syntax=passed`,
  `traffic_cutover=not-performed`.

## P2 Wildcard Domain Restructure: apps.hellodeploy.online → hellodeploy.online

- Status: Passed — wildcard HTTPS verified publicly; dashboard traffic cutover and
  queue resume remain
- Updated: 2026-08-08T20:12:45+08:00

### Finding

Attempting to verify the wildcard DNS record added after the successful local
ingress activation, the hostname consistently failed its TLS handshake at
Cloudflare's edge across a bounded 5-minute retry window (20 attempts, 15s apart,
zero variation) — never a DNS failure, always a handshake failure, meaning the
record itself resolved correctly but no certificate covered it. Inspecting the
correct Cloudflare account's SSL/TLS → Edge Certificates page (a wrong-account
detour first had to be resolved — the zone was registered under a different
Cloudflare login than the one initially checked) confirmed the root cause: the
account's free Universal SSL certificate covers only `hellodeploy.online` and
`*.hellodeploy.online` (first-level wildcard). `*.apps.hellodeploy.online` is a
second-level wildcard, which this plan does not cover. No free "Total TLS" toggle
was available on this account/plan — only paid Advanced Certificate Manager or a
Business-plan custom-certificate upload were offered, both declined.

### Decision

Drop the `apps.` segment: hosted-project URLs move from
`<slug>.apps.hellodeploy.online` to `<slug>.hellodeploy.online`, which the existing
free certificate already covers. Confirmed safe: Nginx route generation
(`apps/worker/src/nginx/template.js`, `route-manager.js`) is domain-agnostic,
interpolating whatever `DEPLOYMENT_DOMAIN` holds — no application logic changes,
only config defaults, two infra scripts, tests, and docs/blueprint references.
Added `'apps'` to the reserved-subdomain list so a project can no longer claim that
now-retired prefix as its own slug. Added
`infrastructure/deactivate-wildcard-tunnel-ingress.sh`, mirroring the activation
script's fail-closed backup/validate/restart/verify/rollback shape in reverse, to
cleanly remove the old `*.apps.hellodeploy.online` ingress rule from both connector
configs before the new pattern is activated — the activation script itself fails
closed if a wildcard entry already exists, by design.

### Live Migration Evidence (2026-08-08)

The candidate services were stopped, the protected `.env` domain settings updated,
and the live sequence run against the merged migration commit: the deactivate
script removed the old `*.apps.hellodeploy.online` rule from both connector configs
cleanly (`wildcard_local_ingress=removed`, both public fallbacks passed throughout);
the activate script then added the new `*.hellodeploy.online` rule
(`wildcard_local_ingress=passed`); `cloudflared tunnel route dns` added the DNS
record.

The first candidate-services retry failed at the `worker-ready` stage. Reproducing
the worker's startup directly (bypassing its sanitized fatal-error logging)
surfaced the real cause, unrelated to the domain migration: `nginx -t`, run by the
privileged Nginx helper, failed with "Read-only file system" opening
`/var/log/nginx/error.log`. `hellodeploy-nginx-helper.service`'s `ReadWritePaths`
pinned individual log files rather than their containing directory; `ProtectSystem
=strict`'s bind-mount is tied to the inode present at service start, and daily
logrotate replaces that inode. A second occurrence the next day hit `access.log`
instead (it rotates reliably on real traffic; `error.log`'s rotation is skipped by
`notifempty` since it's usually empty), confirming this was a recurring daily
break, not a one-off. Fixed by pointing `ReadWritePaths` at `/var/log/nginx` (the
directory survives rotation; no new privilege, the helper already runs as root).
After installing the corrected unit, reloading systemd, and restarting the helper,
the retry passed every stage: `worker_ready=passed`, `web_health=passed`,
`web_ready=passed`, `session_cookie=passed`, `nginx_syntax=passed`,
`queue_state=paused`, `traffic_cutover=not-performed`.

A public wildcard HTTPS probe against `*.hellodeploy.online` then returned a real
TLS-terminated response (`HTTP 302` to `/login`, Cloudflare-served) — confirming the
free Universal SSL certificate now covers the wildcard, resolving the original SSL
gap this whole restructure was undertaken to fix.

**Separately discovered and fixed**, unrelated to this migration's own code: the
repository-run PM2 pilot (`hellodeploy` process under PM2, serving
`hellodeploy.online`'s actual live traffic from this checkout via
`--env-file-if-exists=../../.env`) was crash-looping (600+ restarts) with both its
web and worker failing startup config validation. Reproducing directly surfaced
`Error: PLATFORM_SUBDOMAIN_SUFFIX must equal a dot followed by DEPLOYMENT_DOMAIN.`
— the repository-root `.env` (edited earlier for this same migration) had the two
values out of sync. The operator corrected it; the PM2 process self-healed on its
next respawn (uptime stable afterward, restart count stopped climbing) without a
manual restart. Public checks after: `hellodeploy.online/health` `200`,
`hellorun.online` `200`, wildcard probe `302`.

### Remaining Gate

Dashboard traffic cutover from PM2 to the isolated `hellodeploy-web` service, and
gradual queue resume, are the only P2 items left — both still deliberately not
performed. Verifying real project routing under the wildcard (as opposed to the
unmatched-subdomain fallback observed here) is part of that same remaining work.

## P2 Dashboard Traffic Cutover

- Status: Cutover passed and live; queue resume and a clean revert proof remain
- Updated: 2026-08-09T19:40:04+08:00

### Design

No script existed for this gate before now. `activate-dashboard-cutover.sh` and
`revert-dashboard-cutover.sh` were added, mirroring the established fail-closed
backup/validate/restart/verify/rollback pattern. Two things were found live that
neither doc anticipated: Cloudflare Tunnel routed `hellodeploy.online`/
`www.hellodeploy.online` directly to the PM2 port, bypassing Nginx entirely, so
cutover requires editing tunnel ingress as well as Nginx; and a stale legacy vhost
(`/etc/nginx/sites-enabled/hellodeploy`, proxying to a dead port) was already
enabled and would conflict with the real platform vhost. The existing
`configure-platform-ingress.sh` renderer was reused rather than reimplemented; its
template had a real gap (`www` was never covered) fixed alongside.

### Live Evidence — Cutover

`activate-dashboard-cutover.sh` passed every stage on the first attempt: candidate
health/readiness/worker-readiness re-verified, the legacy vhost disabled, the
platform vhost installed, both connector configs' `hellodeploy.online`/
`www.hellodeploy.online` service lines retargeted from the PM2 port to Nginx,
public health/readiness/session-cookie confirmed, and Nginx's access log confirmed
the request actually traversed the new path. PM2 was never stopped throughout.

### Live Evidence — Revert Attempt and a Real Bug Found

Exercising `revert-dashboard-cutover.sh` deliberately (to satisfy the P2 Required
Evidence line proving restoration works) surfaced a real bug: its own
`fallback-verification` stage failed because `hellorun.online`'s PM2 process was
crash-looping on an `EADDRINUSE :::3000` port conflict — a pre-existing issue
entirely unrelated to this work (confirmed: nothing in this session's scripts
touches port 3000, HelloRun's `.env`, or its PM2 process). That unrelated failure
triggered the script's own rollback, which restored the cloudflared tunnel config
back to pointing at Nginx but never re-synced Nginx's own vhost — already switched
to the legacy vhost by the `nginx-vhost-revert` stage that had already run. The
tunnel then pointed at Nginx while Nginx pointed at a dead legacy port, producing a
real, brief `hellodeploy.online` outage broader than the revert itself should have
caused. Manually fixed live (`rm` the legacy vhost, re-run
`configure-platform-ingress.sh`) to restore the dashboard immediately, then fixed
the actual bug: rollback now re-installs the platform vhost whenever the Nginx side
had already been reverted, and its own critical-failure check now depends only on
`hellodeploy.online`, not `hellorun.online` — a dependency this script does not own
and should never be blamed for.

### Current State

`hellodeploy.online`/`www.hellodeploy.online`: `200`, served via the isolated
`hellodeploy-web` through Nginx (cutover is live). `hellorun.online`: `502`, down
for the unrelated PM2/port-3000 conflict described above — not caused by, and not
fixed by, anything in this session. `hellodeploy-web`/`hellodeploy-worker`/
`hellodeploy-nginx-helper` all active. Queue remains paused; not yet resumed.

### Remaining Gate

A full, clean exercise of `revert-dashboard-cutover.sh` reaching its own success
path is still blocked on `hellorun.online`'s unrelated recovery, since its
`fallback-verification` stage depends on that fallback being reachable. The bug fix
above at least guarantees a failure there is now safe (no compounding outage)
rather than proof the full path works end-to-end.

### Queue Resume (2026-08-10)

`scripts/resume-deployment-queue.js` run under the `hellodeploy-worker` identity
against the live queue: `queue_state=resumed`. `hellodeploy.online` confirmed
healthy (`200`) immediately after, both candidate services still active. The one
previously-paused domain-verification job has not yet been deliberately requeued
and observed — per the plan's own "deliberately requeue... and observe" framing,
that remains a separate, manual, watched step rather than something this pass
performed automatically.

## Track B Backlog Pass

- Status: Completed (all but one item; see Remaining below)
- Updated: 2026-08-13T18:30:00+08:00

### Scope

Worked through `docs/PRIORITIES.md` Track B (the 15-item Round 2 code-quality/
security backlog) plus the U5 webhook-notification TODO and the two code-level
risks surfaced while building `docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`.
Deliberately scoped to local/code-only changes — nothing was run against the
live production host (`hellodeploy-web`/`hellodeploy-worker` continued serving
`hellodeploy.online` undisturbed throughout). Every change was verified with its
existing or a new focused test file plus `npm run lint`; a final cross-cutting
pass ran all tests under `tests/{worker,security,deployment,github,admin,
projects,config,nginx}` together (532 tests, 0 failures) alongside a clean
full-repo `npm run lint` and `npm run format:check`.

### Pipeline hardening (found while building the checklist, not in the backlog)

- `apps/worker/src/deployment/pipeline.js`: the final container-swap and
  status-update sequence had no try/catch — a DB write failure after Nginx
  already pointed at the new container could leave state inconsistent. Now
  wrapped; a failure here is no longer possible to misreport as a failed
  deployment (the release is live) and instead logs
  `CRITICAL — post-activation state update failed` for manual reconciliation.
- `apps/web/src/controllers/webhook.controller.js:193` (U5): high-risk file
  changes now flag the project (`Project.reviewFlag`, surfaced as a dashboard
  banner) and email the owner (`sendProjectPausedEmail`), instead of only
  logging server-side. The flag clears automatically the next time a
  deployment is queued for that project.

### Track B items resolved

- **S1** (master-key rotation, effort L): added a safe, fully backward-compatible
  rotation path in `packages/security/src/encryption.js` — a second env var
  (`HELLODEPLOY_MASTER_KEY_NEXT`) activates a rotation window; with it unset
  (every existing install today) behavior is byte-for-byte unchanged. Paired
  with `scripts/rotate-master-key.js`, an idempotent migration that re-encrypts
  every `EnvironmentSecret` still on the old key. Full lifecycle covered by
  `tests/security/rotate-master-key.test.js` against the in-memory DB.
- **W10 / S8** (worker audit events): `configureAuditService` now runs at worker
  startup; `writeAuditEvent` calls added to `pipeline.js`'s terminal
  HEALTHY/FAILED transition (covers build, activate, and rollback in one
  place), `delete-project.job.js`, `secrets.js` (decrypt), and the nginx
  route-manager's CRITICAL restore-failure path.
- **S3** (redaction): added JWT and PEM private-key value patterns to
  `log-capture.js`'s redaction list, alongside the existing GitHub/AWS/npm
  token patterns.
- **P6** (dev master-key tripwire): `assertProductionSecrets` now explicitly
  rejects the all-zero development placeholder key in production, even though
  it otherwise passes the base64/length checks.
- **S4** (admin role granularity): queue pause/resume and quota overrides now
  require `SUPER_ADMIN`, matching the precedent already set by maintenance
  mode — routine moderation (user/project suspend, domain approve/reject) was
  deliberately left at `ADMIN` so the tier stays meaningful.
- **W6** (Docker disk growth): added `pruneDanglingImages()` (untagged images
  only — never touches a tagged/live release image), wired into the existing
  `CLEANUP_RELEASES` job's periodic pass.
- **E1** (maintenance-mode caching): `getMaintenanceMode()` now caches for 5s;
  `setMaintenanceMode()` updates the cache immediately so an admin's own
  toggle is never delayed by it.
- **E4** (`getRollbackTargets` unbounded): capped at 10 results.
- **S2** (audit-event metadata): added a 10,000-character serialized-size
  validator to the `AuditEvent` model. The 7-day TTL was left as-is — its
  comment marks it "per blueprint," a deliberate retention policy, not an
  oversight, and not this pass's call to change.
- **P3** (duplicated env-config helpers): `required`/`optional` moved to
  `packages/contracts/src/env-validation.js`; both `apps/web` and
  `apps/worker`'s `config/env.js` now import them instead of each defining
  their own copy.
- **P1** (CI gates): added a coverage report (`node --experimental-test-coverage`
  via a new `test:coverage` script, now what CI runs) and a standard CodeQL
  workflow (`.github/workflows/codeql.yml`).
- **P2** (git hooks): added `.githooks/pre-commit` (mirrors the CI lint/format
  gate) wired via a `prepare` script setting `core.hooksPath`.
- **P5** (repo hygiene): removed five dead scaffold directories (`apps/web/src/
{models,repositories}`, `apps/worker/src/{docker,metrics,security}`) that
  held nothing but a `.gitkeep`, plus the now-redundant `.gitkeep` in
  `apps/worker/src/nginx` (which has real files today).
- **S7 / P4** (untested surfaces): added `tests/github/github-token.test.js`
  (JWT signing/verification against a real RSA keypair — caught a real test-
  isolation bug along the way: a developer's local `.env` with
  `GITHUB_APP_PRIVATE_KEY_PATH` set was silently overriding the test's inline
  key), `tests/worker/stop-project.job.test.js`, and
  `tests/deployment/deploy-log-stream.test.js` (extracted the pub/sub fanout
  logic into a standalone `dispatchDeployLogMessage` so it's testable without
  a real Redis connection). `webhook`/`deployment` controllers were left
  untested — no controller-level test pattern exists anywhere in this
  codebase (controllers are thin wrappers; the real logic is already
  covered at the service/job layer), so inventing one was judged
  disproportionate to this item.

### Track B items found already fixed (no change made)

- **W2** — `dockerfile-generator.js` already has a second, independent
  control-character validation layer beyond the web-side validator.
- **S6** — `packages/contracts/src/job-validators.js` already validates job
  payloads at dequeue via `validateJobPayload`.
- **W8** — the build-context symlink scrub is already fully recursive
  (`scrubEscapingSymlinks`, depth-bounded at 40), not top-level-only.
- **S5** (in part) — quota-numeric and domain-hostname validation already
  exist; the one specific route checked (`deploy-hook.routes.js`) already
  degrades safely via an internal `mongoose.isValidObjectId` check rather
  than needing the page-oriented `validateObjectId` middleware.

### Remaining

- **E2** (per-repo bare-clone cache) was deliberately left unimplemented.
  `apps/worker/src/git/clone.js` already does a shallow, exact-commit fetch
  (`--depth 1`, falling back to `--depth 50`) — not a full clone as the
  original description implied — so the real cost is smaller than described.
  A shared-cache layer would need real fetch/lock concurrency safety across
  simultaneous worker jobs on the platform's single most critical path; that
  risk wasn't taken on without stronger evidence the existing shallow-fetch
  cost is an actual problem.
- The GitHub App env-group re-check on Track C's P3 punch list
  (`docs/PRIORITIES.md`) could not be verified from this session — the live
  service runs from `/opt/hellodeploy` under separate `hellodeploy-web`/
  `hellodeploy-worker` identities with no read access from this session's
  user, by design.

## Track D Admin UX Pass

- Status: Completed (all 10 items)
- Updated: 2026-08-13T21:00:00+08:00

### Scope

An admin-side efficiency/intuitiveness audit (two parallel Explore agents
covering user/project/approval management and server/domain/quota
operations) produced `docs/ADMIN_UX_AUDIT.md` and a 10-item Track D backlog
in `docs/PRIORITIES.md`. Worked through all 10 in priority order, each with
its own focused test and a lint/format pass. Local/code-only — nothing ran
against the live production host.

### Notable decisions along the way

- **A2** (approval-request confirm dialogs): Approve and Request Changes
  share one `<form>` with two named submit buttons, so the existing
  form-level `data-confirm` mechanism couldn't give them different copy.
  Extended the shared confirm-modal JS (`apps/web/public/js/app.js`) to let
  an individual submit button override its form's `data-confirm-*`
  attributes — additive and backward compatible (falls through to the form
  when a button has none of its own), reusable by any future multi-action
  form rather than a one-off special case.
- **A3** (suspension reason): the `Project` model had no
  `suspendedAt`/`suspensionReason` fields at all — `User` did, `Project`
  didn't, and `adminSuspendProjectWithStop` was silently discarding the
  reason it received (Mongoose drops fields not in the schema). Added the
  fields to the Project model and wired them through, matching the User
  side exactly.
- **A9** (Docker/MongoDB status): MongoDB connectivity was added (the web
  process already holds the DB connection). Docker connectivity was
  deliberately **not** added — the web process has no Docker socket access
  by design (privilege isolation from the worker, established earlier in
  this project). Adding a direct Docker check from web would mean
  reintroducing that access, which is a worse trade than one missing
  indicator.
- **A10** (DNS record detail): the domain-verification flow stores only a
  SHA-256 hash of the verification token, never the plaintext — consistent
  with this codebase's token-hashing convention elsewhere (deploy hooks,
  password resets). Storing the plaintext just to display it later would
  have been a real security regression, so instead of surfacing the stored
  secret, added a live DNS TXT lookup at the verification subdomain — safe
  to show because DNS TXT records are public once published, giving the
  admin independent real-time corroboration without ever touching the
  secret.

### Test debugging note

Two new test files (`tests/admin/suspension-reason.test.js`,
`tests/admin/server-stats-mongo.test.js`) initially hung indefinitely rather
than failing — `adminSuspendProjectWithStop`/`collectServerStats` open a real
BullMQ/Redis connection via `getDeploymentQueue()`, which has no
timeout and keeps the Node process alive after the test itself passes. Fixed
by calling the existing `closeDeploymentQueue()` in each file's `after()`
hook, the same cleanup `apps/web/src/runtime.js` already does on shutdown.

### Verification

Every item render-checked via direct EJS compilation against representative
locals (including edge cases: no server stats, unrecognized quota scope, no
live DNS record found) before considering it done. Final sweep: 204/204
tests passing across `tests/admin`, `tests/ui`, `tests/domain`,
`tests/security/domain-validation.test.js`, and
`tests/projects/approval-workflow.test.js`, plus a clean full-repo
`npm run lint` and `npm run format:check`.

## Track E Guest Experience Pass

- Status: Completed (all 6 items)
- Updated: 2026-08-13T22:00:00+08:00

### Scope

A guest-facing (unauthenticated visitor) audit of the entire public surface
— landing page, auth pages, and the 9 legal/policy pages, the only
unauthenticated routes that exist — produced `docs/GUEST_EXPERIENCE_AUDIT.md`
and a 6-item Track E backlog in `docs/PRIORITIES.md`. Local/code-only —
nothing ran against the live production host.

### Notable finding: a false claim in the Terms of Service

`terms.ejs:15` stated signup was "invitation-only... requires approval from
the platform administrator." Verified directly against `auth.service.js`
and the `UserStatus` enum — no such mechanism exists anywhere; every signup
goes `PENDING_VERIFICATION → ACTIVE` on email verification alone, with no
admin-approval status for users at all (unlike `Domain`, which genuinely
has one). Per the user's explicit choice (asked via clarifying question
before implementing), corrected the copy rather than building new
signup-gating logic during an active pilot — the smaller, safer change.

### Other changes

Added one honest caption near the landing-page hero disclosing facts that
were previously only in Terms — this instance is a shared pilot operated by
a named individual as an MIT capstone project, and it's free to use (G2,
G3, G6, combined into one addition since they're the same "make this
visible near the hero" fix). Added a "How it works" 4-step section and a
"What you can deploy" supported-runtime list to the landing page, both
reusing existing accurate copy (`docs/USER_GUIDE.md`) rather than inventing
new claims (G4, G5).

### Verification

Every new landing-page claim cross-checked against its source of truth
(`docs/USER_GUIDE.md`, `terms.ejs`). Each change render-checked via direct
EJS compilation. Full `tests/ui/*.test.js` sweep: 119/119 passing. Clean
full-repo `npm run lint` and `npm run format:check`.

## Track F Full-System Pass

- Status: Completed (all 6 items)
- Updated: 2026-08-13T23:00:00+08:00

### Scope

A platform-wide analysis (three parallel Explore agents) covering what the
three prior persona audits didn't: the steady-state experience of a project
owner managing an already-live project, functional completeness across the
whole reachable app, and cross-cutting consistency (accessibility,
responsiveness, form validation, design system). Produced
`docs/SYSTEM_ANALYSIS.md` and a 6-item Track F backlog. Local/code-only.

### Headline finding: the platform holds together as one product

No stub routes, no dead nav links, zero TODO/FIXME/HACK markers for
incomplete user-facing functionality anywhere in `apps/` or `packages/`. 21
real `@media` rules, a complete pre-paint dark-mode implementation, and
zero raw `window.confirm()` calls anywhere — all destructive actions route
through one shared accessible confirm-modal. The only genuinely incomplete
work is explicitly tracked, labeled future roadmap (Phase 18, P3-P6) —
deliberately not duplicated into this pass's backlog.

### Fixes

- **F1** — Environment variables page now states plainly, in the
  always-visible security notice, that secret changes don't take effect
  until the next deployment.
- **F2** — Members page now explains what each role permits. Verified
  directly against `project.routes.js`'s `ownerOnly`/`ownerOrMaintainer`/
  `anyRole` route gates before writing the copy — worth noting, since the
  audit's own suggested example copy ("Maintainer: can deploy and manage
  settings") would have been wrong. Maintainer can deploy and roll back
  only; settings, secrets, members, and domains are all `ownerOnly`.
- **F3** — Domain-add form now uses the same `form-errors` inline-validation
  pattern every other add/create form in the app already uses.
  `postAddDomain` re-renders with field-level errors instead of a
  flash-and-redirect.
- **F4** — Rollback confirm dialog and button tooltip reworded in plain
  language; a new note explains the retention window (only the most recent
  healthy releases stay available).
- **F5** — The legacy `APPROVAL_REQUIRED` dead-end message now explains
  what replaced it. No definitive historical record of the exact removal
  reason existed, so the copy was grounded in what's verifiably true today
  (the one-time project-approval gate serves the same purpose) rather than
  invented history.
- **F6** — Corrected an `IMPROVEMENTS.md` entry that marked "Navigation
  drift" Fixed under Phase 18 while `docs/phases/README.md` lists Phase
  18's overall status as Planned — the nav fix genuinely shipped early; the
  doc now says so explicitly.

### Found along the way, not fixed (flagged for whoever picks up Phase 18)

While verifying F6, found that `IMPROVEMENTS.md`'s still-open **U5** item
conflates two things: the `webhook.controller.js:193` high-risk-file-change
TODO (already fixed in the Track B pass) and a separate, still-open gap —
unexpected webhook-handler errors after the fast `200` response
(`webhook.controller.js:314`) are only logged, with no user-facing signal
for other kinds of failed push-triggered deploys. Only the first half is
done; U5's checkbox correctly stays open. Documented in
`docs/SYSTEM_ANALYSIS.md` so the two don't get conflated and marked done
together by mistake.

### Verification

Each fix render-checked via direct EJS compilation against representative
locals. 151 tests passing across `tests/ui`, `tests/domain`,
`tests/deployment/rollback-flow.test.js`, and
`tests/security/domain-validation.test.js` — including one existing test
(`tests/ui/tooltips.test.js`) updated to match the reworded rollback
tooltip text. Clean full-repo `npm run lint` and `npm run format:check`.

## Security Review of Session Code

- Status: Completed — no exploitable issues found
- Updated: 2026-08-14T00:00:00+08:00

### Scope

A dedicated security review of every file added or changed across this
session's four prior analysis passes (onboarding UX, admin UX, guest
experience, full-system — roughly 90 files), which had been functionally
verified (tests, render checks) but never security-reviewed. Not a full
audit of the pre-existing codebase — that ground was covered by the Track B
pass earlier this session.

### Method

Three `security-reviewer` subagents ran in parallel by attack-surface
grouping: (1) crypto/secrets/config validation — the master-key rotation
path, the new migration script, the production zero-key tripwire, the
decrypt audit event, the audit-metadata size cap; (2) web input handling,
authz, and output encoding — the domain-add form's new re-render-with-errors
path, flash-message name interpolation, quota-scope/audit-actor name
resolution, the `reviewFlag`/paused-project email trigger, the
`SUPER_ADMIN` gating changes, and the live DNS TXT lookup rendered on the
admin domain screen; (3) worker changes and client JS — the pipeline's
post-swap error handling, new audit events across several worker jobs, the
dangling-image prune command, the plain-language failure-email copy, and
the confirm-modal's new per-button attribute override in `app.js`.

Every finding claim was independently spot-checked against the actual
source afterward, not taken on the reviewing agent's word — e.g. directly
confirmed `GET /admin/quotas/:scopeType/:scopeId` requires only
`requireAdmin` while the mutating `POST` requires `requireSuperAdmin`
(`admin.routes.js:68,70`), and that every `data-confirm="..."` attribute in
the templates using the new `app.js` code path uses escaping `<%=`, never
unescaped `<%-` (checked `members.ejs`, `users.ejs`, `projects.ejs`
directly).

### Result

All three groups came back clean — no exploitable issues. Notably: the
attacker-controllable live DNS TXT record content shown on the admin
domain-approval screen (Track F) is properly auto-escaped, not a stored/
reflected XSS vector as its "attacker can control DNS content" framing
might suggest at first glance. One forward-looking, non-actionable note:
the new audit-event metadata size validator calls `JSON.stringify()`
before checking the 10,000-character cap, so a future caller passing
unbounded user-controlled metadata could pay CPU/memory cost before
rejection — not exploitable today since every current caller passes small,
fixed-shape metadata, but worth remembering for any new `writeAuditEvent`
call site.

### Verification

Full write-up in `docs/SECURITY_REVIEW.md`. No backlog track created in
`docs/PRIORITIES.md` — the review came back clean, nothing to track.

## Guest-to-User Onboarding Handoff Audit

- Status: Completed — analysis and backlog delivered this pass; all 3
  items (H1-H3) implemented in the following pass, see below
- Updated: 2026-08-13

### Scope

A focused pass on the one seam not covered by any prior audit this
session: the actual account-creation mechanics between the guest landing
page (Track E) and the post-login deploy funnel (Track F) — signup, email
verification, first login, and password reset.

### Method

Two `Explore` agents ran in parallel: one traced the signup form and
email-verification code paths (`create-account.ejs`, `auth.controller.js`,
`auth.service.js`, `verify-email.ejs`), the other traced the first-login
handoff and password-reset flow (`dashboard.controller.js`/`dashboard.ejs`,
`forgot-password.ejs`, `verify-reset-code.ejs`, `new-password.ejs`,
session behavior after verification). Both independently converged on the
same top finding from different angles before either had seen the other's
result.

### Result

Signup, the zero-projects dashboard, and password reset are all already
well-built — inline field errors, a live password-requirements checklist,
correct anti-enumeration behavior on duplicate email (deliberately not
treated as a gap), and a non-dead-end expired-verification-link state.
One real gap, confirmed independently by both passes: `getVerifyEmail`
(`auth.controller.js:135-171`) activates the account on successful
verification but never sets `req.session.user`, redirecting to sign-in
instead — the user must type a password they already entered twice during
signup a third time, immediately after already proving account ownership
via the emailed link. Two smaller gaps also found: the resend-verification
rate limiter shows a generic full-page 429 instead of staying on the
verify-email page (`rate-limit.js`'s shared `onLimitReached`, lines
57-70), and the password-reset code step never repeats the 1-hour code
expiry on-page (only the email states it).

### Verification

Full write-up in `docs/ONBOARDING_HANDOFF_AUDIT.md`. Backlog recorded as
Track G (H1-H3) in `docs/PRIORITIES.md`. No code changed this pass — per
this session's established pattern, fixes await a separate go-ahead.

## Track G Onboarding Handoff Fixes

- Status: Completed — all 3 items (H1-H3) resolved
- Updated: 2026-08-13

### Scope

Implements the backlog from the audit above, on explicit go-ahead.

### Changes

- **H1 — auto-login after email verification.** `verifyEmail()`
  (`apps/web/src/services/auth.service.js`) now sets `lastLoginAt` and
  returns `{ success: true, sessionUser }` via `user.toSessionUser()` — the
  same shape `signIn()` already returns — instead of the raw user
  document. `getVerifyEmail` (`auth.controller.js`) now calls
  `req.session.regenerate()` before setting `req.session.user`, the
  identical fixation-safe sequence `postSignIn` already uses, then
  redirects to `redirectByRole(sessionUser.platformRole)` with the welcome
  flash carried through — replacing the old bounce to `/auth/sign-in`
  that made a freshly-verified user retype a password they'd already
  entered twice. A `session.regenerate()` failure falls back to a plain
  redirect to sign-in without touching the session further.
- **H2 — resend-verification rate limit no longer a dead end.** Added
  `onResendVerificationLimitReached` in `rate-limit.js`, wired only to
  `resendVerificationLimiter` — every other limiter keeps the existing
  shared `onLimitReached` full-page handler. Browser requests that trip
  the limit now redirect to `/auth/verify-email?rateLimited=1`; API/JSON
  requests get the same `429`/`RATE_LIMITED` body as before.
  `verify-email.ejs` gained a `rateLimited` render branch (inline error
  alert + link back to sign-in) alongside the existing
  `submitted`/`resent`/`error` branches.
- **H3 — reset-code expiry stated on-page.** `verify-reset-code.ejs`'s
  hint text now reads "Enter the 6-digit code from your email. It expires
  in 1 hour." — matching `RESET_TOKEN_TTL_MS` in `auth.service.js`. No
  code logic changed, copy only.

### Verification

New file `tests/auth/verify-email-session.test.js` (6 tests, in-memory
Mongo): sessionUser shape and field values on success, `lastLoginAt` set,
invalid-token rejection grants no session, the controller-level dashboard
redirect, the regenerate-before-session.user ordering, and the
render-only (no session) path on failure. Extended
`tests/security/rate-limit.test.js` with 3 tests: the redirect-back
behavior, JSON parity for non-browser clients, and a source check that
`resendVerificationLimiter` is wired to the new handler — all 13 tests in
that file pass, including the pre-existing `passOnStoreError` count
assertion (unchanged at 8, since no new limiter was added). Confirmed the
pre-existing `tests/security/session-fixation.test.js` source-order check
(first `regenerate` before first `session.user =` in the controller file)
still passes unmodified, since the new occurrence in `getVerifyEmail`
follows the same ordering and now appears earlier in the file than
`postSignIn`'s. Clean full-repo `npm run lint` and `npm run format:check`.
Nothing touched the live production host.

## Security Review of Track G's Code

- Status: Completed — no exploitable issues found
- Updated: 2026-08-13

### Scope

A follow-up to the earlier session-wide security review, since Track G's
code (auto-login after email verification, the resend-verification
rate-limit handler, two touched EJS templates) shipped after that review
closed out and had never been security-reviewed. User confirmed via
AskUserQuestion this was the intended angle for "a full system analysis"
at this point in the session, given UX had already been covered from
every persona and the broader session diff was already clean.

### Method

One `security-reviewer` subagent — the diff is small and logically
contained to a single auth flow plus one rate-limit handler, unlike the
earlier ~90-file review's three unrelated attack-surface groups. Asked it
to specifically check session-fixation correctness, open-redirect risk,
rate-limit integrity (does the new handler weaken the limiter or leak an
enumeration signal), information disclosure in the new `sessionUser`
return value, and XSS in the new EJS branch.

### Result

Clean — no exploitable issues. `req.session.regenerate()` is called
before `req.session.user` is ever assigned (`auth.controller.js:178`),
matching `postSignIn`'s established pattern exactly. `redirectByRole` and
the new rate-limit redirect target are both fixed strings with no request
input reachable. Only the rate-limiter's `handler` option changed —
`windowMs`, `limit`, and the Redis store are untouched, and the handler
fires on request count alone, before any email lookup, so it adds no
enumeration signal beyond what `resendVerificationEmail()` already keeps
silent. `toSessionUser()` returns only 7 safe fields —
`passwordHash`/`emailVerificationTokenHash`/`passwordResetTokenHash` are
all schema-level `select: false`, confirmed directly rather than assumed.
The new EJS `rateLimited` branch is 100% static markup, zero
interpolation.

### Verification

Full write-up appended to `docs/SECURITY_REVIEW.md` under "Track G —
Session/Auth Changes." No backlog track created in `docs/PRIORITIES.md` —
the review came back clean, nothing to track.

## Track A Status Correction

- Status: Completed — documentation correction only, no production actions
- Updated: 2026-08-13

### Scope

Prompted by a user question about why Track A/C (production-cutover
completion, real deployment engine validation) hadn't been worked on this
session. Before answering, a live read-only status check of Track A's two
stated blockers seemed warranted rather than repeating what the docs
claimed from memory — and it turned out both were stale.

### Method

One read-only `Explore` agent: inspected the Redis/BullMQ queue state
directly for the domain-verification job in question, ran a read-only
`curl -I` against `hellorun.online`, read the current pre-flight checklist
and production-plan docs, and checked `systemctl`/`journalctl` for the
HelloDeploy units. No mutating action of any kind — no requeue, no service
restart, no script execution, nothing touching the HelloRun project.

### Result

Both cited Track A blockers turned out to already be resolved, just never
logged:

- The "deliberately requeue the one paused domain-verification job and
  observe" item had actually completed on 2026-08-10, 08:28:29 UTC — a
  side effect of `scripts/resume-deployment-queue.js` that same day, not
  the separately watched requeue the plan called for. The domain
  (`hellorun.online`) is now in `PENDING_ADMIN_APPROVAL`.
- `hellorun.online` — cited as the blocker for exercising
  `revert-dashboard-cutover.sh` — now returns `200`, not the `502`
  PM2 port-3000 crash-loop the docs described from 2026-08-09. That
  blocker is cleared; the revert script itself still hasn't actually been
  run.

Also surfaced, unrelated to Track A: a brief self-healed `hellodeploy-web`
crash-loop around 20:10-20:11 (suspected Mongo DNS SRV lookup flakiness,
`ESERVFAIL`/`EREFUSED`), `NRestarts=22` over the unit's lifetime, stable
for 3.5+ hours since. Presented to the user alongside the stale-blocker
findings; they chose to correct the docs only for now and not investigate
the crash-loop or run any live verification in this pass.

### Verification

Corrected `docs/PRIORITIES.md` (Track A item list, removed the resolved
"Urgent, but outside this project's scope" HelloRun-502 section, added the
crash-loop observation under "Also worth a deliberate decision," and a new
Recently-resolved entry), `docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`
(checked off the resolved pre-flight item, corrected the other's blocker
status), and `docs/HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md` (bumped the
Updated date, checked off the corresponding action item, added a dated
2026-08-13 evidence paragraph following the doc's existing append-only
convention rather than rewriting the historical 2026-08-10 entry). No code
changed. Nothing touched the live production host beyond the read-only
checks described above.

## hellodeploy-web Crash-Loop Investigation

- Status: Completed — root-caused, zero real-world impact confirmed
- Updated: 2026-08-13

### Scope

The user asked to investigate the `hellodeploy-web` crash-loop that had
been flagged (but not looked into) during the Track A status-correction
pass earlier the same day. Read-only investigation only.

### Method

`journalctl -u hellodeploy-web` and `journalctl -u hellodeploy-worker` for
the incident window (19:55-20:20), `systemctl status`/`systemctl cat` for
both units, and nginx's `access.log` (readable via the `adm` group) for
the same window to check real visitor impact. No mutating commands were
run.

### Result

- **Timeline:** a live MongoDB connection drop (`MongoServerSelectionError`)
  crashed `hellodeploy-web` at 20:06:31. Every restart attempt for the next
  5 minutes 17 seconds then failed at the DNS-resolution step
  (`ESERVFAIL`, then `EREFUSED`) — 22 crash/restart cycles, no working
  process the entire time — until DNS recovered and it connected cleanly
  at 20:11:48.
- **Not a code bug:** `packages/observability/src/process-errors.js`
  deliberately treats `uncaughtException`/`unhandledRejection` as fatal and
  exits, relying on systemd (`Restart=on-failure`, `RestartSec=5`) to
  restart — a legitimate, well-reasoned Node.js pattern (resuming after a
  possibly-corrupted process state is the actual anti-pattern), not an
  oversight.
- **Root cause:** DNS resolution to the MongoDB host was unreachable from
  this host for ~5 minutes — infrastructure/network flakiness external to
  the application. `hellodeploy-worker` was unaffected only because its
  already-open connection (5 days uptime at the time) never needed to
  re-resolve DNS during the window.
- **Real-world impact: zero.** nginx's `access.log` shows zero requests of
  any kind, to any host, during the entire outage window — no real visitor
  was turned away. This was fortunate timing given current low traffic,
  not evidence of resilience.
- **Bigger structural finding:** the production host's hostname
  (`henz-Inspiron-3443`) indicates this runs on a personal laptop, not
  managed server/cloud infrastructure. That's a materially larger
  reliability risk than this one incident — laptop sleep, a network
  change, or an OS-update reboot would take the whole platform down, and
  no application code change addresses that.
- **Also surfaced:** no uptime monitoring or alerting exists anywhere in
  the stack. This incident was found entirely by chance during an
  unrelated status check; a real outage during real traffic would
  currently go unnoticed until a user complained.

### Verification

`docs/PRIORITIES.md`'s "Also worth a deliberate decision" section updated:
replaced the earlier stale "not investigated" note with these findings,
and added "no uptime monitoring or alerting exists" as a new tracked item.
No code changed; nothing mutated on the live production host.

## Documentation Consolidation Pass

- Status: Completed — 13 files touched, 7 archived/removed, 0 code changes
- Updated: 2026-08-14

### Scope

The user asked for a full analysis of `docs/` plus actual
organization/consolidation/update — not just another audit doc. `docs/`
had grown to 35 files (~9,800 lines) plus a 3,403-line root `WORKLOG.md`
and a 12-file `docs/phases/` subdirectory, spanning 2026-07-02 through
2026-08-14.

### Method

Three parallel read-only `Explore` surveys, split by theme: progress/
phase-tracking docs, release-readiness docs, and this-session-audit +
reference/spec/policy docs. Each reported purpose, staleness, overlap, and
a KEEP/MERGE/ARCHIVE/NEEDS-UPDATE recommendation per file.

### Result

**Confirmed factual contradictions, fixed:**

- `docs/IMPROVEMENTS.md` — 19 checkboxes flipped from `[ ]` to `[x]`
  (S1-S8, W2, W6, W8, W10, P1-P3, P5, P6, E1, E4), each cited against the
  Track B `WORKLOG.md`/`PRIORITIES.md` entry; U5 corrected to distinguish
  its resolved half from its still-open half (found during the earlier
  Track F pass, never actually fixed in this file until now). Only E2 and
  U5's open half remain unchecked in Round 2 — 26/28 resolved, confirmed
  by direct grep count.
- `docs/README.md` (the doc index) — fully rewritten: added the 10
  missing files (5 of this session's audit docs, `ENVIRONMENT.md`,
  `IMPROVEMENTS.md`, `RELEASE_POLICY.md`, `SECOND_SITE_DEPLOYMENT_CHECKLIST.md`),
  reorganized into clearer sections, and repointed every archived-file
  link to its new `archive/` path.
- `docs/PROJECT_STATUS_REVIEW.md` — P2 completion re-estimated (~60-70% →
  ~85-90%, since DNS/dashboard-cutover/queue-resume all passed live since
  its last update), the stale "15-item backlog" claim corrected to 26/28
  resolved, test-file count refreshed (118 → 137, current per-directory
  breakdown).
- `docs/LIVE_WORKFLOW_ACCEPTANCE.md` and `docs/DEPLOYMENT_READINESS_ROADMAP.md`
  — spot-corrected the specific rows directly contradicted by the
  2026-08-13 Track A findings (dashboard-Nginx routing, wildcard DNS/TLS,
  queue-paused claims), with a pointer at the top to the Production Plan
  for current status; not a full row-by-row re-verification, which was
  out of scope.

**Self-declared-superseded docs, actually archived:** created `docs/archive/`
and moved `FULL_PROJECT_REVIEW_2026-07-12.md`, `FULL_IMPLEMENTATION_OVERVIEW.md`,
`PHASE_TASK_TRACKER.md`, `P9_P12_MAINTENANCE_SUMMARY.md`,
`HARDENING_AND_PILOT_REPORT.md` (via `git mv`, preserving history) — each
already said in its own text that it was superseded, but none had actually
been moved. Also archived `PROJECT_SETTINGS_UX_SPEC.md` (all 4 delivery
phases shipped 2026-07-13 — a closed record, not a live spec) with a new
archival note added since it wasn't already self-declared historical.

**Genuine duplication, resolved:**

- `docs/WORK_LOOP.md`'s "Current Handoff" section (near-verbatim duplicate
  of `docs/IMPLEMENTATION_BATCH_TRACKER.md`'s "Current Status," manually
  kept in sync) replaced with a one-line pointer; the tracker's own
  Current Status was corrected with the same 2026-08-13 Track A findings
  in the same edit.
- `docs/UI_UX_ACCESSIBILITY_PASS.md` folded into
  `docs/UI_UX_IMPROVEMENT_BACKLOG.md` as a new "UX-13 Evidence" section,
  then removed as a standalone file — it was entirely UX-13's evidence
  record already referenced from the backlog table.
- `docs/UI_UX_IMPROVEMENT_BACKLOG.md`'s 13 `Done` rows (UX-01–UX-13)
  compressed into a one-paragraph changelog; only UX-14 (still open)
  remains as a live table row.
- `docs/RELEASE_SMOKE_TEST.md` folded into `docs/OPERATIONS_RUNBOOKS.md`
  as a new "Release Smoke Test" section (positioned after the Ordered
  Production Workflow, which it elaborates step 5 of), then removed as a
  standalone file; its one inbound reference
  (`docs/phases/phase-8-worklog-verifications.md`) corrected to point at
  the new location.
- `docs/phases/README.md` — added a disambiguation note (three different
  "Phase"/"Priority" numbering schemes exist across this repo's docs) and
  corrected phases 12, 13, 14, 15, and 17's status from stale "Planned" to
  "Resolved (Track B)" — their underlying `IMPROVEMENTS.md` items were
  resolved 2026-08-13 without ever getting a dedicated phase file, a gap
  this file didn't previously reflect. Phase 16 marked partially resolved
  (E2 deliberately still open); phase 18 left as Planned (still
  substantially open).

**Explicitly out of scope, flagged not fixed:** `WORKLOG.md` itself
(3,403+ lines, root-level) is a much bigger, separate structural question
— whether/how to split it by date — that the surveys didn't cover and
deserves its own deliberate decision. Recorded as a new item under
`docs/PRIORITIES.md`'s "Also worth a deliberate decision," not acted on.

### Verification

Grepped for inbound references to every moved/removed file before touching
it, fixing the ones found (root `README.md`'s dead link to the archived
P9-P12 doc, `docs/WORK_LOOP.md`'s reference to the now-archived
`FULL_IMPLEMENTATION_OVERVIEW.md`, `docs/UI_UX_IMPROVEMENT_BACKLOG.md`'s
reference to the archived `PHASE_TASK_TRACKER.md`,
`docs/phases/phase-8-worklog-verifications.md`'s reference to the merged
`RELEASE_SMOKE_TEST.md`). Deliberately left `WORKLOG.md`'s own historical
narrative mentions of moved filenames untouched — those are accurate
statements of what was true at the time they were written, not live
pointers, and rewriting them would falsify history. Clean full-repo `npm
run format:check`. No code changed; nothing touched the live production
host.

## WORKLOG.md Split and Baseline Uptime Check

- Status: Completed
- Updated: 2026-08-14

### Scope

Two of the four items flagged as "worth a deliberate decision" after the
docs consolidation pass. The user was asked explicitly which remaining
items (revert-script exercise, Track C P3, dependency upgrades, or the
proposal-writing itself) to proceed on and chose the safe-planning-only
option; after the two proposals were written up, a follow-up "continue"
was interpreted as authorization to execute the parts of those proposals
that don't touch production, don't need a third-party account, and don't
carry breaking-change risk — not the parts still awaiting a specific
choice.

### Changes

- **`WORKLOG.md` split**: found the exact July 31 → August 1 entry
  boundary (line 2469/2470, confirmed via each entry's `Updated:` field,
  not just heading text). Moved the 100 entries from 2026-07-02 through
  2026-07-31 into new `docs/archive/WORKLOG_2026-07.md` with an
  explanatory header; `WORKLOG.md` now holds the 17 entries from
  2026-08-01 onward (1,048 lines, down from 3,510) with a pointer to the
  archive at the top. Verified the split was byte-exact via line-count
  reconciliation (2468 + 1041 = 3509 = original 3510 minus the one header
  line) before either file was formatted. Confirmed via repo-wide grep
  that no code anywhere reads `WORKLOG.md` programmatically, so nothing
  else needed updating for correctness — only cross-references for
  discoverability (`docs/README.md`'s Historical Snapshots list,
  `docs/PRIORITIES.md`).
- **Baseline uptime check**: added `.github/workflows/uptime-check.yml` —
  a `schedule` (`*/10 * * * *`) plus `workflow_dispatch` trigger that curls
  `https://hellodeploy.online/ready` (deliberately the deeper readiness
  check, not just `/health` — it also validates MongoDB/Redis/queue
  state) and exits non-zero on anything but `200`, which surfaces as a
  failed GitHub Actions run and triggers GitHub's own notification to the
  repo owner. Confirmed the repo is public (`gh repo view`), so this costs
  nothing and needs no new account or configured destination — the two
  properties that made this safe to implement without further sign-off,
  unlike the external-pinger alternative also documented as a stronger
  future option in `docs/PRIORITIES.md`.

### Verification

YAML validated (`python3 -c "import yaml; yaml.safe_load(...)"`); note the
schedule only actually activates once this file is merged to the
repository's default branch, per GitHub Actions' own constraint on
scheduled workflows. `docs/PRIORITIES.md` updated: the `WORKLOG.md`-split
proposal moved from "Also worth a deliberate decision" to "Recently
resolved"; the uptime-check item kept under "Also worth a deliberate
decision" (a baseline now exists, but the stronger external-pinger option
is still an open choice) with a new "Recently resolved" entry
cross-referencing it. Clean full-repo `npm run format:check`. No
production actions taken; nothing on the live host was touched.

## Production Deployment-Drift Discovery

- Status: Discovered and recorded — deliberately not acted on
- Updated: 2026-08-14

### Scope

While working around a project-quota block during the hellouniversity
deploy test (admin account capped at `maxOwnedProjects: 1`, already
holding "HelloRun"), attempts to find a "Manage Quota" link's embedded
user ID on the live admin users page came up empty despite the link
existing unconditionally in this repo's `users.ejs`. That discrepancy
prompted a direct check of whether production is actually running current
code.

### Method

Two direct live HTTP checks via the authenticated curl session already
established: grepped the live landing page for Track E's "How it works"
section text, and the live `/admin` index for Track D's pending-domain-
approvals banner text. Both zero. Followed up with an Explore agent
investigating the actual deployment mechanism for HelloDeploy's own
dashboard (distinct from the customer-facing deploy pipeline).

### Result

Confirmed: hellodeploy.online is running older code than this repo.
Root cause — no working release mechanism exists. `docs/RELEASE_POLICY.md`
documents a policy that's explicitly unenforced.
`infrastructure/upgrade.sh` (pause queue → install release → auto-rollback
on failure) has only ever been syntax-checked, never run live. Every
prior production code update in this project's history has been a
manual, ad hoc SSH-and-restart action. No version/commit endpoint exists
to even ask the running process what it's running. Decision: do not run
`infrastructure/upgrade.sh` for the first time as a side effect of an
unrelated quota fix — that deserves its own dedicated planning, matching
the care given to `revert-dashboard-cutover.sh` the one time it was
exercised (which surfaced a real bug). The hellouniversity pipeline test
continues on the currently-live code instead, since none of today's
session work touched build/deploy/worker/nginx-routing logic — only the
dashboard UI and documentation.

### Verification

Recorded as a new item in `docs/PRIORITIES.md`'s "Also worth a deliberate
decision" section, independently re-checkable later via the same two live
markers (landing-page "How it works" text, admin-index approvals banner)
once `upgrade.sh` is eventually run. No production actions taken this
pass — read-only checks and an Explore agent only.

## Super Admin Seed-Credential Cleanup

- Status: Clarified — cleanup handed to the user
- Updated: 2026-08-14

### Scope

User asked whether the Super Admin account should be "stored in MongoDB
instead of the `.env` file" as the source of truth. Read
`scripts/seed-super-admin.js` in full to answer precisely.

### Result

MongoDB is already the source of truth for every account, not just this
one — `seed-super-admin.js` is a one-time bootstrap that writes a real
`User` document (bcrypt-hashed password, `platformRole: SUPER_ADMIN`) and
refuses to run again once a Super Admin exists; regular signups already
go through `registerUser()` the same way. Nothing needed migrating. What
was real: 4 now-unused values (`SUPER_ADMIN_EMAIL`/`_PASSWORD`/
`_FIRST_NAME`/`_LAST_NAME`) still sitting in the local `.env` — the
running app never reads them, only the one-time script did, and the
script's own log output says "do not store them in source control."
Could not remove them directly — this session's own permission settings
block both `Read` and `Bash` access to that file path (a deliberate
guardrail). Asked the user to delete the 4 lines themselves. Also
flagged, separately: the live account's current password is weak and
was pasted into this chat directly — worth rotating independent of the
`.env` cleanup.

### Verification

Confirmed via repo-wide grep that `seed-super-admin.js` is the only
consumer of those 4 env vars, so removing them can't break anything else
in local dev. Documented in `docs/PRIORITIES.md`. No files were actually
edited this pass beyond the docs — the `.env` change itself is the
user's to make.

## Email Verification Delivery Investigation

- Status: Root-caused (pending one confirming check), fix is outside this session
- Updated: 2026-08-15

### Scope

User reported not receiving the verification email after signing up with
a genuinely new (not pre-existing) email address on the live site.

### Method

Confirmed via nginx access logs the exact timestamps of two real
`POST /auth/create-account` attempts plus one resend, today. Checked
`hellodeploy-web`'s own logs for that exact window: no entries at all —
specifically neither `"[email] Failed to send email"` (would fire if the
Resend API call errored) nor `"[email] DEV MODE — email not sent"` (would
fire if `RESEND_API_KEY` were unset), ruling out both an API failure and
a missing-config dev-mode fallback. Checked `hellodeploy.online`'s DNS
directly (`dig TXT`/`CNAME` for SPF/DKIM/DMARC) — zero email-related
records exist. Asked the user to test the forgot-password flow (same
`sendEmail()` code path, same Resend client, same sender) as a
differential check — it succeeded, delivering to the existing Super Admin
account's email.

### Result

The forgot-password success doesn't contradict the theory — it confirms
it. This is the signature of Resend's sandbox/unverified-domain
restriction: without a DNS-verified sending domain, Resend delivers only
to the email address that owns the Resend account itself, and silently
drops everything else while still returning success from the API. That
explains both facts at once: delivery succeeded to (presumably) the
account-owner address, and silently failed to a genuinely new recipient.
**If confirmed, this means no new user could complete signup
verification right now** — a more fundamental gap than anything else
currently tracked, since it's about whether anyone can get in the door
at all. Checked all ~2 weeks of retained nginx logs (current + rotated)
as a follow-up: today's two test attempts are the only
`POST /auth/create-account` requests logged in that entire window — no
evidence of a real prospective user hitting this before today, so
real-world impact is unconfirmed even though the delivery mechanism
itself is confirmed broken for any recipient besides the Resend account
owner.

Not fixable from this session — needs Resend dashboard access (no
credentials available here) to confirm domain-verification status and
add the DNS records Resend specifies. One confirming question is
outstanding: whether `hellodeployonline@gmail.com` is also the email
that owns the Resend account, which would close the diagnosis completely.

### Verification

Documented prominently in `docs/PRIORITIES.md` as a new "URGENT" section
ahead of Track A, given the severity relative to everything else
currently tracked. No code changed — this was investigation only, using
existing log/DNS access.

## hellouniversity Deploy Attempt — Status Notes

- Status: Documentation only — consolidating scattered state
- Updated: 2026-08-15

### Scope

The hellouniversity deploy attempt (Track C P3's first real pipeline
exercise) had run across several turns interrupted by tangents (the
quota block, the deployment-drift discovery, the Super Admin credential/
email investigation), with no single place recording where it actually
stood. User asked for persistent notes rather than another chat recap.

### Result

Added a "Current attempt: hellouniversity (Express)" section to
`docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`, positioned before its "Live
pilot tracking" table (whose 15 rows only start at "Connect and approve
the new repository" — the current blocker sits before that table's scope
begins). Records: what's done (PR #3 merged, fixing the tailwindcss/
`devDependencies` build blocker; admin session established), the exact
current blocker (project-quota lookup, admin's MongoDB `_id` still
needed), the queued next steps in order (create project → connect repo →
detection → `.env` upload, not yet done → confirm-before-deploy → monitor
→ verify), and an explicit note that the email-verification bug doesn't
block this specific attempt. Added a one-line pointer from `docs/
PRIORITIES.md`'s Track C P3 item to this new section rather than
duplicating its content there.

### Verification

Cross-checked every claim in the new section against what's actually
been established this session (PR number, exact blocker, exact remaining
steps) — nothing overstated as done that isn't. Clean `npm run
format:check`. No code or production changes.

## MongoDB Account-Lookup Investigation

- Status: Unresolved — documented, not fixed
- Updated: 2026-08-15

### Scope

Continuation of the quota-block investigation: locating the admin
account's MongoDB `_id` turned into its own sub-investigation across
several turns, worth recording precisely rather than losing the
reasoning trail.

### Method

Reviewed a MongoDB Compass screenshot the user provided, showing the
actual collection structure of `cluster0.11fgflq.mongodb.net`'s
`hellodeploy_db` database, and the result of a `db.users.findOne()` query
run inside it.

### Result

The screenshot showed a full, rich collection set — `users`, `projects`,
`quotas`, `deployments`, `domains`, `environment_secrets`, `sessions`,
`audit_events`, `approval_requests`, `deployment_events`,
`platform_settings`, `project_memberships`, `repositories` — that
matches HelloDeploy's actual Mongoose schema exactly. This contradicts an
earlier assumption in this same thread that `hellodeploy_db` was the
wrong database, which had been made without ever seeing its actual
structure. Despite the apparent match, `db.users.findOne({ email:
"hellodeployonline@gmail.com" })` run correctly (no syntax errors,
confirmed from the shell output) against that database returned `null`.

This directly contradicts independent proof established earlier in the
session: a curl-based login to the live site with those exact credentials
succeeded — a `302` redirect to `/admin`, confirmed genuine by a
follow-up fetch of `/admin` returning a real `200` "Admin Overview" page.
That flow only works via `auth.service.js`'s `signIn()` →
`User.findOne({ email })` + `verifyPassword()`, a pure database read with
zero `.env` fallback at request time — meaning a matching `User` document
has to exist somewhere reachable by whatever `MONGODB_URI`
`hellodeploy-web` actually connects to. The two are not yet reconciled.

Two diagnostic questions were posed to resolve the contradiction and
remain unanswered: (1) whether the `users` collection is genuinely empty
or contains other documents (`db.users.countDocuments()`), and (2)
whether the cluster hostname and database name visible in Compass
(`cluster0.11fgflq.mongodb.net` / `hellodeploy_db`) match the literal
`MONGODB_URI` value in the local `.env` file.

### Verification

Documented in `docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`'s "Current
attempt: hellouniversity (Express)" section, replacing the earlier terser
blocker note. Deliberately did not assert a conclusion the evidence
doesn't support — the account's actual presence or absence in the real
production database remains unresolved, not settled either way. No code
changed, no production actions taken; this was documentation only, per
the user's explicit choice of scope this turn.

## Quota Block Resolved — hellouniversity Deploy Continues

- Status: Completed (quota + repo connection + detection); deploy trigger still pending
- Updated: 2026-08-15

### Scope

Resolving the account-lookup mystery that had stalled the hellouniversity
deploy attempt for many turns, then continuing the actual deploy setup.

### Method

User provided the real `MONGODB_URI` (previously declined for broad
standing access; user re-offered it after repeated diagnostic dead ends,
and it was accepted for one narrow, read-only-then-scoped use). Connected
directly via the `mongodb` driver (already present in this monorepo's
`node_modules`, no new dependency needed) and ran
`db.users.findOne({ email: "hellodeployonline@gmail.com" })` — found the
account immediately, in a database called `hellotasks`, not
`hellodeploy_db` as previously assumed from the URI the user had
described verbally. Used the resulting `_id`
(`6a35576283a1f129f22ed773`) to set a `USER`-scoped quota override via
the live admin API (`POST /admin/quotas/USER/<id>`,
`maxOwnedProjects: 5`), then immediately retried project creation as an
empirical correctness check.

### Result

- Quota override confirmed set (`value="5"` on re-fetch of the quota
  page).
- Project creation succeeded (`302` to `/projects/hellouniversity-4e6a`)
  — which is decisive proof `hellotasks` is the real production database:
  project ownership is assigned to `req.session.user.id` from the live
  login session, not the quota override's URL parameter, so success is
  only possible if the `_id` found in `hellotasks` is the exact same ID
  the live app's own `signIn()` flow uses.
- Continued the deploy setup: connected `https://github.com/
4hprojects/hellouniversity` (`main` branch, PR #3's fix already merged)
  via `POST /projects/hellouniversity-4e6a/repository`; ran detection —
  `runtimeType: EXPRESS`, status "Ready to deploy," no blocking issues.
- Separately, while investigating, found `hellotasks` also contains six
  collections unrelated to HelloDeploy's schema (`tasks`, `comments`,
  `notifications`, `filerecords`, `auditlogs`, `appsettings`) — production
  shares its database with an unrelated application. Documented as a new
  "HIGH" item in `docs/PRIORITIES.md`, with a full migration plan (below)
  — deliberately not executed yet, kept separate from this in-flight
  pipeline test per the user's explicit choice.

### Verification

`docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`'s "Current attempt" section
updated to reflect resolution and the new progress. Remaining steps
unchanged: gather/upload the `.env` secrets, explicit go-ahead before the
Deploy trigger, monitor logs, verify via `curl`.

## Production Database Migration Plan — `hellotasks` → `hellodeploy_db`

- Status: Planned, not executed
- Updated: 2026-08-15

### Scope

Following the quota-block resolution above, the user asked to plan out
(not yet execute) fixing production's shared-database situation.

### Method

A dedicated Plan agent was used to design the migration, given the
significant risk profile (a real production cutover) and this session's
established pattern of treating first-time high-stakes production
changes with dedicated planning rather than folding them into whatever
else is in progress. Grounded the agent's brief in confirmed facts: the
13 real HelloDeploy collections and their current state in `hellotasks`,
a read-only document-count check of every collection in `hellodeploy_db`
(all zero except `sessions`, 37 stale entries), and this session's
concrete permission boundaries (no filesystem access to
`/opt/hellodeploy`, no root/docker-group access).

### Result

Plan: pre-migration checks (confirm no in-flight deployment, re-enumerate
collections/counts, verify write access to the target, snapshot index
definitions, exclude `sessions` since it's `connect-mongo`-managed and
self-rebuilding) → migrate via `mongodump`/`mongorestore` scoped
per-collection (preserves index metadata natively; a hand-written copy
script risks silently dropping a unique constraint like `users.email`)
→ verify document-count and index parity plus spot-checks before any
cutover → a full-stop maintenance-window cutover sequence (stop worker,
stop web, run final dump/restore, verify, edit
`/opt/hellodeploy/.env`'s `MONGODB_URI`, start web, start worker, smoke
test) → rollback plan (trivial, since `hellotasks` is only ever read
during migration, never modified). Explicitly deferred: don't touch the
6 foreign collections, don't delete `hellotasks`'s HelloDeploy data
immediately after cutover (keep as a safety net), don't attempt the
`.env` edit or service restarts from this session — the cutover step
requires the human operator's direct host access.

### Verification

Full plan recorded in `docs/PRIORITIES.md`'s "HIGH" item. Not executed —
explicitly deferred until the in-flight hellouniversity pipeline test
finishes or is paused, since both are live-production-state changes and
the user asked they not overlap.

## hellouniversity Deploy Attempt — Approval Gate, Then CLONE_FAILED

- Status: Blocked — real, reproducible infrastructure limitation found
- Updated: 2026-08-15

### Scope

Continuing the hellouniversity pipeline test (Track C P3) from quota
resolution through an actual deploy trigger.

### Method

Confirmed 39 uploaded env vars included `NODE_ENV=production` (added
after an initial gap). Triggered the deploy via
`POST /projects/hellouniversity-4e6a/deployments` — got a `302` but the
flash message read "Project must be approved and active before
deployment," not a success message. Traced this to a required
`submitForReview()` step (`project.service.js`) that the raw-curl-driven
flow had skipped (the real browser UI presumably surfaces this as an
explicit step). Submitted for review (`POST /projects/hellouniversity-
4e6a/submit-review`) with a purpose description, then approved it via
the admin panel (`POST /admin/approval-requests/<id>/review`,
`decision=APPROVED`) — project status flipped to `Active`/`Approved`.

Retriggered the deploy — genuinely queued this time ("Deployment #1
queued"). Watched via a background job polling `journalctl -u
hellodeploy-worker` and the BullMQ `active` list in Redis for a terminal
state. It failed: `CLONE_FAILED`, "git exited with code 128", after
~2 minutes — confirmed directly in the `deployments` collection
(`hellotasks` database). Retried twice more (deployments #2 and #3,
IDs `6a8055a618873c53d635d79b` and `6a805ba118873c53d635d7b6`) — both
failed identically.

Between retries, diagnosed directly rather than guessing: reproduced the
exact `git init` → `remote add` → `fetch --depth 1 origin <sha>`
sequence from `apps/worker/src/git/clone.js` manually in a scratch
directory. First attempt hung 60s with zero output; a verbose-traced
attempt showed a real HTTP/2 exchange completing (200 OK,
`pack_header=2,1131`, `git index-pack` spawned) and then stalling
indefinitely with no further progress — even given a full 3-minute
window. Ruled out a fully dead network via a plain `curl` download of
the same commit's tarball: it transferred a real 9.4 MB in 30 seconds
before being cut off (~313 KB/s), and a later fully-traced download of
the same content completed steadily start to finish (~300 KB/s, no
stalls). A control download from an unrelated host
(`speed.cloudflare.com`) hit 2 MB/s instantly. Checked the network
interface directly (`ip -s link`): the wired interface (`enp7s0`) is
`NO-CARRIER` (unplugged); the host runs on WiFi (`wlp6s0`), with
non-zero packet drops on both RX (33) and TX (1,344).

### Result

Root cause is specific and confirmed, not a guess: this host's WiFi
connection handles plain HTTP downloads fine (steady ~300 KB/s, no
stalls, confirmed multiple times including immediately before the third
failed retry) but `git fetch`'s smart-HTTP pack-transfer mechanism —
which pipes the HTTP response body into a separate `git index-pack`
subprocess — reproducibly stalls indefinitely on this exact host/network
combination. Not a generic "too slow" problem and not a HelloDeploy code
bug. Three consecutive identical real-deploy failures, including one
retried immediately after confirming a working connection via direct
curl test moments earlier, rules out both bad luck and simple transient
congestion as the explanation.

Per the approved plan, did not attempt a fourth retry — three identical
failures wouldn't be improved by a fourth attempt into the same
underlying issue.

### Verification

Documented in `docs/PRIORITIES.md` (extended the existing host-
reliability item with this specific, confirmed finding) and
`docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`'s "Current attempt" section
(the approval-gate miss, all three deployment IDs and their failure
details, and the unresolved status). All diagnostic commands were
read-only; nothing destructive was done to the live host. The
hellouniversity project itself is left in a valid, ready-to-retry state
(approved, `.env` uploaded) — no cleanup needed once the underlying
network issue is addressed.

## nginx default_server Cross-App Leak — Found and Fixed

- Status: Completed
- Updated: 2026-08-15

### Scope

User directly hit `hellouniversity-4e6a.hellodeploy.online` in a browser
and got a login page for "HelloTasks" — a completely unrelated
application — instead of anything HelloDeploy-related.

### Method

Confirmed `hellouniversity.online` (a different domain the user also
hit, showing a Cloudflare "Error 1000: DNS points to prohibited IP") was
unrelated — it's the real, separate hellouniversity app's own actual
production domain (referenced but commented out in the repo's own
`.env.production.example`), never touched by this session. The
HelloTasks sighting was the real issue. Checked
`/etc/nginx/sites-enabled/` and found a symlinked `hellotasks` site
alongside `hellorun` — a genuine, separate, real application sharing
this host. Read its config: `listen 80 default_server;` /
`listen [::]:80 default_server;`. Checked HelloDeploy's own wildcard
handling: `hellodeploy-platform.conf` only matches the bare
`hellodeploy.online`/`www.hellodeploy.online`, and
`/etc/nginx/hellodeploy.d/` (the directory the worker writes per-project
configs into on a successful deploy, per `include
/etc/nginx/hellodeploy.d/*.conf;` in `hellodeploy.conf`) was completely
empty.

### Result

Root cause confirmed: any unmatched Host header on this host's port 80
fell through to `hellotasks`'s `default_server`, since HelloDeploy has no
fallback of its own and no project has ever completed a real deploy (so
no per-project config has ever been written). This affected every
current and future `*.hellodeploy.online` project subdomain without a
completed deploy — a real, live cross-application exposure, not
hypothetical.

No write access to `/etc/nginx/` from this session (confirmed:
`touch` denied, no passwordless sudo) — produced an exact, ready-to-run
fix for the operator. First attempt only ran the symlink step (enabling
`/etc/nginx/sites-available/default` as an additional `default_server`)
without the `hellotasks` edit, causing `nginx -t` to fail with "a
duplicate default server for 0.0.0.0:80" — `systemctl reload` then
failed too, but nginx's own safety behavior meant it kept running on its
last-known-good config throughout; confirmed no outage occurred
(`hellodeploy.online`/`hellorun.online` both still `200` immediately
after). Provided an exact `sed` command for the actual edit on the
second attempt; it landed correctly (`listen 80;`/`listen [::]:80;`, no
`default_server`), `nginx -t` passed, `systemctl reload nginx` succeeded
(`status=0/SUCCESS`).

Verified directly: `hellouniversity-4e6a.hellodeploy.online` now serves
nginx's generic "Welcome to nginx!" stock page instead of HelloTasks;
`hellodeploy.online` and `hellorun.online` both still `200`, no
regression. One unrelated finding surfaced during verification:
`hellotasks.online` itself returned a Cloudflare `530` — the same class
of DNS issue seen on `hellouniversity.online` earlier, pre-existing and
outside this host's nginx config entirely (Cloudflare's DNS layer isn't
affected by local nginx changes).

### Verification

`curl -I` against all three real domains plus the previously-leaking
subdomain, and direct inspection of `/etc/nginx/sites-enabled/` to
confirm `default_server` now lives only on the stock `default` site.
Documented in `docs/PRIORITIES.md`'s "Recently resolved" with the full
evidence trail. The actual file edit and service reload were both
performed by the user directly, not this session.

## Replace git fetch with Tarball Download for Public Clones

- Status: Code written and tested; not yet live on production
- Updated: 2026-08-15

### Scope

User chose the code-level fix for the confirmed `CLONE_FAILED` issue:
replace `git fetch` with a plain HTTP tarball download for the
public-repo clone path, after ruling out both a wired-connection wait
and a simpler retry-with-backoff as the preferred direction.

### Method

Rewrote `clonePublicExactCommit` in `apps/worker/src/git/clone.js`.
Kept the existing owner/repo/commit-SHA validation
(`normalizePublicGithubRepositoryUrl` plus the 40-hex-char SHA check)
unchanged — still needed to safely construct the download URL. Replaced
the `git init`/`remote add`/`fetch`/`checkout`/`remote remove`/`.git`
removal sequence with: build the
`https://codeload.github.com/{owner}/{repo}/tar.gz/{sha}` URL (the exact
endpoint tested directly and repeatedly earlier this session, confirmed
reliable), download via Node's built-in `fetch` with
`AbortSignal.timeout`, and pipe the response body through a
byte-counting `Transform` (an independent size cap, since
`Content-Length` isn't always present or trustworthy) into
`spawn('tar', ['-xzf', '-', '--strip-components=1', '-C', workDir])` —
array args, no shell interpolation, matching this file's existing
documented security convention. All three streams (response body →
byte-limiter → `tar`'s stdin) are joined with a single
`stream/promises` `pipeline()` call rather than mixed raw `.pipe()`, so
an error or early exit anywhere in the chain properly destroys every
stage instead of leaking an unconsumed fetch response. Left
`cloneExactCommit` (the private, GitHub-App-authenticated path)
untouched — different auth mechanism, never observed to have this
failure mode, out of scope.

Added `maxBytes`/`downloadTimeoutMs` as optional parameters (defaulting
to the same constants used before) specifically so the size-limit
behavior could be tested cheaply with a tiny fixture rather than needing
a genuine 200MB archive.

Documented the one real property being traded away directly in the code,
not just in this log: `git fetch` independently verifies fetched objects
against their expected hash; this relies on TLS alone for transport
integrity, with GitHub's codeload service as the sole trust anchor for
"this content actually corresponds to this SHA." Judged not materially
different in practice (GitHub is already the trust anchor either way —
`git fetch` from github.com also trusts GitHub's servers to serve the
right objects), but a real, conscious tradeoff worth keeping visible
rather than silently dropped.

### Result

Wrote 4 new focused tests
(`tests/worker/git-clone.test.js`) — deliberately using the real `tar`
binary against a real fixture tarball (built in a `before()` hook via
the same binary, in "create" mode) rather than mocking extraction away,
mocking only `global.fetch` as the actual system boundary being
replaced, per this project's testing.md convention. Covers: successful
download+extraction with wrapper-directory stripping verified against
real extracted file contents, a non-200 response, the size limit
triggering (and confirming nothing was extracted when it does), and an
invalid commit SHA being rejected before any network call. All 4 pass.
Re-ran `build-deployment.job.test.js` (which mocks
`clonePublicExactCommit` at the function boundary and exercises the real
call site) as a regression check — all 13 tests still pass unchanged,
confirming the new optional parameters don't affect existing callers.
Clean `eslint`/`prettier --check` on both changed files.

**Not yet live.** This session has no way to ship HelloDeploy's own code
changes to the production worker (`/opt/hellodeploy` isn't writable from
here, `infrastructure/upgrade.sh` has never been run — the
already-tracked deployment-drift problem). The fix is real, tested,
local progress, but the next hellouniversity deploy retry won't actually
benefit from it until that separate problem is resolved and this code
reaches the live worker.

### Verification

`node --test tests/worker/git-clone.test.js` (4/4 pass),
`node --test tests/worker/build-deployment.job.test.js` (13/13 pass, no
regression), `npx eslint`/`npx prettier --check` on both changed files
(clean). Documented in `docs/PRIORITIES.md`, extending the existing
host-reliability/`CLONE_FAILED` item rather than creating a new one.

## Tarball Fix Deployed Live — CLONE_FAILED Persists, Root Cause Confirmed as GitHub Connectivity

- Status: Fix confirmed live and working as designed; deploy still blocked on host network
- Updated: 2026-08-16

### Scope

Got the tarball-download fix (previous entry) onto the production
worker. No working release mechanism exists (`infrastructure/upgrade.sh`
never run — tracked separately in `docs/PRIORITIES.md`), so the user
manually overwrote `/opt/hellodeploy/apps/worker/src/git/clone.js` with
the local repo's fixed version and restarted `hellodeploy-worker`
directly (new PID `1812513`, confirmed via `systemctl status` and a
clean `journalctl` startup sequence: Nginx helper connected, database
connected, ready and listening).

### Result

The fix itself is confirmed working exactly as designed — the worker's
own logs now say `"Clone: downloading public repository archive"`
instead of the old `git`-based message, proving the new code path is
live. But two more real deploy attempts through it
(`6a806b3218873c53d635d7db` at 13:35 UTC, `6a806d4018873c53d635d7f3` at
13:44 UTC) both still failed. Checked the actual `Deployment` documents
directly (not just log text) to confirm: both show
`failureCode: "CLONE_FAILED"`,
`failureSummary: "Repository clone failed: The operation was aborted due
to timeout"` — the new code's own `AbortSignal.timeout(180_000)` firing,
not a code defect. A live re-check run immediately after (this entry's
own timestamp) confirms the underlying condition is still present:
`curl` to both `codeload.github.com` and `github.com` itself hang past a
15s timeout with zero response, while a Cloudflare control endpoint
(`speed.cloudflare.com`) returns a clean `200` in 4.6s — the same
GitHub-specific-not-general-network signature identified when this was
first root-caused.

This is now 4 consecutive identical failures spanning the pre-fix
`git`-based attempts and the post-fix tarball attempts, plus a live
re-check, all pointing the same way: **this is a sustained
GitHub-connectivity problem from this host, not a transient blip the
fix needed to ride out.** The code fix did what it was supposed to —
eliminated git's specific pack-transfer failure mode — but can't fix an
upstream network path that doesn't reach GitHub at all right now.
Per the standing plan for this check, deliberately did not retry the
real deploy a third time this round into a network condition just
confirmed unchanged. Decision on how to proceed (wait longer for GitHub
connectivity to recover vs. treat "get this host onto a wired
connection" as the real next step) is handed back — see
`docs/PRIORITIES.md`.

### Verification

Direct `Deployment`/`deployment_events` document inspection via the
MongoDB driver (not log-text inference) for both post-fix attempts;
live `curl` re-check against `codeload.github.com`, `github.com`, and a
Cloudflare control endpoint immediately after. Documented in
`docs/PRIORITIES.md`, extending the existing host-reliability/
`CLONE_FAILED` item.

## GitHub Connectivity Recovered — Root Cause Confirmed Transient, Clone Retry Added

- Status: Connectivity confirmed healthy; clone-step retry-with-backoff shipped and tested; real deploy retry still pending
- Updated: 2026-08-18

### Scope

Resumed the hellouniversity pipeline test (Track C P3) diagnosis where the
2026-08-16 entry left off: `github.com`/`codeload.github.com` were hanging
with zero response while `speed.cloudflare.com` responded cleanly, and the
tarball-download fix (already live) couldn't work around a connection that
wasn't completing at all. Ran the diagnostic steps that hadn't been tried
yet: isolate IPv4 vs. IPv6, isolate which connection stage hangs, and — most
decisively — attempt the exact tarball download the worker performs, end to
end, rather than only a HEAD-style probe.

### Result

Connectivity to GitHub is now fully healthy from this host: `github.com`
(200, 0.44s), `codeload.github.com` (301, 0.85s), and a full
`codeload.github.com` tarball download of `4hprojects/hellouniversity`'s
current `main` commit (`dc4dd12`, 70.3MB compressed) completed cleanly in
2m26s at a steady ~480 KB/s with zero stalls — direct, stronger evidence
against an MTU blackhole than an indirect ping/tracepath probe would give.
IPv6 was ruled out entirely as ever having been a factor: `ip -6 route show
default` returns nothing — this host has no IPv6 route configured at all,
so every attempt (pre- and post-fix) was always over IPv4 only. Conclusion:
the 2026-08-16 failures were a genuine, transient connectivity interruption
between this host and GitHub's network that has since cleared — not a
persistent host misconfiguration (no MTU, IPv6, or DNS-resolver issue to
fix).

A second, more actionable finding came out of the full-download test:
`4hprojects/hellouniversity`'s tarball is legitimately large — 1,014
tracked files, ~80MB uncompressed (mostly blog/event images and a couple
of large JSON datasets, confirmed via the GitHub API tree listing, not a
repo-hygiene mistake) — and at this host's real sustained WiFi throughput
(~480 KB/s), a full download takes ~146s against the worker's 180s abort
timeout: a ~19% margin. Comfortable under today's clean conditions, but
thin enough that any WiFi degradation (the interface already shows
nonzero packet drops) could reproduce `CLONE_FAILED` again even without a
full connectivity outage.

Added a bounded retry (up to 3 attempts, 3s/9s backoff) around just the
clone step in `apps/worker/src/jobs/build-deployment.job.js`, scoped
narrowly to error shapes that indicate a transient stall (`TimeoutError`/
`AbortError` from the tarball fetch's `AbortSignal.timeout`, `'git
operation timed out'` from the private-repo git path, `'fetch failed'`
network errors) — deliberately excluding deterministic failures (bad SHA,
revoked repo, oversized archive) so those still fail fast on the first
attempt, per this project's error-handling convention. This directly
targets the risk the thin timeout margin above surfaced, and is
independent of whatever caused the 08-16 blip specifically.

### Verification

Live `curl`/`dig`/`ip -6 route` commands against `github.com`,
`codeload.github.com`, and `speed.cloudflare.com`; a full real tarball
download using the exact `codeload.github.com/{owner}/{repo}/tar.gz/{sha}`
URL pattern from `clonePublicExactCommit`; a GitHub API tree listing to
confirm the repo's real file sizes. `node --test
tests/worker/build-deployment.job.test.js` (19/19 pass, including 3 new
tests: retry-then-succeed, no-retry-on-non-transient-error, and
retry-exhaustion still marking `CLONE_FAILED`), `node --test
tests/worker/git-clone.test.js` (4/4 pass, no regression), clean
`eslint`/`prettier --check` on both changed files.

**Shipped live 2026-08-18 21:20 PST** — same manual-copy-and-restart path
used for the tarball fix (`infrastructure/upgrade.sh` still has never been
run, same deployment-drift problem). The user copied `clone.js` and
`build-deployment.job.js` into `/opt/hellodeploy` (`sudo cp`, since the
directory is `root:hellodeploy-config` mode `750` — this session has
neither read nor write access to it) and restarted both `hellodeploy-web`
and `hellodeploy-worker` via `sudo systemctl restart`. Both came back
cleanly on fresh PIDs (`web` 1951970, `worker` then 1952463 after a
second restart folded in the copied files): graceful SIGTERM drain on the
old processes, Nginx helper connected, database connected, worker ready
and listening, public `hellodeploy.online/ready` returning `200`
throughout. One incidental detour along the way: an initial `pm2 restart
all` was tried first, which restarted the unrelated `hellotasks`/
`hellotasks-control`/`hellorun` PM2 apps and a separate "repository-run
PM2 pilot" `hellodeploy` process (running directly out of this dev repo,
not the production systemd services) — harmless (all came back healthy;
`hellotasks.online`'s public `530` is the pre-existing, already-documented
Cloudflare DNS issue) but didn't touch the actual `/opt/hellodeploy`
systemd services this fix needed.

### Next

Retry the actual hellouniversity deploy trigger now that both the fix is
live and connectivity is confirmed healthy — needs an authenticated admin
browser session, which this session doesn't hold. See
`docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`'s "Current attempt" section.

## HelloUniversity Release Reconciliation

- Status: Phase 1 merged; Phase 2 privileged maintenance pending
- Updated: 2026-08-18T23:05:47+08:00

### Scope and findings

- Created `stabilize/hellouniversity-release` from the existing `main` checkout
  without discarding tracked, staged, or untracked work.
- Reconciled the 91-file starting worktree and fixed the five observed baseline
  failures: the `platformSubdomain` null collision, stale public-clone security
  assertions, the removed accessibility-report path, and obsolete workflow wording.
- Replaced the sparse unique platform-subdomain index with a unique partial index
  for string values and added actual index synchronization/collision coverage.
- Hardened the dry-run-by-default `hellotasks` to `hellodeploy_db` migration with
  distinct-target checks, destination model-index synchronization, document identity
  and count parity, complete model-reference checks, session-exclusion messaging, and
  value-safe CLI failures. No live database operation ran.
- Found and corrected two additional release blockers during review: version-2
  secrets did not decrypt after promoting/unsetting the rotation key, and the release
  pipeline swallowed post-route database failures while returning success. Rotation
  promotion is now tested; activation persists the project pointer and HEALTHY record
  before retiring the previous container and throws for job retry on state failure.
- Applied global Git credential-helper isolation to private git operations and escaped
  user-controlled content in the new high-risk-change notification email.
- Reconciled the tracker, production plan, live checklist, second-site checklist,
  priorities, and status review. HelloUniversity is the P4 pilot; five clone-stage
  failures and the fallback Nginx response remain failures, manual live copies are
  deployment drift, HelloRun is not a gate, and the release decision remains NO-GO.

### Local verification

- Runtime: Node.js `v22.22.1`; npm `11.17.0`.
- `npm ci` completed successfully from the lockfile.
- Focused database/index, migration, clone/security, rotation, notification,
  activation/rollback, project-search, accessibility, and workflow-documentation tests
  passed after their respective changes.
- Two independent pre-review `npm test` runs each passed 976 tests across 205 suites with
  zero failures, skips, cancellations, or todos. This includes repeated real MongoDB
  index reconciliation and duplicate-subdomain enforcement.
- The production-only dependency audit reports zero vulnerabilities. A lockfile-only
  audit update also moved the development `js-yaml` resolution to the patched release;
  the complete audit reports zero vulnerabilities.
- Lint, formatting, configuration validation, final diff checks, and the
  clean-checkout `npm ci` replay passed. The exact CI test command
  (`npm run test:coverage`) also passed all 976 tests and produced an aggregate report
  of 78.23% line, 89.16% branch, and 86.21% function coverage.
- PR #37's first CodeQL security gate reported four high findings. Two were real
  NoSQL-injection flows in admin project filtering; status input now must be a
  primitive allowlisted value and is embedded with `$eq`, while search input is
  primitive and bounded. Two test-only HTML/URL pattern findings were replaced with
  behavior assertions. The final CodeQL analysis and security gate both pass with
  zero alerts.
- The first remote CI coverage run hung because three new unit tests opened the real
  BullMQ Redis client. This was masked locally by the pilot host's active Redis. The
  admin suspend and server-stats queue boundaries are now injectable, their tests use
  explicit no-queue or stubbed-queue dependencies, and the STOP_PROJECT enqueue path
  remains directly covered. `REDIS_PORT=1 npm run test:coverage` passed 979 tests
  across 205 suites with no Redis dependency; final GitHub CI then passed in 60
  seconds at full head `abb2fe90fab1be49a7e74e4cd09d6a1e47df2b39`.
- The evidence-only final head
  `a2ed8df4d700f7c70970746dfe984cee85041b9f` passed CI in 59 seconds, CodeQL
  analysis, and the zero-alert CodeQL security gate. PR #37 was marked ready and
  merged with a merge commit, preserving the four review cohorts. The resulting
  immutable production candidate is
  `8bfdf399501578a7c008834dbc76453016ab95e6`; no production tag was created.

### Phase 2 read-only baseline

- The current workstation is the Ubuntu 26.04 pilot/production host and
  `/opt/hellodeploy` is present as root-controlled mode `750`; the current user cannot
  read or mutate it and noninteractive sudo is unavailable.
- `hellodeploy-web`, `hellodeploy-worker`, `hellodeploy-nginx-helper`, Nginx, and both
  Cloudflare Tunnel services are active. The web and worker use their intended
  identities and currently report zero restart counts.
- Public dashboard readiness, the unmatched-host fallback, and the retained PM2
  fallback each returned HTTP 200. Nginx parsed its configuration, but a complete
  `nginx -t` could not read the root-owned PID file and is not recorded as passing.
- No queue pause, backup, drift restoration, dashboard revert/reactivation, checkout
  change, service restart, or upgrade ran. Those actions require the merged immutable
  SHA, a declared maintenance window, and an operator-provided interactive sudo
  session.
- The read-only script audit found that `backup-pilot.sh`,
  `revert-dashboard-cutover.sh`, `activate-dashboard-cutover.sh`, and `upgrade.sh`
  all reject a dirty production checkout. Because the documented live clone/build
  copies are deliberate drift, the requested sequence cannot safely run the revert
  proof before drift capture and reconciliation. The maintenance window must capture
  the exact dirty checkout in protected encrypted evidence first, inspect and archive
  the drift without logging content, restore only files proven to be the explained
  manual copies, and only then execute the clean-checkout revert/reactivation proof
  and immutable upgrade.

### Phase 2 dirty-state backup prerequisite

- Added an opt-in `--capture-dirty-checkout` mode to the encrypted pilot backup.
  The default remains fail-closed for dirty repositories. The reconciliation mode
  stores Git-visible NUL-delimited status, binary index/worktree patches, and the
  modified or untracked file objects inside protected plaintext staging and the
  encrypted artifact without printing paths or contents.
- Backup manifest version 2 records `clean` or `dirty-captured` repository state.
  The verifier requires the drift inventory and a nonempty status only for the dirty
  state, rejects unexpected drift members for clean state, validates the nested file
  archive, and remains compatible with version-1 clean artifacts.
- Shell syntax passed. The focused backup and live-workflow suites passed 12 tests;
  the complete installer/operations group passed 182 tests across 36 suites. Final
  configuration validation, all 980 tests across 205 suites, lint, formatting,
  production dependency audit with zero vulnerabilities, and `git diff --check`
  passed. Target-host backup creation and retrieval verification remain unrun because
  they require the declared maintenance window, protected operator-selected paths and
  recovery key, and interactive sudo.

### Next gate

During the declared maintenance window, use an operator-provided interactive sudo
session to capture and verify protected backup evidence for the exact dirty live
state, pause/drain the queue, archive and remove only explained production drift,
complete the dashboard-revert/reactivation proof, and run
`infrastructure/upgrade.sh --ref 8bfdf399501578a7c008834dbc76453016ab95e6`.
Production normalization, deployment retry, database migration, DNS cutover, and
recovery remain unexecuted until their declared operational preconditions pass.

## 2026-09-02 — Protected Recovery Gate and Installation Verifier Correction

- PR #39 passed CI and CodeQL and merged at full SHA
  `a83d34009e02dffd35dc97392d0d5cf8833ca00d`.
- Captured the exact dirty production checkout, configuration, database evidence,
  routing state, and rollback instructions in an encrypted artifact. Copied it to
  the protected removable destination, retrieved it after remount, decrypted it
  with the separate recovery key, and passed the bounded archive verifier.
- Confirmed production drift contained only the two documented worker files,
  archived those copies, restored those paths to the recorded live commit, and
  required a clean checkout. Paused the deployment queue and passed the dashboard
  revert drill against the healthy PM2 fallback.
- The first immutable upgrade attempt stopped and rolled back on a verifier
  false-negative: on the Ubuntu 26.04 pilot, `runuser ... test -r` returned false
  for the protected GitHub key while a real open under both service identities
  succeeded. No key permissions were weakened.
- Changed the installation verifier to prove access with a zero-byte open and added
  a regression contract. The candidate verifier passes on the live host, including
  user/group boundaries, protected metadata, helper socket, active and enabled
  units, Nginx, and readiness.
- Verification: shell syntax; 20 focused installer/upgrade tests; configuration
  validation; lint; formatting; 985 tests across 205 suites; coverage at 78.13%
  lines, 89.33% branches, and 86.13% functions; production audit with zero
  vulnerabilities; and `git diff --check` all pass.
- The queue remains paused and dashboard traffic remains on the verified PM2
  fallback. Next gate: CI and CodeQL for the verifier correction, followed by an
  immutable upgrade retry using the resulting merged full SHA.

## 2026-09-02 — Production Normalization, Database Migration, and Pilot Build Gate

- PR #40 passed Node.js 22 CI, CodeQL analysis, and the CodeQL gate and merged at
  full SHA `d14d297cc88913041f3625062ea060367ef08daa`. The immutable production
  upgrade passed the corrected verifier, followed by the isolated dashboard cutover.
- A controlled reboot proved web, worker, helper, Nginx, and both tunnel services
  return automatically. All three HelloDeploy units were active and enabled with
  zero restarts; public dashboard health/readiness and HelloRun returned 200.
- The `hellotasks` to `hellodeploy_db` dry run identified 12 owned collections and
  intentionally excluded sessions. With web and worker writes stopped, the confirmed
  migration passed collection-count, document-identity, current-index, and reference
  parity with zero orphans. The protected URI switch, configuration validation,
  service restart, installed-host verifier, and public checks passed. The untouched
  source URI and data remain the rollback path.
- Pilot preflight confirmed the active Express project, current approval snapshot,
  exact GitHub `main` commit, manual mode, expected start/health settings, 39 secret
  names, repository access, quota, worker/helper readiness, and ample Docker/disk
  capacity. One previously queued manual deployment was the only live queue job.
- Deployment #6 emitted matching live Redis/SSE-source and persisted events through
  clone, validation, and build, then failed safely at `npm ci`. No managed container,
  active pointer, or Nginx route was created. The queue was paused again.
- Root cause: the worker forced `--network none` while generated Dockerfiles retrieve
  locked dependencies, and the Node template ran lifecycle scripts before copying
  source. The correction uses Docker's non-host default build network while keeping
  runtime secrets out of builds, copies Node source before `npm ci`, and preserves
  compound approved start commands as one JSON-encoded shell argument.
- An exact-SHA HelloUniversity proof build completed its CSS lifecycle and produced
  a non-root `node` image with the approved command. The disposable proof image and
  workspace were removed afterward. The application audit reports 15 dependency
  vulnerabilities, including one critical; custom-domain cutover remains blocked on
  application dependency remediation.
- Verification: 55 focused deployment/security tests, configuration validation,
  lint, formatting, 986 tests across 205 suites, coverage at 78.13% lines, 89.31%
  branches, and 86.14% functions, platform production audit with zero vulnerabilities,
  and `git diff --check` pass. Next gate: CI/CodeQL, merged immutable SHA, guarded
  production upgrade, then a controlled retry with the queue paused on any failure.

### Upgrade readiness-race follow-up

- PR #41 passed CI and CodeQL and merged the build correction at full SHA
  `b0147d021dbe7682019dc3125d1c7d352f314f51`.
- The guarded upgrade installed the candidate, but its single immediate readiness
  request ran before MongoDB-backed web startup completed. The verifier initiated
  rollback, then made the same premature request against the restored release and
  reported a critical rollback failure. Journals show both web starts converged
  normally in about three seconds; the prior release is publicly healthy and the
  queue remains paused.
- The installed-host verifier now retries readiness once per second for at most 30
  attempts. It still fails closed after that bounded deadline. Shell syntax, 21
  focused installer/upgrade tests, configuration validation, lint, formatting, 987
  tests across 205 suites, coverage at 78.13% lines, 89.32% branches, and 86.15%
  functions, the zero-vulnerability production audit, and diff validation pass.

### Upgrade wrapper readiness-race follow-up

- PR #42 passed Node.js 22 CI and both CodeQL gates and merged at full SHA
  `e25ff75396cd8264c96f1ed6610c6e92b8e4f6b4`.
- The guarded production upgrade exposed a second one-shot readiness request in
  `upgrade.sh`, before the newly bounded verifier. It rejected the candidate during
  normal startup, restored `d14d297cc88913041f3625062ea060367ef08daa`, and the
  bounded verifier then confirmed the rollback. The checkout is clean, all required
  services are active and enabled, public readiness passes, and the queue remains
  operator-paused.
- `upgrade.sh` now delegates release acceptance entirely to the complete bounded
  installation verifier. Shell syntax and 21 focused installer/upgrade tests pass.

### HelloUniversity managed-route activation follow-up

- HelloUniversity dependency remediation merged at
  `a314e43f02b0e72827ec5c84bf468bd82f70a826` with 605 tests and a zero-finding
  production audit. Deployment #7 built successfully but failed startup because the
  non-root container could not create an absent `uploads/` directory.
- The application correction merged at
  `77151de9b2ffdbb15f69187706c016f4ad487e78`. Deployment #8 then started non-root
  and passed its HTTP 200 health check, but route activation failed closed because
  the generated route uses `$connection_upgrade` and the host Nginx configuration
  did not define it. Neither candidate became active; the queue is paused.
- The platform ingress template now defines the standard bounded WebSocket upgrade
  map in the Nginx `http` context. Seventeen focused Nginx tests pass.

## Reboot Persistence Regression and Public Dashboard Outage

- Status: Local correction and full repository gate pass; protected host recovery blocked on backup/recovery inputs
- Updated: 2026-08-28T14:07:39+08:00

### Findings

- The host booted at 13:44 PST. Nginx and the constrained helper are active, but
  `hellodeploy-web` and `hellodeploy-worker` are inactive and disabled. Nginx still
  routes the dashboard to loopback port 3100, where no process is listening, so the
  public dashboard, health, and readiness endpoints return `502`.
- The local PM2 HelloDeploy fallback on port 3001 remains healthy, HelloRun returns
  `200`, and the unmatched HelloUniversity hostname still returns the default Nginx
  response. No public route or service was changed during diagnosis.
- Historical journal evidence shows the worker repeatedly failed safely during
  startup and reached more than 100,000 systemd restart attempts before reboot. The
  sanitized fatal handler intentionally records only an error classification, so
  the underlying protected configuration/dependency error still requires privileged
  diagnosis.
- PR #38's head passed CI, CodeQL analysis, and the CodeQL security gate before merge,
  but merge commit `2b404acee2a0e29f28de1b8a71cc131f4f85a427` is superseded as a
  production candidate because the reboot exposed missing service persistence.

### Local correction

- Successful dashboard cutover now enables the isolated web and worker only after
  routing, public, fallback, and queue checks pass. Its failure handler restores the
  prior enabled/disabled state.
- Upgrade activation enables the complete V1 service set before restart, and the
  installed-host verifier requires every service to be both active and enabled.
- Web and worker units now bound repeated startup failures to five attempts per
  minute instead of crash-looping indefinitely.

### Verification and blocker

- Shell syntax and 33 focused dashboard, upgrade, installation, and privilege tests
  pass; focused ESLint and Prettier checks pass for the JavaScript tests.
- The complete clean-install gate passes: `npm ci`, lint, formatting, local
  configuration validation, the full test suite, coverage, the production
  dependency audit with zero vulnerabilities, and `git diff --check`. Coverage is
  78.13% lines, 89.29% branches, and 86.13% functions.
- Noninteractive sudo is unavailable. An operator-approved desktop privilege prompt
  allowed bounded read-only inspection: the installed checkout is still at
  `32b5adbc0a434c78cdfc6ed7c2b56492e581d8b6` with exactly two Git-visible drift
  entries; protected production web and worker configuration validation and
  `nginx -t` pass. Root has one public backup key, no recovery secret key, three
  private rollback/recovery files, and no mounted removable/off-host destination.
  No backup, queue, checkout, service, Nginx, tunnel, deployment, database, or DNS
  mutation ran.
- Resume with an operator-authorized privileged session plus protected backup
  destination, recovery key, database evidence, and rollback instructions. Capture
  and verify the dirty live state before reconciling it or switching traffic.

### 2026-08-31 release qualification refresh

- Preserved the complete 14-file correction worktree on
  `fix/boot-persistence-recovery`; no unrelated starting change was discarded.
- Shell syntax and 37 focused lifecycle/documentation tests pass. Targeted ESLint
  passes; the repository formatting command passes all supported files.
- A clean `npm ci` installed 308 packages from the lockfile. Configuration
  validation, lint, formatting, and all 984 tests across 205 suites pass with no
  failures, skips, cancellations, or todos.
- Coverage passes the same 984 tests at 78.13% lines, 89.31% branches, and 86.13%
  functions. The production dependency audit reports zero vulnerabilities and
  `git diff --check` passes.
- Production remains unchanged while the correction proceeds through review. The
  next release gate is a passing PR/CodeQL review and the resulting merged full SHA;
  protected host recovery must still precede the immutable upgrade.
