# Implementation progress

Package: `docs/todo/HelloDeploy_Public_Content_Implementation_Package_2026-10-31 (1)/`. One PR per phase; the owner merges and autodeploy ships.

| PR  | Phase                                       | Status      | Branch / SHA                 |
| --- | ------------------------------------------- | ----------- | ---------------------------- |
| 1   | 0 audit + 1 legal/security                  | In review   | `feat/public-content-phase1` |
| 2   | 2 product pages                             | In review   | `feat/public-content-phase2` |
| 3   | 3 docs and support                          | In review   | `feat/public-content-phase3` |
| 4   | 4 navigation, SEO, analytics readiness      | Not started | —                            |
| 5   | 5 donations (disabled) + account management | Not started | —                            |
| 6   | 6 governance + final QA                     | Not started | —                            |

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
