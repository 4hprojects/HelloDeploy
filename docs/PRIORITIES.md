# Priorities

A quick-scan punch list of what's next, across both active tracks. This is a
human-readable pointer, not a source of truth — for status detail, evidence, and
command history, see [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md),
[HelloDeploy/HelloUniversity Production Plan](HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md), and
[Worklog](../WORKLOG.md). For the full analysis behind this list — architecture,
test/code-quality posture, direction check, completion estimate — see
[Project Status Review](PROJECT_STATUS_REVIEW.md). For second-site onboarding
readiness detail and live-pilot tracking, see
[Second-Site Deployment Checklist](SECOND_SITE_DEPLOYMENT_CHECKLIST.md); for the
admin-side UX audit behind Track D, see
[Admin UX Audit](ADMIN_UX_AUDIT.md); for the guest-facing audit behind
Track E, see [Guest Experience Audit](GUEST_EXPERIENCE_AUDIT.md); for the
platform-wide analysis behind Track F, see
[System Analysis](SYSTEM_ANALYSIS.md); for the security review of code
added this session, see [Security Review](SECURITY_REVIEW.md) (came back
clean — see Recently resolved below, no separate track); for the guest-to-
user onboarding handoff audit behind Track G, see
[Onboarding Handoff Audit](ONBOARDING_HANDOFF_AUDIT.md). Update this file's
ordering as priorities shift; don't copy evidence into it.

## URGENT — email verification likely broken for every new signup

Discovered 2026-08-15, unconfirmed pending a Resend dashboard check (see
below), but the evidence is strong. Two real signup attempts with a new
email address produced no verification email and no error anywhere —
`hellodeploy-web`'s logs show neither `"[email] Failed to send email"`
nor `"[email] DEV MODE"` for that window, meaning the Resend API call
itself reported success. Separately, `hellodeploy.online` has **zero**
email-related DNS records (checked directly: no SPF, no DKIM, no DMARC
TXT records at all). A password-reset email to the existing Super Admin
account (`hellodeployonline@gmail.com`) _did_ arrive, using the exact
same `sendEmail()` code path — which actually confirms the theory rather
than contradicting it: this is the signature of Resend's sandbox/
unverified-domain restriction, which delivers only to the email address
that owns the Resend account itself and silently drops everything else,
while still returning success from the API.

**If confirmed, this means no new user could complete signup right now**
— more fundamental than anything else currently tracked here, since it's
about whether anyone can get in the door at all, ahead of whether the
platform can deploy their project once they're in. Real-world impact is
unconfirmed rather than proven, though: checked all ~2 weeks of retained
nginx logs (current + rotated), and today's two test attempts are the
_only_ `POST /auth/create-account` requests logged in that entire
window — no evidence yet of a real prospective user having hit this
before today, consistent with this being a low-traffic pilot. The
delivery mechanism itself is confirmed broken for any recipient besides
the Resend account owner regardless of how many people it's affected so
far.

**Not something this session can fix directly** — needs the Resend
dashboard (no credentials available here) to confirm domain-verification
status and add the DNS records Resend specifies, in `hellodeploy.online`'s
Cloudflare DNS. Confirming question asked, answer pending: is
`hellodeployonline@gmail.com` also the email that owns the Resend
account? A yes would nail down the diagnosis completely.

## HIGH — production database is shared with an unrelated application

Discovered 2026-08-15 while chasing the quota-block investigation above.
Confirmed empirically (not inferred): production (`hellodeploy-web`/
`hellodeploy-worker`) connects to a MongoDB Atlas database called
`hellotasks` on `cluster0.11fgflq.mongodb.net` — not `hellodeploy_db`,
which is what the local repo's `.env` (a separate file from production's
own) claims `MONGODB_URI` should be. `hellotasks` holds HelloDeploy's 13
real collections (`users`, `projects`, `quotas`, `deployments`, `domains`,
`environment_secrets`, `sessions`, `audit_events`, `approval_requests`,
`repositories`, `deployment_events`, `platform_settings`,
`project_memberships`) **plus six collections that don't belong to
HelloDeploy at all** — `tasks`, `comments`, `notifications`,
`filerecords`, `auditlogs`, `appsettings` — meaning production shares its
database with a separate, unrelated application.

`hellodeploy_db` (the database `.env` actually names) was checked and
found almost entirely empty — every HelloDeploy collection has 0
documents except `sessions` (37 stale/expired entries) — consistent with
it being the originally-intended database from early setup, abandoned
when `MONGODB_URI` got pointed at `hellotasks` instead at some point in
this project's history.

A hardened, dry-run-by-default migration command now covers the 12 owned
non-session collections, synchronizes current model indexes, checks identity/count
parity and references, and requires `--confirm` for writes. **Not executed yet** —
the required order is first healthy HelloUniversity platform deployment, then
database isolation, then custom-domain cutover. The final copy still requires a
declared maintenance window, fresh backups of both databases, a paused/drained
queue, stopped writers, and operator authorization.

**Note for whoever runs the eventual migration**: a throwaway Super Admin
account (`_id: 6a8047fba817e086bfd3c5ff`) was seeded directly into
`hellodeploy_db` on 2026-08-15, matching the real seed script's own guard
logic, at the user's request. It has no associated data (no projects, no
history) and a different `_id` than the real account. The migration's
`mongorestore --drop` step will correctly wipe and replace it with the
real migrated data — no extra cleanup needed, just don't mistake it for
the real account if `hellodeploy_db` is inspected before the migration
runs.

## Track A — P2 production-cutover completion (blocking)

1. Exercise `infrastructure/revert-dashboard-cutover.sh` to a clean success —
   its stated blocker (HelloRun's own unrelated port-3000 PM2 crash-loop) is
   cleared as of a 2026-08-13 live check (`hellorun.online` now returns `200`,
   not the `502` this doc previously described). The script itself still
   hasn't actually been run — this item stays open, just unblocked. A first
   attempt found and fixed a real rollback-consistency bug; the fix is merged
   but hasn't been proven end-to-end yet.
2. Verify real application routing under the wildcard once a project can be
   deployed (P3) — today's probe only confirmed TLS/DNS work, not that a real
   managed project route resolves correctly.

Dashboard traffic cutover and queue resume are **done** — `hellodeploy.online`/
`www.hellodeploy.online` serve live via the isolated `hellodeploy-web` through
Nginx (PM2 never stopped), and the deployment queue is resumed
(`queue_state=resumed`). The previously-tracked "deliberately requeue the one
paused domain-verification job and observe" item is also resolved — see
Recently resolved below; it turned out to have already happened as an
unlogged side effect. Once the two items above land, P2 is complete and P3
(real deployment engine validation) is the next unblocked body of work — see
`docs/HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md` for its full action list.

## Track B — Code quality & security backlog (not blocking Track A, can run in parallel)

All but one item from the original 15-item Round 2 review (`docs/IMPROVEMENTS.md`,
analyzed 2026-07-06) were resolved or found already-fixed on 2026-08-13 — see
Recently resolved below. One remains open:

- E2 — No per-repo bare-clone cache (`apps/worker/src/git/clone.js`). Note: the
  original description overstated this — clones are already shallow
  (`fetch --depth 1`, exact commit only), not full history, so the real cost is
  smaller than "fresh full clone per deploy" implied. Deliberately left
  unimplemented: a shared cache needs real fetch/lock concurrency safety across
  simultaneous worker jobs on the platform's single most critical path, and
  wasn't attempted without stronger evidence the existing shallow-fetch cost is
  actually a problem. _Effort: M._

## Track C — In progress; immutable release reconciliation is the active gate

- **P3 — Validate the Real Deployment Engine**: deploy Static, React, Vue, Express,
  generic Node.js, and supported Next.js runtimes through the real pipeline. Full
  pre-flight checklist, workflow-status table, and live-pilot tracker:
  [Second-Site Deployment Checklist](SECOND_SITE_DEPLOYMENT_CHECKLIST.md).
  **In progress** — see that doc's "Current attempt: hellouniversity
  (Express)" section. Quota, approval, repository connection, detection, and
  environment-name configuration are done. Five clone-stage deployments failed;
  none reached build or activation. Tarball and retry changes were manually copied
  live during diagnosis, so the next action is release reconciliation and a supported
  immutable upgrade—not another deployment trigger. Punch list:
  - [ ] Re-verify the production GitHub App env group is complete
        (`GITHUB_APP_NAME` was found missing in a past audit; the group is
        all-or-nothing).
  - [ ] Deploy each supported runtime (Static, React, Vue, Express, Node.js,
        Next.js) through the real worker; confirm build, health check,
        activation, and routing.
  - [ ] Confirm a failed candidate never displaces a healthy release, and that
        rollback restores the intended release and route.
  - [ ] Confirm containers run non-root, resource-limited, loopback-only, and
        that secrets never leak into build output/logs/image history.
- **P4 — Host HelloUniversity Through HelloDeploy**: the active pilot-app cutover
  goal. The platform deployment is in progress; custom-domain work remains blocked
  until the platform URL is healthy and the dedicated-database migration passes.
- **P5 — Prove the Workflow for Other Projects**.
- **P6 — Recovery and Formal Production GO**: all incomplete release-gate items are
  blockers here by definition; the Track B backlog above must also be resolved or
  explicitly accepted as risk before this gate.

## Track D — Admin UX backlog (not blocking any other track, can run in parallel)

All 10 items from the admin-side efficiency/intuitiveness audit (2026-08-13)
are resolved — see Recently resolved below and [Admin UX Audit](ADMIN_UX_AUDIT.md)
for the full evidence trail and per-item resolution notes. Nothing currently
open on this track.

## Track E — Guest experience backlog (not blocking any other track, can run in parallel)

All 6 items from the guest-facing landing/marketing audit (2026-08-13) are
resolved — see Recently resolved below and
[Guest Experience Audit](GUEST_EXPERIENCE_AUDIT.md) for the full evidence
trail and per-item resolution notes. Nothing currently open on this track.

## Track F — Platform-wide UX backlog (not blocking any other track, can run in parallel)

All 6 items from the full-system pass (2026-08-13) are resolved — see
Recently resolved below and [System Analysis](SYSTEM_ANALYSIS.md) for the
full evidence trail and per-item resolution notes. Nothing currently open
on this track. Phase 18 (dashboard alerts, deployments-list auto-refresh,
a11y polish) and P3-P6 (real deployment validation onward) remain tracked
elsewhere (`docs/phases/README.md`, Track A/C) and were not duplicated here.

## Track G — Onboarding handoff backlog (not blocking any other track, can run in parallel)

All 3 items from the guest-to-user onboarding handoff audit (2026-08-13)
are resolved — see Recently resolved below and
[Onboarding Handoff Audit](ONBOARDING_HANDOFF_AUDIT.md) for the full
evidence trail and per-item resolution notes. Nothing currently open on
this track.

## Also worth a deliberate decision (not urgent, not blocking anything)

- **HelloDeploy's own production dashboard is running older code than this
  repo, discovered 2026-08-14.** Confirmed via two direct live checks:
  neither Track E's landing-page "How it works" section nor Track D's
  admin-index pending-approvals banner are present on hellodeploy.online.
  Root cause: **there is no working mechanism to ship HelloDeploy's own
  code to its own production host.** `docs/RELEASE_POLICY.md` describes a
  policy that's explicitly unenforced ("until then, operators must supply
  and verify immutable references explicitly").
  `infrastructure/upgrade.sh` exists — designed to pause the queue,
  install a new release, and auto-rollback on failure — but has **only
  ever been syntax-checked, never actually run against the live host**.
  Every prior "get code live" event in this project's history has been a
  manual, ad hoc SSH-and-restart action, including the one purpose-built
  script this project has (`activate-dashboard-cutover.sh`), whose own
  revert path had a real bug found only by exercising it live. No
  version/commit endpoint exists anywhere either — no way to ask the
  running process what it's running without filesystem access to
  `/opt/hellodeploy` (permission-walled from this session). Deliberately
  **not** run as a side effect of the quota-block workaround it was found
  during — running an unproven "pause queue, swap release, auto-rollback"
  script against production for the first time deserves its own dedicated
  planning and explicit go-ahead, the same care given to
  `revert-dashboard-cutover.sh`. Until this happens, all of Tracks D-G and
  the documentation consolidation pass exist only in this repo, not for
  real users.
- Several dependencies have open major-version gaps (`mongoose`, `bullmq`,
  `connect-mongo`, `ioredis`, `resend`, `eslint`) — none are security issues today,
  but worth a deliberate upgrade pass rather than indefinite drift.
- **Super Admin seed credentials, discovered 2026-08-14.** Confirmed
  `scripts/seed-super-admin.js` is a one-time bootstrap: it reads
  `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`/`SUPER_ADMIN_FIRST_NAME`/
  `SUPER_ADMIN_LAST_NAME` from `.env` once, writes a real `User` document
  to MongoDB with a bcrypt-hashed password, and refuses to run again once
  a Super Admin exists. MongoDB is already the single source of truth for
  every account, not just this one — there was nothing to migrate. What
  needed cleanup: those 4 values serve no ongoing purpose (the running app
  never reads them; only the one-time script did) and the script's own
  log output says plainly "do not store them in source control." The
  local repo's `.env` still had them — asked the user to remove the 4
  lines directly (this session's own permission settings block reading or
  editing that file). **Still open, and more important:** the current
  password is weak (dictionary-word-based, minimum-length) and passed
  through this chat session directly — worth rotating on the live account
  via the app's normal password-change flow.
- `hellodeploy-web` outage, investigated 2026-08-13: a live MongoDB connection
  drop (`MongoServerSelectionError`) crashed the process at 20:06:31, then DNS
  resolution to the MongoDB host was unreachable (`ESERVFAIL`, then
  `EREFUSED`) for every restart attempt until 20:11:48 — **5m17s with no
  working process**, 22 crash/restart cycles. Root cause is DNS/network
  flakiness external to the app, not a code bug — `packages/observability/src/
process-errors.js` deliberately treats `uncaughtException`/
  `unhandledRejection` as fatal and exits, relying on systemd to restart
  (`Restart=on-failure`, `RestartSec=5`), which is a sound Node.js pattern, not
  an oversight. `hellodeploy-worker` was unaffected only because its
  already-open connection never needed to re-resolve DNS. Confirmed via nginx
  access logs (zero requests to any host during the window) that **no real
  visitor was actually affected** — this was lucky timing, not resilience.
  The bigger thing this surfaced: the production host's hostname
  (`henz-Inspiron-3443`) indicates this runs on a personal laptop, not managed
  server/cloud infrastructure — laptop sleep, a network change, or an OS
  update reboot would take the whole platform down, and no code change fixes
  that. See the next item.
- **Confirmed 2026-08-15: this host connects via WiFi, not a wired
  connection** — `ip -s link` shows the wired interface (`enp7s0`) is
  `NO-CARRIER` (unplugged); the active interface is `wlp6s0`, with
  non-zero packet drops (33 RX, 1,344 TX). This surfaced while
  diagnosing three consecutive real deploy failures for the
  hellouniversity pipeline test (Track C P3) — every attempt failed
  identically with `CLONE_FAILED` / "git exited with code 128" after
  ~2 minutes (deployment IDs `6a80524c18873c53d635d783`,
  `6a8055a618873c53d635d79b`, `6a805ba118873c53d635d7b6`). Root-caused
  precisely: DNS/TLS/initial HTTP connections to GitHub are fast
  (200-500ms), and a plain HTTP tarball download of the same commit's
  content transfers steadily at ~300 KB/s with no stalling (confirmed
  directly, ~4.2 MB in 14s with a live byte-by-byte trace) — but `git
fetch`'s specific pack-transfer mechanism (the HTTP response body piped
  into a separate `git index-pack` subprocess,
  `apps/worker/src/git/clone.js`) reproducibly stalls indefinitely on
  this exact host/network combination, confirmed via a direct manual
  reproduction that hung for 3+ minutes with zero progress. This is not
  a generic "slow network" problem (plain downloads work fine) and not a
  HelloDeploy code bug — it's a specific incompatibility between git's
  smart-HTTP wire protocol and this host's WiFi connection, most likely
  related to the packet drops above interacting badly with the
  inter-process piping/flow-control involved in streaming a pack into
  `index-pack`. Three consecutive identical failures (including one
  retried immediately after confirming a working connection via direct
  curl test) rules out both random bad luck and simple network
  contention. **Code fix written and tested 2026-08-15** —
  `clonePublicExactCommit` in `apps/worker/src/git/clone.js` no longer
  uses `git fetch` at all for public repos; it downloads a tarball of the
  exact commit from GitHub's `codeload.github.com` archive endpoint and
  extracts it with `tar`, sidestepping git's smart-HTTP pack-transfer
  protocol entirely (the specific thing that was failing) while losing
  nothing — `.git` was already being deleted immediately after cloning,
  so only file contents at the exact commit were ever actually used
  downstream. 4 new focused tests added
  (`tests/worker/git-clone.test.js`, using a real `tar` binary against a
  real fixture archive, mocking only `fetch` as the actual system
  boundary) plus a regression check against the existing
  `build-deployment.job.test.js` — both clean. One property intentionally
  traded away, documented as a code comment at the change site: `git
  fetch` independently verifies fetched objects against their expected
  hash; a tarball download relies on TLS alone for transport integrity,
  trusting GitHub's codeload service to serve the right content for a
  given URL (not a materially different trust boundary in practice, since
  GitHub is already the trust anchor either way, but a real property
  being traded for reliability). **Manually copied live on production**
  (2026-08-15, file copy + worker
  restart, since no working release mechanism exists — see the
  deployment-drift item below). Confirmed working as designed — worker
  logs show the new tarball download path is active — but two real
  deploy retries through it still failed identically
  (`CLONE_FAILED`, `"The operation was aborted due to timeout"`,
  checked directly against the `Deployment` documents, not just log
  text). A live re-check immediately after (2026-08-16) confirms the
  underlying condition is unchanged: `github.com` and
  `codeload.github.com` both hang past 15s with zero response, while a
  Cloudflare control endpoint returns clean. **This is now 4 consecutive
  identical failures across the pre-fix and post-fix attempts plus a
  live re-check — a sustained GitHub-connectivity problem from this
  host, not a transient blip.** The code fix is confirmed correct and
  live; it cannot fix an upstream network path that doesn't reach
  GitHub at all.
  **2026-08-18 update — confirmed recovered, and hardened against
  recurrence.** A fuller diagnostic sweep (IPv4/IPv6 isolation via
  `curl -4`/`curl -6`, and — decisively — an actual end-to-end tarball
  download replicating `clonePublicExactCommit`'s exact URL) found
  connectivity fully healthy: sub-second responses from both GitHub
  hosts, and a full 70.3MB tarball of the real repo downloaded cleanly
  in 2m26s at ~480 KB/s with zero stalls, which is stronger direct
  evidence against an MTU blackhole than an indirect probe. IPv6 was
  ruled out entirely — `ip -6 route show default` is empty, so this
  host has never had an IPv6 route; every attempt was always IPv4-only.
  The 08-16 failures were a real, transient interruption, not a
  persistent misconfiguration. One new finding worth tracking: the
  hellouniversity repo's real tarball (~80MB uncompressed, legitimately
  large — mostly image assets, confirmed via the GitHub API tree
  listing) takes ~146s to download at this host's real sustained
  throughput, against the worker's 180s abort timeout — a real but thin
  ~19% margin that a repeat of the WiFi interface's existing nonzero
  packet drops could close. Added a bounded retry (3 attempts, 3s/9s
  backoff) around just the clone step in
  `apps/worker/src/jobs/build-deployment.job.js`, scoped to
  transient-shaped errors only so deterministic failures still fail
  fast; tested (`build-deployment.job.test.js` 19/19,
  `git-clone.test.js` 4/4, no regressions), clean lint/format. **Shipped
  live 2026-08-18** — same manual-copy-and-restart path as the tarball
  fix (no working release mechanism yet); both `hellodeploy-web` and
  `hellodeploy-worker` restarted cleanly on fresh PIDs, public `/ready`
  stayed `200` throughout. The next action is a real hellouniversity
  deploy retry — see `docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`'s
  "Current attempt"
  section and `WORKLOG.md`'s "GitHub Connectivity Recovered" entry
  (2026-08-18) for full evidence. **Track C P3 is unblocked again** —
  the wait-on-external-conditions pause is over; the HIGH
  database-migration item above no longer needs to hold this one back,
  though both remain reasonable to interleave.
- **Baseline uptime check added 2026-08-14** (`.github/workflows/uptime-check.yml`)
  — a scheduled GitHub Actions workflow curls `https://hellodeploy.online/ready`
  every 10 minutes and fails the run (triggering GitHub's built-in
  workflow-failure notification to the repo owner) if it doesn't return
  `200`. Checks `/ready` rather than `/health` deliberately — `/ready`
  also validates MongoDB, Redis, and queue state, not just that the HTTP
  process is listening. No third-party signup needed (repo is public, so
  Actions minutes are free) and no destination to configure — this only
  runs once merged to the default branch, since GitHub Actions schedules
  only fire from there. This is the baseline option from the choices
  below, not the strongest one — a dedicated external pinger (option 1)
  remains a worthwhile upgrade if reliability beyond GitHub's own
  scheduler and notification delivery matters more than avoiding a new
  account:
  1. **External free uptime pinger** (UptimeRobot / Better Uptime / Healthchecks.io
     / Freshping, etc.) hitting `/health` or `/ready` on a 1-5 min
     interval, alerting by email/SMS/Slack. Catches full outages
     (DNS/host/process down) since it runs off-host, and isn't subject to
     GitHub Actions' best-effort scheduling delays under load. Needs
     signing up for a third-party account — a decision, not just a code
     change, so left for a deliberate choice rather than done here.
  2. **In-app self-monitoring** (a scheduled internal check that pages on
     degradation) — weakest option: if the process itself is down, an
     in-process check can't fire, which is exactly the failure mode that
     actually happened 2026-08-13.

## Recently resolved (kept brief — see Worklog for evidence)

- **2026-08-15 nginx cross-app leak fixed**: discovered when the user
  directly hit `hellouniversity-4e6a.hellodeploy.online` in a browser and
  saw a login page for "HelloTasks" — a completely unrelated application.
  Root cause: `/etc/nginx/sites-available/hellotasks` claimed
  `default_server` status (`listen 80 default_server;` on both IPv4/IPv6),
  and HelloDeploy had no wildcard/catch-all config of its own for
  `*.hellodeploy.online` (`/etc/nginx/hellodeploy.d/`, where the worker
  writes a dedicated config per successfully-deployed project, was
  completely empty — no project has ever completed a real deploy). Net
  effect: **any unmatched Host header on this host's port 80, including
  every current and future HelloDeploy project subdomain without a real
  deploy, silently served the unrelated HelloTasks application** — a real
  app with real user accounts, live on production. Fixed by the operator
  directly (no `/etc/nginx/` write access from this session): removed
  `default_server` from `hellotasks`'s config, enabled the stock nginx
  default site (`server_name _;`, previously present but not enabled) as
  the new safe default, validated with `nginx -t`, reloaded. Verified:
  the previously-leaking subdomain now serves nginx's generic default
  page, and `hellodeploy.online`/`hellorun.online` both confirmed
  unaffected (no regression). One unrelated thing surfaced along the
  way: `hellotasks.online` itself returned a Cloudflare `530` error
  during verification — looks like the same "DNS points to prohibited
  IP" issue seen on `hellouniversity.online` earlier, pre-existing and
  unrelated to this fix (Cloudflare's DNS layer is unaffected by this
  host's own nginx config).
- **2026-08-14 Baseline uptime check added**: a new
  `.github/workflows/uptime-check.yml` polls `/ready` every 10 minutes and
  fails the run on anything but `200`, triggering GitHub's own
  workflow-failure notification — closes the "nothing would have surfaced
  a real outage" gap from the 2026-08-13 crash-loop investigation with a
  zero-account, zero-cost baseline. Only activates once merged to the
  default branch (GitHub Actions schedules require it). Full detail and
  the still-open stronger-option choice (a dedicated external pinger) are
  under "Also worth a deliberate decision" above.
- **2026-08-14 `WORKLOG.md` split executed**: the proposed date-based split
  was carried out — 100 of 117 entries (2026-07-02 through 2026-07-31, the
  initial hardening/UX phase and P0-P2 production-cutover work) moved to
  [`docs/archive/WORKLOG_2026-07.md`](archive/WORKLOG_2026-07.md);
  `WORKLOG.md` now holds the 17 entries from 2026-08-01 onward (1,048
  lines, down from 3,510) plus a pointer to the archive. Verified
  byte-exact via line-count reconciliation before formatting; confirmed no
  code anywhere reads `WORKLOG.md` programmatically, so nothing else
  needed updating. The ongoing-policy proposal (roll the oldest month into
  a new archive file once the live file crosses ~2,000 lines again) still
  stands for future splits.
- **2026-08-14 Express 4/5 doc mismatch corrected**: `CLAUDE.md` claimed
  "Express 5"; the installed, actually-running version is Express 4.22
  (`apps/web/package.json`). Took the safe half of the "migrate or correct
  the docs" choice — corrected `CLAUDE.md` to say Express 4, did not touch
  the actual dependency (a real migration is a separate risk decision, not
  a docs fix).
- **2026-08-14 Documentation consolidation pass**: full analysis,
  organization, and correction of `docs/` (35 files, ~9,800 lines) via
  three parallel read-only surveys. Fixed confirmed contradictions —
  `IMPROVEMENTS.md`'s 19 stale checkboxes flipped to match Track B's
  actual resolution (26/28 Round 2 items now resolved, confirmed by
  direct count), `README.md`'s doc index rewritten to include the 10
  files it was missing, `PROJECT_STATUS_REVIEW.md`'s stale P2 percentage
  and backlog-count claims corrected, `LIVE_WORKFLOW_ACCEPTANCE.md`/
  `DEPLOYMENT_READINESS_ROADMAP.md` spot-corrected against the 2026-08-13
  Track A findings. Archived 6 docs into a new `docs/archive/` (5
  self-declared-superseded docs that had never actually been moved, plus
  `PROJECT_SETTINGS_UX_SPEC.md`, whose 4 delivery phases all shipped
  2026-07-13). Resolved 4 cases of genuine content duplication — merged
  `WORK_LOOP.md`'s handoff section into `IMPLEMENTATION_BATCH_TRACKER.md`,
  folded `UI_UX_ACCESSIBILITY_PASS.md` into `UI_UX_IMPROVEMENT_BACKLOG.md`
  (which also had its 13 `Done` rows compressed to a changelog),
  folded `RELEASE_SMOKE_TEST.md` into `OPERATIONS_RUNBOOKS.md`, and added
  a disambiguation note plus corrected stale "Planned" statuses in
  `docs/phases/README.md` (phases 12-17 were actually resolved via Track B
  without ever getting a dedicated phase file). `WORKLOG.md`'s own size
  (3,400+ lines) was flagged as a separate, out-of-scope decision (above),
  not acted on. Every moved/removed file's inbound references were
  grepped and fixed. Clean `npm run format:check`. No code changed;
  nothing touched the live production host.
- **2026-08-13 Track A status correction**: a live, read-only status check
  (prompted by a user question about why Track A/C hadn't been worked on)
  found two of Track A's tracked blockers were stale. The "deliberately
  requeue the one paused domain-verification job and observe" item had
  actually already completed on 2026-08-10 — as an unlogged side effect of
  `scripts/resume-deployment-queue.js` that day, not the deliberate watched
  step the plan called for. The domain (`hellorun.online`) is now in
  `PENDING_ADMIN_APPROVAL`. Separately, `hellorun.online` — the cited
  blocker for exercising `revert-dashboard-cutover.sh` — was found back to
  `200` (the docs still described a `502` PM2 port-3000 crash-loop from
  2026-08-09). Corrected `PRIORITIES.md`,
  [Second-Site Deployment Checklist](SECOND_SITE_DEPLOYMENT_CHECKLIST.md),
  and `HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md` to reflect current reality.
  No production actions taken — the revert script itself still hasn't been
  run, and a transient `hellodeploy-web` crash-loop found during the same
  check was recorded (above) but deliberately not investigated this pass.
- **2026-08-13 Security review of Track G's code**: a follow-up, narrower
  `security-reviewer` pass covering the auto-login session-establishment
  logic, the resend-verification rate-limit handler, and the two touched
  EJS templates from the Track G pass below (this code postdated the
  ~90-file review and hadn't been reviewed yet). One agent was enough —
  the diff is small and logically contained, unlike the earlier review's
  three unrelated attack-surface groups. Came back clean: session
  fixation is handled correctly (`regenerate()` before `session.user`,
  matching `postSignIn`), no open redirect (`redirectByRole` and the new
  rate-limit redirect target are both fixed strings, no request input),
  the rate-limit handler change doesn't weaken the limiter itself or leak
  an enumeration signal, `toSessionUser()` never exposes
  `passwordHash`/token hashes (confirmed `select: false` directly in the
  schema), and the new EJS branch is 100% static with no interpolation.
  Every claim independently re-checked against source. Full write-up
  appended to [Security Review](SECURITY_REVIEW.md) under "Track G —
  Session/Auth Changes." No backlog track created — nothing to track.
- **2026-08-13 Track G onboarding handoff pass**: resolved all 3 items from
  the guest-to-user onboarding handoff audit — the seam between signup and
  the first authenticated screen. Biggest fix: email verification now
  signs the user straight in (H1) — `verifyEmail()` returns a
  `sessionUser` (same shape `signIn()` already returns) and
  `getVerifyEmail` regenerates the session before setting
  `req.session.user`, the identical fixation-safe sequence `postSignIn`
  uses, then redirects via `redirectByRole` instead of bouncing to
  sign-in — the user no longer has to retype a password they already
  entered twice during signup. The resend-verification rate limiter now
  redirects back to the verify-email page with an inline message instead
  of a generic full-page 429 (H2), scoped to that one limiter only — every
  other limiter's full-page behavior is unchanged. The reset-code page now
  states the 1-hour expiry on-page, not just in the email (H3). 19 new/
  updated tests across `tests/auth/verify-email-session.test.js` (new) and
  `tests/security/rate-limit.test.js`; confirmed the pre-existing
  `tests/security/session-fixation.test.js` source-order check still
  passes unmodified. Clean lint/format pass; nothing touched the live
  production host.
- **2026-08-13 Security review of session code**: dedicated OWASP-style
  review (three parallel `security-reviewer` passes: crypto/secrets, web
  input/authz/output-encoding, worker/client-JS) of every file changed
  across this session's four prior analysis passes (~90 files). Came back
  clean — no exploitable issues. Every finding claim independently
  spot-checked against the actual source before being recorded, including
  confirming the attacker-controllable live DNS TXT record content (Track
  F's domain screen) is properly auto-escaped, and that the `SUPER_ADMIN`
  gating changes (Track D) are neither over- nor under-restrictive. One
  forward-looking (non-actionable) note recorded for future callers of the
  audit-metadata size validator. Full write-up:
  [Security Review](SECURITY_REVIEW.md). No backlog track created — nothing
  to track.
- **2026-08-13 Track F full-system pass**: resolved all 6 items from a
  platform-wide analysis covering steady-state project management,
  functional completeness, and cross-cutting consistency — confirmed the
  app overall is a deliberately engineered product (no stub routes, no
  dead links, real accessibility/responsive/dark-mode systems, zero raw
  `window.confirm()` calls anywhere). Fixes: environment variables page now
  states plainly that secret changes don't auto-redeploy (F1); members page
  now explains Owner/Maintainer/Viewer permissions, corrected against the
  actual route-level role gates rather than assumed (Maintainer can deploy
  and roll back, but not touch settings/secrets/members/domains — all
  `ownerOnly`) (F2); domain-add form now uses the same inline-validation
  pattern every other add form in the app already uses (F3); rollback UI
  reworded in plain language with the retention window explained (F4);
  the legacy `APPROVAL_REQUIRED` dead-end message now explains what
  replaced it (F5); corrected an `IMPROVEMENTS.md`/`docs/phases/README.md`
  status inconsistency (F6) — and along the way found that `IMPROVEMENTS.md`'s
  still-open **U5** item conflates the webhook TODO already fixed in the
  Track B pass with a separate, still-open gap (unexpected webhook-handler
  errors after the 200 response have no user-facing signal,
  `webhook.controller.js:314`) — flagged in `docs/SYSTEM_ANALYSIS.md`, not
  fixed here, so it isn't lost or marked done by mistake. Verified with
  151 passing tests across `tests/ui`, `tests/domain`, rollback-flow, and
  domain-validation suites.
- **2026-08-13 Track E guest experience pass**: resolved all 6 items from the
  guest-facing landing/marketing audit. Highlights: corrected a **false
  claim** in the Terms of Service — it stated signup was
  "invitation-only... requires approval from the platform administrator,"
  but no such mechanism exists anywhere in code (verified directly against
  `auth.service.js`/`UserStatus`); per the user's explicit choice, fixed the
  copy rather than building new gating (G1). Added an honest caption near
  the landing-page hero disclosing that hellodeploy.online is one specific
  shared pilot instance operated by a named individual as an MIT capstone
  project, and that it's free to use — facts that were previously disclosed
  only in Terms, never where a guest is actually deciding to sign up (G2,
  G3, G6). Added a "How it works" 4-step section and a "What you can
  deploy" supported-runtime list to the landing page, reusing
  `docs/USER_GUIDE.md`'s existing accurate copy rather than inventing new
  claims (G4, G5). Verified with a full `tests/ui/*.test.js` sweep
  (119/119 passing).
- **2026-08-13 Track D admin UX pass**: resolved all 10 items from the admin
  UX audit. Highlights: quota screen now shows a resolved name with
  "Manage Quota" links from users/projects (A1); approval-request
  Approve/Reject now confirm before firing, via a shared-form per-button
  confirm-attribute override added to the confirm-modal JS (A2); suspension
  reason is now collected and shown inline for both users and projects,
  including a schema addition (`suspendedAt`/`suspensionReason`) to the
  Project model, which didn't have it before (A3); the admin index now
  surfaces pending domain approvals and a worker/queue alert banner (A4);
  projects list gained the same search users already had (A5); audit log
  actor IDs now resolve to name/email (A6); Resume Queue now confirms,
  matching Pause Queue and Maintenance (A7); suspend/reactivate flash
  messages now name the actual user/project (A8); a MongoDB connectivity
  card was added to the server dashboard — Docker connectivity was
  deliberately left unchecked from the web process, since it has no Docker
  socket access by design (A9); the domain approval screen now shows a live
  DNS TXT re-check alongside the stored verification timestamp, without
  ever exposing the stored verification secret (A10, only the publicly
  resolvable DNS record itself). All 10 items shipped with focused tests and
  a clean lint/format pass; nothing touched the live production host.
- **2026-08-13 Track B backlog pass**: resolved or verified all but one item
  (E2, above) from the Round 2 review, plus the U5 webhook-notification TODO
  and the two code-level risks found while building the second-site
  checklist. Highlights: safe additive master-key rotation path (S1) with a
  migration script; worker-side audit events wired for build/activate/
  rollback/delete/decrypt plus the nginx-restore-failure path (W10, S8);
  JWT/PEM added to log redaction (S3); a production tripwire against the
  all-zero dev master key (P6); SUPER_ADMIN gating extended to queue
  pause/resume and quota overrides (S4); dangling Docker image pruning (W6);
  maintenance-mode check cached (E1); `getRollbackTargets` bounded (E4);
  shared `required`/`optional` env helpers between web and worker (P3);
  git pre-commit hook and CI coverage reporting + CodeQL added (P2, P1);
  dead scaffold directories removed (P5); new tests for previously-untested
  surfaces (S7, P4). Several items (W2, S6, W8, S5 in part) were found
  already fixed since the original 2026-07-06 analysis. All changes are
  local/code-only — nothing was run against the live production host.
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
