# Full-System Analysis

Updated: 2026-08-13

## Purpose

A platform-wide pass against the stated goal — **user friendliness, full
functionality, intuitivity** — covering what the three prior persona audits
didn't: the ongoing/steady-state experience of a project owner who already
has a live project, whether any advertised functionality is actually
incomplete or broken anywhere in the reachable app, and whether the platform
holds together as one consistent product (accessibility, responsiveness,
form-validation patterns, design system). Companion to
[`docs/ADMIN_UX_AUDIT.md`](ADMIN_UX_AUDIT.md) and
[`docs/GUEST_EXPERIENCE_AUDIT.md`](GUEST_EXPERIENCE_AUDIT.md). The backlog
this produced lives in [`PRIORITIES.md`](PRIORITIES.md) under Track F — this
file is the evidence behind that list.

## What's already strong

- **Steady-state project management** — settings (jargon-light, well-
  organized accordion sections), environment variables (values always
  masked, explicit reveal action, a clear AES-256-GCM security notice),
  custom domains, and maintenance mode are all intuitive and functionally
  complete. No dead links; every nav link and route resolves to a real
  handler (`apps/web/src/routes/pages/project.routes.js`).
- **Custom domains is the best UX found anywhere in the app** — a 4-step
  numbered progress tracker (Add domain → Add DNS record → Check ownership →
  Domain goes live), copy-to-clipboard buttons for the TXT record,
  provider-specific guidance (_"If your nameservers are Cloudflare, edit DNS
  in Cloudflare even when you purchased the domain from GoDaddy"_), and a
  timing expectation (_"DNS changes commonly take 1-30 minutes"_).
- **No genuinely broken or half-wired functionality exists in the reachable
  app.** `grep -rn "TODO\|FIXME\|HACK" apps/ packages/` (excluding tests)
  returns zero results. No stub routes (`501`, "Coming soon"), no dead nav
  links. The only real "not done" work is explicitly tracked, labeled future
  roadmap — Phase 18 (dashboard alerts, deployments-list auto-refresh, a11y
  polish — `docs/phases/README.md`, status "Planned") and P3-P6
  (`docs/PROJECT_STATUS_REVIEW.md`, real multi-runtime deployment validation
  and beyond, 0% started) — both already covered by Track A/C in
  `PRIORITIES.md` and **not duplicated into this pass's backlog**.
- **Cross-cutting systems are genuinely, deeply built, not superficial.** 21
  real `@media` rules across the CSS with a consistent breakpoint vocabulary
  (`30rem`/`48rem`/`64rem` repeated ~15 times); a complete mobile drawer
  pattern (backdrop, Escape-close, focus trap via `inert`, body scroll
  lock); a full pre-paint dark-mode implementation with `localStorage`
  persistence and `prefers-reduced-motion`/`forced-colors` support; **zero
  raw `window.confirm()` calls anywhere** — all 18 destructive/state-
  changing actions route through one shared accessible confirm-modal
  component. This is the strongest evidence the app is one deliberately
  engineered product, not a patchwork of pages built at different times.

## Gaps found

### F1. Environment variables page doesn't clarify redeploy behavior

Editing or adding a secret does **not** trigger a redeploy — the owner must
manually deploy again for the change to reach the live app. Nowhere on
`environment.ejs` is this stated either way. A non-technical owner could
reasonably assume the live app updates immediately after saving.

**Fix direction:** add a short, clear note near the save action — e.g. "Changes
take effect on your next deployment" — matching the page's existing clear
security-notice style.

**Resolved:** added to the always-visible Security Notice card (rather than
only the empty-state hint, which disappears once secrets exist): _"Adding,
editing, or deleting a secret does not update your live app. Deploy again
from the Deployments page for the change to take effect,"_ linking directly
to the deployments page.

### F2. Members page never explains role differences

The invite flow and Owner/Maintainer/Viewer role dropdown work end-to-end
(`members.ejs`), but no tooltip, hint text, or link anywhere on the page
explains what each role actually permits — despite these roles gating
actions throughout the rest of the app (deploy, suspend, settings, etc.). An
owner inviting a collaborator has to guess.

**Fix direction:** add brief inline copy or a tooltip per role option (e.g.
"Maintainer: can deploy and manage settings. Viewer: read-only access.").

**Resolved (with corrected role descriptions):** verified actual permissions
directly against `project.routes.js`'s `ownerOnly`/`ownerOrMaintainer`/`anyRole`
gates before writing copy — Maintainer can deploy and roll back but
**cannot** manage settings (settings/secrets/members/domains are all
`ownerOnly`), so the fix direction's example copy above would have been
inaccurate. Added a one-line legend at the top of the page (Owner: full
control; Maintainer: can deploy and roll back, not settings/secrets/
members/domains; Viewer: read-only) plus a short hint under the role
dropdown in the invite form.

### F3. Domain-add form skips the app's own validation pattern

Every other create/add form in the app — project name (`projects/new.ejs`),
environment variable add/bulk-import (`environment.ejs`), quota override
(`admin/quota.ejs`) — uses the shared `partials/form-errors.ejs` pattern:
top-of-page error summary plus per-field `form-input--error` /
`aria-describedby` messages. The domain-add form
(`apps/web/src/views/pages/projects/domains.ejs:193-204`) has none of this —
a rejected/invalid domain has no client-facing field error at all (only a
static paragraph tied to an _admin's_ rejection reason, unrelated to
submission validation).

**Fix direction:** wire the existing `form-errors` partial and
`form-input--error` convention into the domain-add form, matching how the
other three forms already do it — no new pattern to invent, just apply the
existing one consistently.

**Resolved:** `postAddDomain` (`domain.controller.js`) now re-renders the
domains page with `errors.hostname`/`values.hostname` on failure instead of
a flash-and-redirect; `domains.ejs`'s Add Domain form now includes the
`form-errors` partial and per-field error/hint switching, matching
`environment.ejs`'s Add Secret form exactly.

### F4. Rollback UI uses unexplained internal jargon

The rollback confirm dialog and deployment-source dropdown
(`deployments.ejs`) refer to "retained healthy deployments." An owner can't
tell from the UI why some older releases aren't selectable, since the
retention window (last 3 healthy releases) is never explained.

**Fix direction:** reword the confirm copy in plain language and add a short
note near the rollback dropdown explaining that only the most recent
healthy releases stay available to roll back to.

**Resolved:** confirm dialog now reads _"Switch live traffic to the
selected previous version?"_; the button tooltip and a new note above the
dropdown both explain in plain language that only the most recent healthy
releases stay available, older ones are cleaned up automatically.

### F5. Legacy `APPROVAL_REQUIRED` mode is a dead end

`settings.ejs:332-334` shows projects still on the deprecated
`APPROVAL_REQUIRED` deployment mode a message: _"Approval Required is no
longer supported. Choose Manual or Automatic."_ No explanation is given for
why the mode was removed, and the dropdown only ever offers Manual/Automatic
— the owner is just told to pick something else with no context.

**Fix direction:** add one sentence explaining why (e.g. superseded by the
project-level admin approval workflow) so the change doesn't read as an
unexplained regression.

**Resolved:** no definitive historical record of the exact removal reason
was found (`WORKLOG.md` confirms deployments are blocked while a project
stays in this mode, but not why the mode itself was retired), so the copy
was grounded in what's verifiably true today instead: the one-time
project-level approval gate before a project first goes live serves the
same purpose. New copy: _"Approval Required is no longer supported as a
per-deployment mode — the one-time project approval before your project
first goes live now covers this. Choose Manual (you trigger each deploy) or
Automatic (deploys after production-branch changes)."_

### F6. Doc-bookkeeping inconsistency (not a functional issue)

`docs/IMPROVEMENTS.md` marks "Navigation drift" `[x]` Fixed, attributed to
Phase 18, while `docs/phases/README.md` lists Phase 18's overall status as
"Planned." The nav fix genuinely shipped early — verified current
`sidebar.ejs` is fully wired to real routes — the docs just don't
distinguish the shipped piece from the rest of the still-planned phase
(dashboard alerts, list auto-refresh, a11y polish).

**Fix direction:** correct the `IMPROVEMENTS.md` entry to note it shipped
ahead of the rest of Phase 18, so the phase's overall "Planned" status in
`docs/phases/README.md` isn't contradicted.

**Resolved:** corrected. Also worth noting, found while verifying this
item: `IMPROVEMENTS.md`'s **U5** entry (Phase 18, still `[ ]` open) describes
two things — the `webhook.controller.js:193` high-risk-file-change TODO
(fixed in the earlier Track B pass this session, via the `reviewFlag`
banner + owner email) _and_ a broader, still-open gap at
`webhook.controller.js:314`: unexpected handler errors after the webhook's
fast `200` response are only logged, with no user-facing signal for _any_
other kind of failed push-triggered deploy. Only the first half is done —
U5's checkbox correctly remains unchecked. Not fixed here; flagging for
whoever picks up Phase 18, since conflating the two in one checkbox item
could cause it to be marked done prematurely.

## Cross-referenced, not duplicated

- **Phase 18** (`docs/phases/README.md`) — dashboard alerts, deployments-
  list auto-refresh, remaining a11y polish. Already tracked, status
  "Planned."
- **P3-P6** (`docs/PROJECT_STATUS_REVIEW.md`, `PRIORITIES.md` Track A/C) —
  real multi-runtime deployment validation, HelloUniversity cutover, multi-project
  proof, formal production GO. Already tracked, 0% started.

## Tracking

All 6 items resolved 2026-08-13. Each was render-checked via direct EJS
compilation and verified against the relevant test suites (151 tests across
`tests/ui`, `tests/domain`, `tests/deployment/rollback-flow.test.js`, and
`tests/security/domain-validation.test.js`, all passing), plus a clean
full-repo `npm run lint` and `npm run format:check`. See
[`WORKLOG.md`](../WORKLOG.md) for the full record. `docs/PRIORITIES.md`
Track F reflects this as complete.
