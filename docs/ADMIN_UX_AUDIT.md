# Admin UX Audit

Updated: 2026-08-13

## Purpose

A full analysis of the platform-admin-facing side of HelloDeploy (user
management, project management, approval-request review, domain approvals,
quota management, and server operations) from an efficiency and intuitiveness
standpoint: can an admin manage the platform without confusion, in as few
steps as needed, with clear feedback and appropriate warnings before
high-impact actions? Companion to the earlier onboarding UX audit that
produced the deployment-failure plain-language translation
(`packages/contracts/src/failure-codes.js`). The prioritized backlog this
audit produced lives in [`PRIORITIES.md`](PRIORITIES.md) under Track D — this
file is the evidence behind that list.

## What's already strong

- **Approval-request review** (`apps/web/src/views/pages/admin/approval-requests.ejs:51-98`)
  shows everything an admin needs in place — purpose, owner, submitted-by,
  source repo, production branch, checked commit SHA, runtime/deployment
  mode, build/start commands, output directory, health check, and the full
  readiness-findings list — with no need to navigate elsewhere. It also
  detects staleness: _"The repository, application check, or project settings
  changed after submission. Approval is blocked until the owner checks and
  resubmits,"_ and disables Approve when `!r.snapshotState.isCurrent`
  (line 111). This is the best UX found in either audit.
- **Server dashboard** (`apps/web/src/views/pages/admin/server.ejs`,
  `admin.controller.js:39-46`) shows real operational data: CPU load/cores,
  memory and disk usage with an alert style above 85%, running-container
  count, worker connectivity ("N worker(s) connected" / "No deployment
  worker is connected. Queued jobs will not be processed."), and queue state
  with Waiting/Active/Delayed/Failed counts. Pause Queue and both
  Maintenance Mode toggles all have `data-confirm` dialogs with specific
  warning copy (e.g. _"Pause the deployment queue? Running jobs will finish,
  but no new jobs will start."_).
- **Domain approval queue** (`apps/web/src/views/pages/admin/domains.ejs`)
  resolves IDs to project names (not raw ObjectIds), has a confirm dialog on
  Approve that includes the hostname, and already has an inline optional
  `reason` text input on Reject — the only place in the admin UI where a
  decision reason is actually captured.
- **Audit log** (`apps/web/src/views/pages/admin/audit-events.ejs`) is
  genuinely filterable — action prefix, actor ID, target type, outcome
  (Success/Failure/Denied), date range — with pagination and a CSV export
  (itself behind a confirm dialog).
- **User list search** (`apps/web/src/views/pages/admin/users.ejs:6-25`)
  has a working name/email search plus a status filter, backed by a real
  regex query in `admin.service.js:41-49`.

## Gaps, in priority order (all resolved 2026-08-13)

### 1. Quota screen shows raw IDs, no way to navigate to it

`apps/web/src/views/pages/admin/quota.ejs:5` renders the page header as
`<%= scopeType %> / <code><%= scopeId %></code>` — literally `user /
64f2a1b3c9d0e1f2a3b4c5d6` — never resolved to a name or email. There is also
no link into `/admin/quotas/:scopeType/:scopeId` from `users.ejs` or
`projects.ejs`; an admin must hand-construct the URL to manage a quota at
all. Current usage vs. limit _is_ shown (separate "Current Limits" and
"Current Consumption" definition lists, `quota.ejs:30-44`) but not visually
paired (no "42/50 used").

**Fix direction:** resolve the scope to a readable name in the header
(user's email or project's name — the controller already has the record on
hand via `getAdminQuota`), and add a "Manage quota" link from the relevant
row/detail context in `users.ejs`/`projects.ejs`.

**Resolved:** `getQuotaScopeName` added to `admin.service.js`, wired into
both `getAdminQuota` and `postAdminSetQuota`; `quota.ejs` now shows the
resolved name with the raw ID as secondary text. "Manage Quota" links added
to both `users.ejs` and `projects.ejs` row actions.

### 2. Approval-request Approve/Reject have zero confirmation

`approval-requests.ejs:109-114` — both buttons fire immediately. Approving
moves a project live; requesting changes blocks the owner and requires
resubmission. Both are meaningfully consequential, yet neither has the
`data-confirm` treatment already used for Suspend actions on the users and
projects lists.

**Fix direction:** add `data-confirm` to both buttons, mirroring the
existing suspend-button pattern (`users.ejs:64-69`, `projects.ejs:64-69`).

**Resolved:** since Approve and Request Changes share one `<form>`, the
shared confirm-modal JS (`app.js`) was extended to let a specific submit
button override the form's own `data-confirm-*` attributes — a small,
backward-compatible addition (falls through to the form when a button has no
attributes of its own) that any future multi-action form can reuse.

### 3. Suspension reason is stored but never collected or shown

`admin.service.js:67-69` stores `suspendedAt`/`suspensionReason` on both user
and project suspension, but no UI field ever populates `suspensionReason` —
the confirm modal on Suspend is yes/no only. The field is consequently always
null/undefined in practice. It's also never displayed anywhere afterward;
the only way to see _why_ something was suspended is to cross-reference the
separate audit-events log by actor/target ID.

**Fix direction:** add an optional reason textarea to the suspend confirm
flow, mirroring the domain-reject reason input that already exists and
already proves the pattern works. Surface it inline (e.g. in the status
badge tooltip or an inline note) wherever suspension status is shown.

**Resolved:** added a visible `reason` text input to both suspend forms
(mirroring the domain-reject input exactly). The Project model had no
`suspendedAt`/`suspensionReason` fields at all (unlike User) — added them,
and wired `adminSuspendProjectWithStop`/`adminReactivateProject` to
set/clear them. Both list views now show the reason inline under the status
badge when present.

### 4. No consolidated "needs attention" admin view

`admin.service.js:29-37` — the admin index (`getAdminIndex`) only counts
pending _approval requests_. Pending domain approvals and any queue/worker
alert state (worker disconnected, queue paused, failed-job count elevated)
aren't surfaced there at all. An admin has to separately visit
`/admin/domains` and `/admin/server` to discover whether either needs
action — there's no single at-a-glance "what needs me right now" view.

**Fix direction:** extend the admin index to also show a pending
domain-approval count (mirroring the existing "Review Requests (N)" CTA) and
a compact alert when the worker is disconnected or the queue is paused.

**Resolved:** `getAdminOverview` now also counts `PENDING_ADMIN_APPROVAL`
domains; `index.ejs` shows that count as its own stat card + a "Domain Queue
(N)" primary CTA when non-zero, plus a "Needs attention" banner when the
worker is disconnected, the queue is paused, or there are failed jobs.

### 5. Projects list has no search

`projects.ejs:6-18` — only a status filter exists; there's no name/owner
text search, unlike the user list which has one. An admin must page through
a flat, paginated list to find a specific project by name.

**Fix direction:** add the same search input and backing regex query already
implemented for users (`admin.service.js:41-49`) to `getAdminProjects`.

**Resolved:** `getProjects` now accepts `search` and matches against
`name`/`slug` with the same escaped-regex approach `getUsers` uses;
`projects.ejs` got the matching search input, empty-state copy, and
pagination query-string carry-through.

### 6. Audit log actor shown only as a truncated ObjectId

`audit-events.ejs:90` renders `ev.actorId.toString().slice(-8)` — no name or
email resolution. Investigating "who did this" requires manually
cross-referencing the ID against the users list.

**Fix direction:** resolve `actorId` to a name/email in the query (a
`populate` or a batched lookup keyed by the page's distinct actor IDs),
matching how domain approvals and approval-requests already resolve their
related records to readable names.

**Resolved:** used a batched lookup rather than `.populate()` — audit events
are a historical log where the actor may no longer exist, and `.populate()`
would silently turn an orphaned reference into `null`, losing the raw ID.
`attachActorNames` in `audit-search.service.js` looks up the page's distinct
actor IDs, attaches `actorName` where resolvable, and leaves the raw
`actorId` intact as a fallback (shown truncated, as before) when it isn't.

### 7. Resume Queue has no confirmation

`server.ejs:145-148` — Pause Queue and both Maintenance toggles all have
`data-confirm`; Resume Queue does not. Lower risk than pausing, but
inconsistent with the "confirm every operationally significant action"
pattern the rest of the page follows.

**Fix direction:** add a `data-confirm` matching the existing style, even if
the warning copy is brief (e.g. "Resume the deployment queue?").

**Resolved:** added, matching the Pause Queue confirm exactly in structure
(title, accept label, pending label, `success` variant since resuming is the
lower-risk direction).

### 8. Flash messages don't name their target

`admin.controller.js:278,296,335,353` — `'User suspended.'`,
`'User reactivated.'`, `'Project suspended.'`, `'Project reactivated.'` are
generic; none interpolate the actual name/email/slug acted on. Contrast with
server-ops messages like _"Deployment queue paused. No new jobs will start
until resumed"_ which are already specific about consequence, just not about
target identity here.

**Fix direction:** interpolate the target's name/email/slug into each
message (the controller already has the record in hand at flash time).

**Resolved:** `suspendUser`, `reactivateUser`, `adminSuspendProjectWithStop`,
and `adminReactivateProject` now all return the acted-on record on success
(they already had it in scope internally); the controller interpolates
`firstName`/`lastName`/`name` into each flash message.

### 9. No Docker/MongoDB connectivity indicator on the server dashboard

The dashboard shows CPU/memory/disk/worker/queue, but Docker daemon and
MongoDB connectivity are only implicitly "up" if the page rendered at all —
there's no explicit status card for either, unlike the explicit "Ready" /
"Unavailable" badge already given to the deployment worker.

**Fix direction:** add explicit status checks/cards for Docker and MongoDB
connectivity, matching the existing worker-status card's badge style.

**Resolved (MongoDB only — Docker deliberately out of scope):** MongoDB gets
its own card (`mongoose.connection.readyState` plus a live `admin().ping()`),
matching the worker card's badge style exactly. Docker daemon connectivity
was **not** added: the web process has no Docker socket access by design
(the privilege-isolation work earlier in this project's history deliberately
separated `hellodeploy-web` from Docker/Nginx access). Checking Docker
status directly from web would mean reintroducing that access, which is a
worse trade than leaving this one indicator missing. The deployment-worker
card is the closest available proxy — if the worker is connected and
processing jobs, Docker is reachable from the worker's perspective.

### 10. Domain approval screen shows no DNS record detail

`domains.ejs` shows a "Verified" timestamp but not the actual DNS record
(e.g. the TXT record value) that was checked — an admin can't independently
verify the domain claim from this screen alone.

**Fix direction:** surface the actual verification record/value alongside
the "Verified" timestamp, if the domain-verification service already
retains it (needs checking at implementation time — this is the one item
that may require a data-model change, not just a template change, hence the
higher effort estimate).

**Resolved (deliberately not as originally proposed):** checked at
implementation time — the raw verification token is genuinely never
retained anywhere, only `verificationTokenHash` (a SHA-256 hash), matching
this codebase's consistent token-hashing convention (deploy-hook tokens,
password-reset codes). Storing the plaintext token just to display it later
would be a real security regression, so that path was rejected. Instead,
`getLiveVerificationTxtRecords` does a live DNS TXT lookup at
`_hellodeploy-verify.<hostname>` and shows whatever is currently published —
safe to display because DNS TXT records are public once published, unlike
the stored hash. This gives the admin independent, real-time corroborating
evidence without touching the secret at all.

## Tracking

All 10 items resolved 2026-08-13. Each shipped with a real fix, its own
focused test, and a clean lint/format pass — see [`WORKLOG.md`](../WORKLOG.md)
for the full record. `docs/PRIORITIES.md` Track D reflects this as complete;
nothing here is currently open.
