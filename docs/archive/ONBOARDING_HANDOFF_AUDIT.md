# Guest-to-User Onboarding Handoff Audit

Updated: 2026-08-13

## Purpose

A focused pass on the one seam the prior audits didn't cover: the actual
account-creation mechanics between the already-audited guest landing page
([Guest Experience Audit](GUEST_EXPERIENCE_AUDIT.md)) and the already-audited
post-login deploy funnel ([System Analysis](SYSTEM_ANALYSIS.md)) — signup,
email verification, first login, and password reset. Two parallel research
passes covered this independently: one traced the signup form and
verification code paths, the other traced the first-login handoff and
password reset UX. Both converged on the same top finding from different
angles. The backlog this produced lives in [`PRIORITIES.md`](PRIORITIES.md)
under Track G — this file is the evidence behind that list.

## What's already strong

- **The signup form** (`apps/web/src/views/pages/auth/create-account.ejs`)
  gives field-level inline errors on validation failure, not just a flash
  message, and preserves already-typed name/email values on re-render
  (`auth.controller.js:84-97`). A live password-requirements checklist
  (`partials/password-requirements.ejs`, wired up in
  `apps/web/public/js/app.js`) shows pass/fail per rule in real time as the
  user types — discovered before submission, not after a rejected attempt.
  The honeypot field and Turnstile check are unobtrusive.
- **Duplicate-email signup is handled correctly, not just incompletely.**
  `registerUser` (`auth.service.js`) silently returns without creating a
  second account when the email already exists, and the controller always
  redirects to the same "check your email" verify page regardless
  (`auth.controller.js:120-130`) — a deliberate anti-enumeration tradeoff,
  not a bug. **This is intentionally not in the backlog below.**
- **The expired/invalid verification link isn't a dead end.** If a token is
  missing, expired, or already used, `verify-email.ejs` shows the error
  inline and offers a resend form right there (lines 31-51), not just an
  error page with no next step.
- **The very first authenticated screen a brand-new user sees is
  well-built.** `dashboard.controller.js` (lines 4-10) and `dashboard.ejs`
  (lines 4-22) render a personalized greeting, a "No projects yet" empty
  state, a 3-step mini-guide, and a prominent "Create Project" CTA — not an
  empty or confusing screen. Sign-in redirects there in one hop via
  `redirectByRole` (`auth.controller.js:65-70`).
- **Password reset is a clear 3-step flow** (forgot-password →
  verify-reset-code → new-password) with a visible "Didn't receive a code?
  Request a new one" link at every step
  (`verify-reset-code.ejs:30-33`) and the same anti-enumeration pattern as
  signup (`postForgotPassword` always proceeds to step 2 regardless of
  whether the email exists, `auth.controller.js:281`).

## Gaps found

### H1. No auto-login after email verification

`getVerifyEmail` (`auth.controller.js:135-171`) calls `verifyEmail()`,
which activates the account, then does nothing but
`req.flash('success', ...)` and `res.redirect('/auth/sign-in')`
(lines 169-170) — `req.session.user` is never set. The user, who already
typed their password twice during signup (create-account + confirm
fields), now has to type it a third time immediately after clicking a link
that already proved they own both the email and the account. This is the
single highest-friction point in the journey, and it lands at the most
fragile moment: right after the account first becomes usable, before the
user has any investment in coming back if they bounce.

Independently identified by both research passes.

**Fix direction:** establish a session immediately on successful
verification, reusing the exact session-fixation-safe pattern
`postSignIn` already uses — `req.session.regenerate()` before setting
`req.session.user`, then `req.session.save()` before redirecting
(`auth.controller.js:234-247`) — not a shortcut that sets
`req.session.user` directly. Requires `verifyEmail()` in `auth.service.js`
to return the same `sessionUser` shape `signIn()` already returns, so
`getVerifyEmail` can build the session the same way `postSignIn` does.
Redirect target becomes `redirectByRole(sessionUser.platformRole)` instead
of `/auth/sign-in`, with the welcome flash message carried through to the
dashboard.

**Resolved:** `verifyEmail()` now returns `{ success: true, sessionUser }`
(via `user.toSessionUser()`, the same shape `signIn()` returns) and sets
`lastLoginAt`, since establishing a session here is functionally a sign-in.
`getVerifyEmail` regenerates the session before setting `req.session.user`
— the identical fixation-safe sequence `postSignIn` uses — then redirects
to `redirectByRole(sessionUser.platformRole)` with the welcome flash
carried through. A `regenerate()` failure (session store outage) falls
back to a plain redirect to sign-in rather than touching a possibly-broken
session further. Verified with `tests/auth/verify-email-session.test.js`
(6 tests: session shape, `lastLoginAt`, invalid-token rejection, the
dashboard redirect, fixation-order, and the unauthenticated-on-failure
path) and confirmed the existing `tests/security/session-fixation.test.js`
source-order check still passes unmodified.

### H2. Resend-verification rate limit is a full-page dead end

`resendVerificationLimiter` (`rate-limit.js:106-114`) shares the generic
`onLimitReached` handler (lines 57-70) used by every other limiter in the
file — tripping it renders a standalone `pages/error` page ("Too many
requests. Please wait a moment and try again.") instead of staying on
`verify-email.ejs`. A user who's already anxiously waiting on a
verification email and hits resend 4 times in an hour gets yanked off the
page they need, with no link back.

**Fix direction:** give `resendVerificationLimiter` its own `handler` that
redirects back to `/auth/verify-email?resent=1` (or a new
`?rateLimited=1` query flag rendering an inline message on the same page)
instead of the shared full-page handler — scoped to this one limiter, not
a change to `onLimitReached` itself, since the other limiters' full-page
behavior is appropriate for routes without an obvious "back to where I
was" page.

**Resolved:** added `onResendVerificationLimitReached` alongside the
existing shared `onLimitReached` in `rate-limit.js`, scoped to
`resendVerificationLimiter` only — every other limiter keeps the generic
full-page handler unchanged. It redirects browser requests to
`/auth/verify-email?rateLimited=1` (JSON API requests still get the same
`429`/`RATE_LIMITED` body as before). `verify-email.ejs` gained a
`rateLimited` branch showing an inline error alert with a link back to
sign-in, instead of leaving the page. Verified with 3 new tests in
`tests/security/rate-limit.test.js` (redirect behavior, JSON parity for
API clients, and a source check confirming the limiter is wired to the
new handler) — all 13 tests in that file pass, including the pre-existing
`passOnStoreError` count check (unaffected, no new limiter was added).

### H3. Reset-code step doesn't repeat the 1-hour expiry on-page

`sendPasswordResetEmail` (`email.service.js`) states the code expires in
1 hour, but `verify-reset-code.ejs` never repeats that on the page itself
— only the subtitle says "We sent a 6-digit code to your email address."
A user who doesn't read the email closely has no on-page warning the code
will time out.

**Fix direction:** add the expiry to the existing `hint` text already
passed to `partials/form-field` for the code input
(`verify-reset-code.ejs:21`, currently "Enter the 6-digit code from your
email.") — one line, no new component.

**Resolved:** hint text now reads "Enter the 6-digit code from your email.
It expires in 1 hour." — matches `RESET_TOKEN_TTL_MS` in `auth.service.js`.

## Tracking

All 3 items resolved 2026-08-13. Verified with the two new/updated test
files above (19 tests total), a clean full-repo `npm run lint`, and a
clean `npm run format:check`. `docs/PRIORITIES.md` Track G reflects this
as complete. Nothing touched the live production host.
