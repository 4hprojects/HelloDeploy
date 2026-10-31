# Implementation progress

Package: `docs/todo/HelloDeploy_Public_Content_Implementation_Package_2026-10-31 (1)/`. One PR per phase; the owner merges and autodeploy ships.

| PR  | Phase                                       | Status    | Branch / SHA     |
| --- | ------------------------------------------- | --------- | ---------------- |
| 1   | 0 audit + 1 legal/security                  | Deployed  | `280a9bd` (#170) |
| 2   | 2 product pages                             | Deployed  | `5bda4c0` (#173) |
| 3   | 3 docs and support                          | Deployed  | `5bda4c0` (#173) |
| 4   | 4 navigation, SEO, analytics readiness      | Deployed  | `9295462` (#174) |
| 5   | 5 donations (disabled) + account management | Deployed  | `7adfae2` (#175) |
| 6   | 6 governance + final QA                     | In review | #176             |

## PR 1

Files:

- `docs/implementation/*` (audit, inputs, drafts, decisions, progress, deployment report)
- `apps/web/src/views/pages/{terms,acceptable-use,service-limits}.ejs`, `apps/web/src/config/legal-policies.js`
- `apps/web/src/services/session-revocation.service.js` (moved from `admin.service.js`), `auth.service.js`, `admin.service.js`
- `apps/web/src/middleware/rate-limit.js`, `apps/web/src/routes/pages/auth.routes.js`
- Tests: `tests/auth/password-reset-authorization.test.js`, `tests/security/rate-limit.test.js`, `tests/ui/legal-pages.test.js`

Security notes: session revocation reuses the suspension code path, matching only `"id":"<user>"`, so the reset flow's own session (which stores `userId`) survives. A store error is logged and does not fail the reset, because the password has already changed.

## PR 2

Files:

- New `apps/web/src/views/pages/{about,features}.ejs`; reworked `pilot.ejs` and `premium.ejs`
- `apps/web/src/controllers/public.controller.js` (`getAbout`, `getFeatures`, plan defaults for pilot), `apps/web/src/app.js` (routes, `/pricing` 301)
- `apps/web/src/config/public-pages.js` (new metadata; `/premium` removed from the sitemap and now `noindex`)
- Operator line from `legalOperator`: `partials/footer.ejs`, `pages/index.ejs`
- Tests: new `tests/ui/public-pages.test.js`; `tests/browser/ui-ux.spec.js`

Decisions:

- No new CSS bundle. The pages reuse `public-hero`, `public-section`, `compatibility-grid`, `card` and `status-badge`, because `main.css` has no headroom and nothing new was needed.
- Feature statuses are Available, Limited, or Not available. "Planned" is not used, because no roadmap commitment exists for MFA, self-service deletion or databases.
- Limits on the features and pilot pages render from `getPlanDefaults()`, so they cannot drift from enforcement.
- `/pilot` keeps its URL for SEO equity; `/pricing` redirects to it.

## PR 3

Files:

- `apps/web/src/controllers/public.controller.js`: structured guides for domains, deploy hooks, rollback and troubleshooting; new `logs` and `stop-and-delete` topics; a longer FAQ; `getContact`
- `apps/web/src/config/public-pages.js`: new topics; each docs page's meta description comes from its summary; `/contact` metadata
- New `apps/web/src/views/pages/contact.ejs`; `/faq` → `/docs/faq` and `/help` → `/docs` (301) in `apps/web/src/app.js`
- Tests: `tests/ui/docs.test.js`, `tests/ui/public-pages.test.js`, `tests/browser/ui-ux.spec.js`

Decisions:

- Contact is email only, with no form. A form would need spam handling and storage of personal data, and email already reaches the same inbox.
- Every guide claim was checked against code: `PORT` is always injected (`apps/worker/src/deployment/container.js:265-270`), the Node.js 22 images (`dockerfile-generator.js:19-22`), deploy hooks are owner-only and rate-limited, and the TXT verification token is hashed (`domain.service.js:126`).
- The delete guide does not claim custom-domain routes are removed, because they are not (see the audit backlog).

## PR 4

Files:

- `apps/web/src/views/partials/header.ejs`: signed-out links are Features, How It Works, Docs, Blog, About, Sign In; Supported Apps and Status move to the footer
- `apps/web/src/views/partials/footer.ejs`, `apps/web/public/css/layout.css`: four groups (Platform, Resources, Company, Legal)
- `apps/web/src/app.js`: `X-Robots-Tag: noindex, nofollow` on `/dashboard`, `/projects`, `/admin`, `/auth`, `/account`, `/github`
- `apps/web/src/controllers/public.controller.js`: sitemap `lastmod` for policy pages from `LEGAL_POLICIES[].updated`
- `apps/web/src/config/public-pages.js`: Organization (4H Projects) + WebSite JSON-LD on `/`
- `apps/web/src/config/env.js`, `partials/head.ejs`, `docs/ENVIRONMENT.md`: optional `GOOGLE_SITE_VERIFICATION`, rendered on `/` only
- Tests: new `tests/ui/seo-navigation.test.js`; `tests/ui/header-nav.test.js`; regenerated screenshot baselines

Decisions:

- Consent banner, site-wide GA4 and the AdSense CSP fix are deferred, not built. Each needs `TODO_USER_INPUT_GA4_ID` plus a Cookie and Privacy Policy rewrite that adds analytics as an optional category, which is a legal change the owner has not authorized. Today both policies truthfully say no analytics cookies are set. Building unused consent code would only add JavaScript to every page.
- JSON-LD carries only the operator name, contact email and URLs: no logo, address or social profiles were supplied.

## PR 5

Files:

- New `/account` (`routes/pages/account.routes.js`, `controllers/account.controller.js`, `services/account.service.js`, `validators/account.validator.js`, `views/pages/account.ejs`): edit your name, change your password, see sign-in methods and GitHub App status, and request account closure. Sidebar link added.
- `packages/database` `User.closureRequestedAt`; admin user list and detail show "Closure requested".
- `services/session-revocation.service.js`: `exceptSessionId` keeps the browser that changed the password signed in.
- `services/admin.service.js` `suspendUser`: emails the reason and the appeal address.
- `packages/contracts` email kinds `account-closure-requested`, `account-suspended`.
- Donations: `config/donations.js` and `env.js` (`DONATIONS_ENABLED`, `PAYPAL_DONATE_URL`, `DONATION_GCASH_QR_PATH`, `DONATION_BANK_QR_PATH`), with a section on `/pilot` that renders only when enabled and a valid destination is set.
- Closure wording in the docs Delete and Disconnect guide and on `/contact`.
- Tests: new `tests/account/account-settings.test.js` and `tests/ui/donations.test.js`; `tests/contracts/email-content.test.js`; `/account` added to the signed-in axe and phone checks in `tests/browser/ui-ux.spec.js`; regenerated baselines.

Decisions:

- Closure only records a request. A Super Admin completes it with the existing `deleteUserPermanently`, so deletion semantics do not change (owner decision, 2026-10-31). The 30-day completion window is the one the Terms already promise.
- Re-authentication follows the ownership-transfer pattern: the current password, or for Google-only accounts a Google reconfirmation in the last 10 minutes. The password and closure posts share the sign-in rate limit.
- Email address changes stay manual by email. Self-service would need a verify-new-address flow, which is not built.
- Two-factor authentication is shown as "Not available yet", with no promised date.
- Donations stay off in production. No destination has been supplied (`TODO_USER_INPUT_PAYPAL_LINK`, `_GCASH_QR`, `_BANK_QR`, `_DONATIONS_APPROVAL`). The copy states that a donation changes no limits, priority or appeals, and is neither charity nor tax-deductible.

## PR 6

Files:

- New `docs/implementation/CONTENT_REGISTER.md`: owner, source of truth, review dates and status for each public page, plus a monthly smoke check and a quarterly review
- New `.github/pull_request_template.md`: checkboxes for public content, docs, policy and screenshot-baseline impact, and safety checks
- New `tests/ui/public-links.test.js`: renders every sitemap page and requests each internal link; currently 34 unique links, all resolving

## Handoff

Open owner inputs are in `USER_INPUT_REQUIRED.md`. Until they are supplied, these stay off or unpublished: donations, GA4 and the consent banner, AdSense, Search Console verification, the governing law and liability cap, and the GitHub App permission list on the Privacy Policy. Infrastructure gaps (open egress, possible root in owner images, no disk quota, no scheduled backups, custom-domain routes left after delete) are in the audit backlog and are described honestly on the public pages, not fixed.
