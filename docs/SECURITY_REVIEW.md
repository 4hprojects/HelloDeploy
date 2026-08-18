# Security Review — Session-Scoped Code

Updated: 2026-08-13

## Purpose

A dedicated OWASP-style security review of every file added or changed
during this session's four prior analysis passes (onboarding UX, admin UX,
guest experience, full-system) — roughly 90 files. Those passes verified
functionality (tests, render checks) but none had a security-focused
review. This pass fills that gap. Scope is strictly the session's diff, not
a full audit of the pre-existing codebase (that ground was already covered
by the Track B security/code-quality backlog earlier this session).

A second, smaller pass (see **Track G — Session/Auth Changes** below) later
covered the Track G onboarding-handoff fixes (auto-login after email
verification, the resend-verification rate-limit handler), which landed
after this review's original scope was closed out.

## Methodology

Three `security-reviewer` subagents ran in parallel, one per attack-surface
grouping, each given the exact file list, the specific nature of each
change, and the codebase's established conventions (EJS `<%= %>`
auto-escapes by default; `escapeNotificationHtml` is the email-escaping
helper; `redactObject` + a 10,000-character cap guard audit-event
metadata). Every finding claim was then independently spot-checked against
the actual source — not taken on the reviewing agent's word — before being
recorded here.

## Result: no exploitable issues found

All three groups came back clean.

### Group 1 — Crypto, secrets, config validation

Reviewed: `packages/security/src/encryption.js` (master-key rotation),
`scripts/rotate-master-key.js` (migration script), `packages/contracts/
src/env-validation.js` (all-zero-key production tripwire), `apps/worker/
src/deployment/secrets.js` (decrypt audit event), `packages/database/src/
models/audit-event.model.js` (metadata size cap).

- Key selection is per-call; IV is freshly randomized per `encrypt()` call
  regardless of rotation version — no IV/key reuse introduced.
- `decrypt()` uses the next key for version-2 records during rotation, then falls
  back to the promoted primary key after `HELLODEPLOY_MASTER_KEY_NEXT` is unset.
  Startup validation rejects malformed, placeholder, or identical next keys. The
  promotion path is covered by encryption and database-backed rotation tests.
- `rotate-master-key.js`'s Mongo queries use hardcoded constants and
  `_id` values from its own cursor — no injection surface. Confirmed
  CLI-only, not reachable from any route.
- Audit metadata added around secret decryption is `{ secretCount }`
  only — no secret names or values reach the audit log.
- **Forward-looking note, not a finding against this diff:** the new
  metadata-size validator (`audit-event.model.js`) calls
  `JSON.stringify(value).length` before comparing to the 10,000-character
  cap — verified this ordering directly (the stringify always runs, the
  check happens after). Every current caller passes small, fixed-shape
  metadata, so this isn't exploitable today, but a future caller passing
  unbounded user-controlled metadata could pay real CPU/memory cost before
  rejection. Worth keeping in mind if a new `writeAuditEvent` call site
  ever takes metadata from user input directly.

### Group 2 — Web input handling, authz, output encoding

Reviewed: `domain.controller.js` (re-render-with-errors path),
`admin.controller.js` (flash-message interpolation, quota-scope
resolution), `webhook.controller.js` (`reviewFlag`/email trigger),
`admin.routes.js` (`SUPER_ADMIN` gating), `email.service.js`
(`sendProjectPausedEmail`), `domain.service.js` (live DNS TXT lookup),
`admin.service.js`/`audit-search.service.js` (name-resolution lookups),
and the EJS views rendering all of the above.

- Every new piece of dynamic content — the domain-add form's echoed
  `hostname`, flash-message names, resolved quota-scope names, resolved
  audit actor names, and (notably) the **attacker-controllable live DNS
  TXT record content** shown on the admin domain-approval screen — is
  rendered through EJS's auto-escaping `<%= %>`, never the unescaped
  `<%-`. Verified directly against `domains.ejs`, `quota.ejs`,
  `audit-events.ejs`, and the flash-banner partial.
- No NoSQL injection: the new `$in` array in `attachActorNames` is built
  from already-stored `AuditEvent.actorId` values, not raw request input.
- `GET /admin/quotas/:scopeType/:scopeId` requires only `requireAdmin`
  (verified at `admin.routes.js:68`), while the mutating `POST` correctly
  requires `requireSuperAdmin` (`admin.routes.js:70`). This isn't a new
  disclosure — a plain ADMIN can already see the same user emails via
  `/admin/users`.
- `requireSuperAdmin` gating (queue pause/resume, maintenance mode, quota
  overrides) matches each action's actual blast radius — verified neither
  over- nor under-restrictive against the routes it protects.
- `projectUrl` in the new paused-project email is built entirely from
  server-side config (`env.PLATFORM_DOMAIN`, `project.slug`) — no open
  redirect or SSRF surface.

### Group 3 — Worker changes and client JS

Reviewed: `pipeline.js` (post-swap try/catch + audit event),
`route-manager.js` (restore-failure audit event), `delete-project.job.js`/
`stop-project.job.js`/`cleanup-releases.job.js`, `deployment-notification.js`
(plain-language failure copy in email), `apps/web/public/js/app.js`
(confirm-modal per-button attribute override).

- `pruneDanglingImages()` (`build.js`) spawns `docker image prune --force`
  with a fully static argument array — no shell, no interpolation, no
  injection surface.
- Every new `writeAuditEvent` call in this group routes through the same
  Mongoose `Mixed` field with `redactObject` + the 10,000-character cap
  (Group 1) — no raw log-injection or secret-leakage path.
- `failureCode` values reaching the new email copy are always one of a
  fixed internal enum set by worker code (verified via grep across every
  `failureCode:` assignment site) — never user-supplied text — and the
  final HTML is still passed through `escapeNotificationHtml`.
- `app.js`'s new `attrSource`/`submitter` parameter is always the native
  `SubmitEvent.submitter` DOM element (browser-supplied, not
  attacker-forgeable), and every `data-confirm*` attribute value in the
  templates that use it is emitted via `<%=` — verified directly against
  `members.ejs`, `users.ejs`, and `projects.ejs` (all use `<%=`, none use
  `<%-`), so even a user-controlled name (e.g. a project name) can't break
  out of the attribute.

## Track G — Session/Auth Changes

Updated: 2026-08-13

A follow-up, narrower review of the code that shipped as part of
[Track G](PRIORITIES.md) (the onboarding-handoff backlog: auto-login
after email verification, the resend-verification rate-limit redirect,
and a copy-only reset-code expiry note). This code postdates the review
above, so it wasn't covered by it. Scope: `auth.controller.js`'s
`getVerifyEmail`, `auth.service.js`'s `verifyEmail`, `rate-limit.js`'s new
`onResendVerificationLimitReached` handler, and the two touched EJS
templates.

One `security-reviewer` pass was enough — unlike the ~90-file review
above, this diff is small and logically contained to a single auth flow
plus one rate-limit handler, not several unrelated attack surfaces.

**Result: clean, no exploitable issues.** Every claim below was
independently re-checked against the actual source, not taken on the
reviewing agent's word.

- **Session fixation** — `req.session.regenerate()` is called
  (`auth.controller.js:178`) and `req.session.user` is assigned only
  inside the success callback, after regenerate succeeds — the identical
  shape `postSignIn` already uses. A `regenerate()` error falls through to
  a plain `res.redirect('/auth/sign-in')` with no session mutation. No
  path can bind the new session identity to a pre-verification session ID.
- **Open redirect** — `redirectByRole` only ever returns one of two
  hardcoded strings (`/admin` or `/dashboard`); no request input reaches
  it. The rate-limit redirect target (`rate-limit.js:76`) is the literal
  string `'/auth/verify-email?rateLimited=1'`, not built from `req` at
  all.
- **Rate-limit integrity** — only the `handler` option changed for
  `resendVerificationLimiter`; `windowMs`, `limit: 3`, and the Redis store
  are untouched. The handler fires purely on per-IP request count, before
  any email lookup happens, and `resendVerificationEmail()` was already
  silent on unknown emails — so the new redirect-vs-JSON branching adds no
  enumeration signal.
- **Information disclosure** — `verifyEmail()` now returns
  `user.toSessionUser()` instead of the raw user doc.
  `toSessionUser()` (`packages/database/src/models/user.model.js:116-126`)
  returns only `{ id, firstName, lastName, email, platformRole, status,
configVersion }`; `passwordHash`, `emailVerificationTokenHash`, and
  `passwordResetTokenHash` are all schema-level `select: false`
  (`user.model.js:33,58,69`) — confirmed directly, not assumed.
- **XSS** — the new `rateLimited` branch in `verify-email.ejs` (lines
  31-37) is 100% static markup with zero `<%=`/`<%-` interpolation. The
  `verify-reset-code.ejs` change is a static string literal appended to
  existing hint copy.
- Route wiring confirmed: `resendVerificationLimiter` is still applied to
  `POST /verify-email/resend` (`auth.routes.js:18`), so the new handler is
  actually reachable on the intended path.

## Scope note

This review covers what this session changed — it is not a full
re-audit of the pre-existing application. That broader security posture
was already covered by the Track B backlog pass earlier this session (see
`WORKLOG.md`), which resolved or verified 20 pre-existing security/
code-quality items.

## Tracking

No backlog created for either pass above — both came back clean. The
first pass left one forward-looking note (above) for future callers of
the audit-metadata validator, not an actionable item today. See
`WORKLOG.md` for the full record of both passes.
