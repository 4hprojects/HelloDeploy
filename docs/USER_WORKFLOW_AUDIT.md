# User Workflow Audit

Updated: 2026-09-22

## Read this first: fixes in this repository are not fixes for users

`docs/PRIORITIES.md` records that on 2026-08-14 two direct live checks confirmed neither Track E's
landing-page "How it works" section nor Track D's admin pending-approvals banner were present on
hellodeploy.online. The root cause is that there is no proven mechanism to ship HelloDeploy's own
code to its own host: `RELEASE_POLICY.md` is explicitly unenforced, and `infrastructure/upgrade.sh`
has since been exercised but only through a chain of failures and corrections.

**Every finding in this document, and in the five audits before it, is provisional until the
release path works.** A usability fix that never reaches production is indistinguishable from one
that was never made. That is a release problem, not a UX problem, and it is tracked as TB-141 — but
it sets the value of everything below.

One piece of that has since closed: a running process can now report its own release on the admin
server dashboard (TB-082), so "is the fix live?" is answerable without filesystem access.

## Purpose

This audit follows a single person end to end — landing page to a deployed application on a custom
domain — and asks whether they can get there without being confused, blocked, or left waiting
without knowing what for. It complements the existing audits rather than repeating them:
[Admin UX](ADMIN_UX_AUDIT.md) covers the administrator, [Guest Experience](GUEST_EXPERIENCE_AUDIT.md)
the pre-signup surface, [System Analysis](SYSTEM_ANALYSIS.md) platform-wide usability, and
[Onboarding Handoff](ONBOARDING_HANDOFF_AUDIT.md) the signup-to-first-login seam. All four are
closed; their resolved findings are listed in
[Task Backlog](TASK_BACKLOG.md) Appendix C and are not re-derived here.

Surface covered: `/`, account creation, email verification, sign-in, dashboard, project creation,
the approval gate, repository connection (both paths), detection and build configuration,
environment secrets, first deployment, deployment failure, and custom domains.

The resulting backlog lives in [Task Backlog](TASK_BACKLOG.md); this file is the evidence behind it.

## The journey, measured

Minimum happy path: **8 pages, roughly 14 clicks, 2 emails, and 2 waits on an administrator** — a
third if the GitHub repository is organisation-owned and the install needs an owner's approval.

The two administrator waits are the defining characteristic of this product's workflow. Neither
sends a notification.

## What's already strong

Worth stating so it is not "improved" away.

- **Failure translation is the best-executed layer in the product.** A worker stamps a
  `failureCode`; `getFailureCopy` (`packages/contracts/src/failure-codes.js:115-117`) maps it to
  plain language with a next action, the view renders that and demotes the raw code and Docker
  output into a collapsed "Technical details — For the person who built the app, or for support"
  disclosure (`views/pages/projects/deployment-detail.ejs:151-171`), and the same copy is reused in
  the outcome email. `SECRET_DECRYPTION_FAILED` becomes "HelloDeploy couldn't unlock one of your
  app's stored secrets (like a password or API key)."
- **Detection is written for the person who owns the app, not the person who wrote it.** The page
  is "Check App Setup", the button is "Check my app", the health check field is "Page used to
  confirm the app is working", and the advanced section says "HelloDeploy filled these in for you.
  Only change them when the person who built the app gives you different values"
  (`views/pages/projects/detection.ejs:147-156`).
- **Custom domain DNS instructions are unusually good** — a 4-step tracker, a Type/Host/Value/TTL
  table with copy buttons, the Cloudflare-versus-registrar nameserver trap named explicitly, and a
  warning about the double-suffix mistake (`views/pages/projects/domains.ejs:84-128`).
- **Guided empty states exist on every page a new user meets first** — dashboard, projects,
  detection, environment, deployments, domains, and three separate ones on the repository page for
  GitHub-unavailable, not-installed, and no-authorised-repos.
- **Verification now signs the person in** rather than bouncing them to a login form
  (`controllers/auth.controller.js`), and the public-repository path reaches a connected repo in
  three clicks with no external redirects.

## Gaps, in priority order

### W1. Signup could strand a new user permanently

`registerUser` created the account row and then awaited `sendVerificationEmail` unguarded, while
`sendEmail` throws on any provider error. The account existed, the request died with a generic 500,
and every retry hit the duplicate-email branch — which deliberately returns `null` and reports
success. The person was told to check an inbox nothing had been sent to, forever, with no route out
except guessing that a resend form existed at a URL they had never seen.

This is the worst possible placement for a dead end: it is the first thing a new user does, and it
is invisible to the operator because the failure looks like a successful signup.

**Fix direction:** guard the send, keep the account, and tell the person the truth — the account
exists, the fault is ours, here is resend. Preserve the anti-enumeration behaviour for addresses we
cannot confirm, which `ONBOARDING_HANDOFF_AUDIT.md:29-33` records as deliberate.

**Resolved 2026-09-22:** guarded; a known delivery failure renders a distinct page state, resend is
guarded identically and no longer claims success after a failure, and the sender is injectable so
the regression is testable — three of the new tests fail without the guard.

### W2. Deep links were silently downgraded at sign-in

`requireAuth` redirects an unauthenticated deep link to `/auth/sign-in?returnTo=…`
(`middleware/require-auth.js:9-10`) and the view has carried a hidden `returnTo` field all along —
but `getSignIn` never passed it to the template, so it was always empty and every deep link landed
on `/dashboard`. A shared link to a specific deployment never worked.

**Fix direction:** pass it through, keep it across a failed attempt, and accept only relative paths.

**Resolved 2026-09-22.**

### W3. A suspended account was signed out with no explanation

`require-auth.js:15` destroys the session and redirects with `?reason=account_suspended`. Nothing
read that parameter. The person was ejected mid-session with a bare login form and no way to learn
why or who to ask.

**Fix direction:** render the reason, and point at the administrator.

**Resolved 2026-09-22.**

### W4. Neither approval decision notifies the owner

`reviewApprovalRequest` (`services/admin.service.js`) and `approveDomain` / `rejectDomain`
(`services/domain.service.js`) write audit events and send nothing. Confirmed by grep: there is no
email call in either service. The product's two mandatory waits both end in silence, so the only way
to discover the outcome is to keep reloading the project page.

This is the single largest workflow gap. The email infrastructure already exists and already sends
verification, password reset, password changed, project paused, and deployment outcome — approval is
the conspicuous omission. It compounds with the fact that neither wait has a stated SLA.

**Fix direction:** reuse `email.service.js` for four events — project approved, changes requested,
domain approved, domain rejected. The deployment-outcome email
(`apps/worker/src/notification/deployment-notification.js`) is the closest existing model, including
its respect for `notificationPreference`.

### W5. Editing anything while pending silently voids the submission

`isApprovalSnapshotCurrent` invalidates a pending request when `configurationVersion` or the commit
SHA moves. The administrator's Approve button then disables with "Approval is blocked until the
owner checks and resubmits". Meanwhile the owner's own page still says **"Waiting for administrator
review… No further action is needed right now"** (`services/project-overview.service.js:217-230`).

Nothing is locked, so a reasonable person fills the wait by tidying their settings — and thereby
sends themselves to the back of a queue they cannot see, while being told to sit still.

**Fix direction:** detect the stale snapshot on the owner's side and change the pending panel to say
the submission needs resubmitting and why. The comparison already exists; only the owner-facing
branch is missing.

### W6. The approval gate is invisible until after signup

The landing page's four-step story is Connect → Configure → Deploy → Live
(`views/pages/index.ejs:23-52`). The dashboard's empty state lists three steps. Neither mentions
that a human must approve the project before it can ever deploy. The gate first appears as milestone
three on the project page, after the person has created an account, verified an email, made a
project, and connected a repository.

Quotas are equally unannounced — one owned project by default.

`GUEST_EXPERIENCE_AUDIT.md:55-58` records a deliberate decision not to build signup gating during
the pilot. This finding is narrower: not gating, just honesty about a gate that already exists.

**Fix direction:** one sentence in the landing-page "How it works" section and one in the dashboard
empty state. Reuse the wording already in `project-overview.service.js`.

### W7. No support route exists, while failure copy repeatedly points at one

Nine of the twenty entries in `failure-codes.js` end with some form of "contact support if this
keeps happening", and `domains.ejs:263` says "Contact an administrator if this status does not
change". There is no support link, email address, help page, or contact route anywhere in the
authenticated shell — `views/partials/sidebar.ejs` has Dashboard, Projects and Sign Out, and the
footer carries only policy pages.

Every one of those messages terminates in a instruction the product cannot fulfil.

**Fix direction:** either add a configurable operator-contact address surfaced in the sidebar and
interpolated into that copy, or change the copy to name what the person can actually do. The former
is better for a self-hosted product where the operator differs per instance.

### W8. Reconnecting a repository silently discards detection

Both `postConnectRepository` and `connectPublicRepository` reset `runtimeType` to `null` and
detection to `NOT_RUN`. That is defensible — a different repository means different code — but it
is unannounced, and `successful_detection` plus `current_detection` are two of the eight blockers on
submitting for review. An owner who reconnects to correct a branch silently destroys a passing check
and is bounced back a step with no explanation of what changed.

**Fix direction:** warn before reconnecting when a successful detection exists, reusing the existing
confirm-modal pattern — the same mechanism already used for the AUTOMATIC-to-MANUAL downgrade on the
public-repository path.

### W9. Custom domain setup never explains how to point the domain at the server

The TXT record instructions are excellent, but a TXT record only proves ownership. Nothing on
`domains.ejs` tells the person to create the CNAME or A record that actually routes traffic. A user
can complete every visible step, get "Connected and ready for visitors", and have a domain that
does not resolve.

This is the largest documentation gap in the product, and it is invisible until the very end.

**Fix direction:** add the routing record alongside the verification record. The value depends on
the instance's ingress, so it needs to come from configuration rather than be hardcoded.

### W10. The project slug becomes a public hostname and is never shown

`createProject` takes one field, the name, and derives the slug server-side — lowercased,
non-alphanumerics collapsed to hyphens, truncated to 50 characters, with a random hex suffix on
collision. That slug becomes `platformSubdomain` and therefore the public address. The form says a
slug will be generated but never shows what it will be, and it cannot be changed afterwards.

"My Client's Site (v2)" silently becomes `my-client-s-site-v2` as a public hostname.

**Fix direction:** show the derived slug live beneath the name field, and say plainly that it will
be the web address. Editing it is a larger change; showing it is not.

### W11. Secrets are absent from the guided path

The setup milestones are source → check → approval → live
(`services/project-overview.service.js:89-118`). Environment secrets appear nowhere in that
sequence, and detection does not inspect which variables the application reads. A first-time owner
can follow every prompt the product gives them and have their first deployment crash on a missing
variable, surfacing much later as `CONTAINER_CRASHED_ON_STARTUP`.

**Fix direction:** add an optional secrets milestone between check and approval. It cannot be a
blocker, since many applications need none, but it should be visible.

### W12. The resend form neither shows nor prefills the address

On the post-signup page the resend form renders with `value: ''` and the page never states which
address the link went to. Someone who mistyped their address cannot tell — they see the same "check
your inbox" as everyone else, and retyping it correctly resends to a different account that does not
exist. There is no email-change flow anywhere, so a typo at signup is unrecoverable.

The sign-in page's verification banner does prefill, which shows the pattern is available.

**Fix direction:** show the address that was used and prefill the field, carrying it in the session
the way the domain verification token already is.

### W13. The project overview shows a raw error where the detail page shows plain language

`project-overview.service.js:349-367` renders `latestDeployment.failureSummary` — the raw Docker or
Node error string — while the deployment detail page renders `getFailureCopy(...).message` for the
same failure. The overview is the page a non-technical owner lands on first, so they meet the raw
string and the friendly translation exists one click away.

**Fix direction:** call `getFailureCopy` in the overview service. The translation layer is already
built; this one call site was missed.

## Cross-referenced, not duplicated

Found during this audit but already tracked elsewhere; not counted as new findings.

- Raw enum copy leaking to users (`triggerType`, `deploymentMode`) — TB-122 / U3.
- Deployments list not auto-refreshing — TB-121 / U2.
- "● Live" indicator has no accessible name — TB-123 / U4.
- Webhook-triggered failures invisible to owners — TB-124 / U5.
- No account self-service of any kind — TB-126.
- No runtime application logs — TB-127.
- Real browser and assistive-technology testing absent; `tests/ui/` asserts on template source
  rather than behaviour — TB-125.
- `APPROVAL_REQUIRED` legacy dead end — `SYSTEM_ANALYSIS.md:132`, F5 resolved with explanatory copy.
- An application that dies after release still reads HEALTHY — TB-150 in `RENDER_COMPARISON.md`.

## Deliberately not raised

- **An onboarding wizard.** `TASK_BACKLOG.md:296` records this as out of scope by design.
- **Signup gating or approval queues for accounts.** Decided against during the pilot
  (`GUEST_EXPERIENCE_AUDIT.md:55-58`).
- **Duplicate-email signup reporting success.** A deliberate anti-enumeration tradeoff
  (`ONBOARDING_HANDOFF_AUDIT.md:29-33`).
- **Decorative redesign.** `UI_UX_IMPROVEMENT_BACKLOG.md:5` constrains UX work to stay operational
  and task-focused rather than marketing-styled.

## Tracking

W1, W2 and W3 resolved 2026-09-22. W4 through W13 are open and belong in
[Task Backlog](TASK_BACKLOG.md) Phase 5.

Verification for the resolved items: 404 focused tests across `tests/auth`, `tests/security` and
`tests/ui` pass; lint and formatting clean. The W1 regression test was confirmed to fail without its
fix. See [Worklog](../WORKLOG.md).
