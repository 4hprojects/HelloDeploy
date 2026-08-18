# Guest Experience Audit

Updated: 2026-08-13

## Purpose

A full analysis of what a first-time GUEST (unauthenticated visitor, no prior
context) learns about HelloDeploy before signing up, and whether it's
accurate. Companion to the earlier onboarding UX audit (which produced the
deployment-failure plain-language translation,
`packages/contracts/src/failure-codes.js`) and the admin UX audit
(`docs/ADMIN_UX_AUDIT.md`). The backlog this audit produced lives in
[`PRIORITIES.md`](PRIORITIES.md) under Track E — this file is the evidence
behind that list.

The entire unauthenticated surface is: `/` (landing), `/auth/sign-in`,
`/auth/create-account`, `/auth/verify-email`, `/auth/forgot-password` +
steps, and 9 legal/policy pages (`/legal`, `/terms`, `/privacy`, `/cookies`,
`/acceptable-use`, `/service-limits`, `/data-processing`, `/copyright`,
`/security`). No docs, pricing, or about page exists outside that list.

## What's already good

- The landing page (`apps/web/src/views/pages/index.ejs`) correctly conveys
  the product _category_ in one screen: headline _"Deploy web apps from
  GitHub in minutes,"_ six accurate one-line feature cards (GitHub
  integration, live logs, encrypted secrets, custom domains, team access,
  audit log), two clear CTAs.
- The mechanism is genuinely well-conveyed at a high level: _"Connect any
  repository. Push to your production branch and HelloDeploy builds and
  deploys automatically."_
- Legal/policy coverage is thorough and legitimate (9 separate pages), linked
  from the footer on every page.
- `docs/USER_GUIDE.md`'s _"What HelloDeploy Does"_ section is the single best
  piece of guest-relevant copy anywhere in the project — accurate and
  mechanism-complete — it just never reaches an actual site visitor, since
  it's a repo markdown file, not a served page.

## Gaps found (all resolved 2026-08-13)

### G1. Terms of Service made a false claim about signup

`terms.ejs:15` stated: _"The platform is currently invitation-only during
the pilot phase; account creation requires approval from the platform
administrator."_ Verified directly against code — no invite or
approval-gating mechanism exists anywhere. `auth.service.js`'s `registerUser`
creates every signup as `UserStatus.PENDING_VERIFICATION` and flips it
straight to `ACTIVE` on email verification (`auth.service.js:101`); the
`UserStatus` enum (`enums.js:23-28`) has no admin-approval state at all
(unlike `Domain`, which genuinely has `PENDING_ADMIN_APPROVAL`). Anyone who
fills out `/auth/create-account` and verifies their email gets an account.

**Resolved:** per the user's explicit choice (fix the copy, not build new
gating — smallest, safest change during an active pilot), corrected
`terms.ejs:15` to describe actual behavior: open signup, required email
verification, and a note that eligibility may change since the platform is
in an active pilot.

### G2 / G6. Landing page omits the instance/operator/pilot context that Terms discloses

`index.ejs`'s hero subtitle said only _"HelloDeploy is a self-hosted
platform... with zero vendor lock-in"_ — true of the _software_, but a guest
signing up on hellodeploy.online isn't self-hosting anything; they're
requesting an account on one specific shared instance. `terms.ejs:9`
discloses the real facts: _"a free, self-hosted... service operated by
Henson Sagorsor as part of an MIT capstone project... a shared server
environment."_ None of that — operator identity, pilot status, shared-server
nature — appeared anywhere a guest would see it before deciding to sign up.

**Resolved:** added one honest caption under the hero CTA buttons:
_"Free to use. This instance is an active pilot operated by Henson Sagorsor
as an MIT capstone project, running on shared infrastructure — see the Terms
for details. Features and availability may change."_ Combines G2
(instance/operator context) and G6 (pilot status) in a single addition,
since they're the same "make this visible near the hero" fix.

### G3. No pricing information anywhere on the public site

"Free" appeared only buried inside Terms.

**Resolved:** folded into the same hero caption as G2/G6 ("Free to use...").

### G4. No supported-runtime/framework list visible to guests

Only existed in `docs/USER_GUIDE.md:13-21`, a repo file never served as a
web page.

**Resolved:** added a "What you can deploy" card at the bottom of the
landing page, reusing `docs/USER_GUIDE.md`'s exact supported list (static
sites, Node.js, Express, React static builds, Vue static builds, constrained
Next.js) plus a condensed, accurate note on what isn't yet supported
(Python, PHP, Java, Docker Compose, arbitrary/privileged containers) — no
new claims invented, just made the existing accurate copy visible where
guests actually look.

### G5. No "how it works" walkthrough or product preview

Only six one-line feature cards; no step-by-step mechanism explanation, no
screenshot.

**Resolved:** added a 4-card "How it works" section between the hero and the
feature grid (Connect → Configure → Deploy → Live), reusing the existing
`feature-grid`/`card` styling so it's visually consistent with the rest of
the page — no new CSS needed. A full product screenshot/demo was not added
(out of scope for a copy-accuracy pass; would need real screenshots of a
live deployment, which is a separate content-creation task, not a code fix).

## Tracking

All 6 items resolved 2026-08-13. Each was render-checked via direct EJS
compilation, cross-checked against its source of truth
(`docs/USER_GUIDE.md`, `terms.ejs`) so nothing new is asserted that isn't
already true and documented elsewhere, and verified against the existing
`tests/ui/icon-consistency.test.js` (which asserts on landing-page icon
usage) plus a full `tests/ui/*.test.js` sweep (119/119 passing). See
[`WORKLOG.md`](../WORKLOG.md) for the full record. `docs/PRIORITIES.md`
Track E reflects this as complete.
