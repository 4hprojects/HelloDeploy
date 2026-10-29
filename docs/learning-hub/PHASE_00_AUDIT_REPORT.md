# Phase 0 — Repository Audit Report

Audited 2026-10-29 on `main` at `2b54d220344bcbaed94e08b8468480883651b3af` (branch
`feat/learning-hub` created from it). Read-only: no code, flags, or production state changed
during the audit.

Facts below cite the repository. Items marked **Assumption** or **Unavailable** were not
verified.

## Findings

| Capability                  | Evidence                                                                                                                                                                                       | Reuse or gap     | Risk                                                      | Recommendation                                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Route mounting              | `apps/web/src/app.js:167-213` (routers, inline public pages, 404 last)                                                                                                                         | Reuse            | Low                                                       | Mount a `/blog` router before the 404 handler.                                                                              |
| Public page handlers        | `apps/web/src/controllers/public.controller.js` (docs content is hardcoded JS)                                                                                                                 | Reuse pattern    | Low                                                       | New `blog.controller.js`; content from Markdown, not JS.                                                                    |
| Page metadata               | `apps/web/src/config/public-pages.js` `PUBLIC_PAGES`, `publicPageMetadata()`; `middleware/locals.js` sets `pageMetadata` by exact path, else `noindex,nofollow`                                | Extend           | Medium: blog paths would be `noindex` by default          | Controllers set `res.locals.pageMetadata` explicitly per article.                                                           |
| Head tags                   | `apps/web/src/views/partials/head.ejs:4-24`: description, robots, canonical, OG, Twitter; `og:type` always `website`                                                                           | Extend           | Low                                                       | Add `og:type` override, article times, JSON-LD slot.                                                                        |
| Sitemap / robots            | `public.controller.js` `getSitemap` (from `PUBLIC_PAGES`), `getRobots` hardcoded                                                                                                               | Extend           | Low                                                       | Append published articles and non-empty categories with `lastmod`.                                                          |
| CSP                         | `app.js:91-116`: nonce scripts, `challenges.cloudflare.com` already in script/connect/frame; `styleSrc 'self'`; `imgSrc 'self' data:`                                                          | Reuse            | Low                                                       | Turnstile needs no CSP change. GA4/AdSense would need additions; keep them out until enabled.                               |
| CSRF                        | `middleware/csrf.js`: session synchronizer, `_csrf` body or `x-csrf-token` header, `timingSafeEqual`                                                                                           | Reuse            | Low                                                       | Blog POSTs use the header from `<meta name="csrf-token">`.                                                                  |
| Session                     | `middleware/session.js`: connect-mongo, 24h TTL, `saveUninitialized:false`                                                                                                                     | Reuse            | Low                                                       | A guest gets a session once a CSRF token is generated (already true for every public page).                                 |
| Rate limiting               | `middleware/rate-limit.js`: Redis store `rl:<name>:`, `passOnStoreError:false`; production throws without Redis                                                                                | Reuse            | Low                                                       | Add comment, report, view and share limiters with the same factory.                                                         |
| Trust proxy                 | `app.js:55` `trust proxy 2`                                                                                                                                                                    | Reuse            | Low                                                       | `req.ip` is the real client; only use it inside short-lived hashed keys.                                                    |
| Turnstile                   | `services/turnstile.service.js`: checks `success` and `action`, **not hostname**; **returns true when no secret is configured** (always unset outside production, `config/env.js`)             | Gap              | **High if reused for comments**                           | Add a strict verifier that fails closed without a secret and checks hostname and action. Leave sign-in behaviour unchanged. |
| Env flags                   | `config/env.js` `optional(name,'false') === 'true'` pattern                                                                                                                                    | Reuse            | Low                                                       | Add `LEARNING_HUB_*` flags, default off.                                                                                    |
| DB-backed toggles           | `packages/database/src/models/platform-setting.model.js`; `services/platform-settings.service.js` (5s cache, audit event)                                                                      | Reuse            | Low                                                       | Comment emergency switch as a `PlatformSetting` key.                                                                        |
| Admin RBAC                  | `middleware/require-auth.js` `requireAdmin`, `requireSuperAdmin`; `routes/pages/admin.routes.js:57`                                                                                            | Reuse            | Low                                                       | Mount moderation pages under `/admin` (inherits auth).                                                                      |
| Audit trail                 | `packages/observability/src/audit.js` `writeAuditEvent` (never throws, redacts metadata)                                                                                                       | Reuse            | Low                                                       | Audit every moderation action and toggle.                                                                                   |
| Redis client                | `apps/web/src/queue/client.js` `getRedisConnection()` (null in tests; callers must check `status === 'ready'`)                                                                                 | Reuse            | Medium: a command on a disconnected client queues forever | Check readiness before every command; inject a fake in tests.                                                               |
| Models                      | `packages/database/src/models/product-event.model.js`; barrel `packages/database/src/index.js`                                                                                                 | Reuse            | Low                                                       | New additive collections only.                                                                                              |
| Migrations                  | None; index-verify script pattern `scripts/verify-product-event-indexes.js`                                                                                                                    | Gap (acceptable) | Low                                                       | New collections are additive; mongoose builds indexes on first use.                                                         |
| Markdown / YAML / sanitizer | None in `package-lock.json` (`js-yaml` only as an ESLint dev dependency)                                                                                                                       | Gap              | Medium                                                    | Add `markdown-it` and `yaml`; disable raw HTML.                                                                             |
| Analytics                   | No GA4, GTM, AdSense code. First-party `POST /telemetry/web-vitals` only                                                                                                                       | Gap              | Low                                                       | GA4 and AdSense partials gated off.                                                                                         |
| Public trust pages          | `/privacy`, `/terms`, `/cookies`, `/legal`, `/security`, `/acceptable-use` exist (`app.js:194-210`); **no `/about`, no `/contact`**                                                            | Gap              | Medium for AdSense review                                 | Owner must supply organisation and contact facts.                                                                           |
| Tests                       | `scripts/run-tests.js` (`node --test`); HTTP tests via `createApp()` + `listen(0)` + `fetch` (`tests/ui/error-page-before-locals.test.js`); EJS render tests (`tests/ui/how-it-works.test.js`) | Reuse            | Low                                                       | `tests/learning-hub/`.                                                                                                      |
| Browser tests               | `playwright.config.js`, `scripts/browser-fixture-server.js`, baselines `tests/browser/__screenshots__/`                                                                                        | Reuse            | Medium: header change alters `landing-1440.png`           | Regenerate baselines with `visual-baselines.yml`.                                                                           |
| CI                          | `.github/workflows/ci.yml`: lint, format, assets, config check, coverage tests, Playwright, Lighthouse, `npm audit`                                                                            | Reuse            | Low                                                       | Add `content:check`.                                                                                                        |
| Deployment                  | `scripts/autodeploy.js` (timer, green `ci.yml` on `main`), `infrastructure/upgrade.sh` (mongodump backup, drain, verify, automatic rollback)                                                   | Reuse            | Medium: red main CI freezes autodeploy                    | Merge only with green CI; verify with `npm run production:check`.                                                           |

## Route collision matrix

| Path                    | Existing owner | Collision                                                                                                        |
| ----------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/blog`, `/blog/*`      | none           | No. `blog` is a reserved **subdomain** (`packages/contracts/src/subdomains.js:99`), which does not affect paths. |
| `/blog/category/:slug`  | new            | Article slugs `category`, `api`, `author`, `page`, `search` are reserved by the content validator.               |
| `/blog/api/*`           | new            | JSON endpoints for views, shares, comments, reports.                                                             |
| `/admin/learning-hub`   | admin router   | No existing route of that name.                                                                                  |
| `/docs`, `/docs/:topic` | public docs    | Separate.                                                                                                        |

## Data model implications

Additive collections: `article_stats` (view and share counters by immutable article id),
`article_comments`, `article_comment_reports`. One new `platform_settings` key. No existing
collection changes, no backfill. Rollback leaves the collections in place, unused.

## Dependency decision

- `markdown-it` with `html:false` and `linkify:false`, plus a link validator allowing only
  `http`, `https`, `mailto` and relative URLs. Maintained, CommonJS/ESM compatible, no native
  code.
- `yaml` for front matter, with a small `---` splitter. `gray-matter` was rejected because it
  pins the old `js-yaml` 3.
- No HTML sanitizer: raw HTML input is disabled, and tests assert that dangerous input is
  escaped.

## Privacy and AdSense gap matrix

| Item                                                  | State               | Owner action                                                   |
| ----------------------------------------------------- | ------------------- | -------------------------------------------------------------- |
| Privacy policy covers blog views, comments, Turnstile | Not yet             | Updated in Phase 6 to describe what is actually built.         |
| Consent mechanism for analytics/ads                   | **None exists**     | Needed before GA4 or ads.                                      |
| GA4 measurement id                                    | None                | Owner provides when wanted.                                    |
| Contextual moderation provider                        | **None configured** | Owner chooses and approves a provider (blocks guest comments). |
| AdSense account / site approval                       | Unknown             | Owner. Ads stay off.                                           |
| About page, contact page                              | Missing             | Owner supplies truthful facts.                                 |
| `ads.txt`                                             | Absent              | Only with a real approved publisher id.                        |

## Unavailable or not measured

- HelloRun, HelloUniversity and HelloPera article code: not inspected (separate repositories).
- Production CPU, RAM and response-time baseline: not measured in this audit. Host snapshot
  only: 7.3 GB RAM with about 2 GB available, 791 GB disk free (2026-10-29).
- Live production route checks: deferred to Phase 8.

## Estimates

Agent effort roughly matches the package estimate (72–127 developer-hours equivalent). Token
use is estimated at 400–700K across all phases; this is an estimate, not a measurement. The
largest uncertainty is Phase 7 fact-checking.

## Revised sequencing and blockers

Sequence unchanged: 1 content → 2 UI → 3 views/sharing → 4 comments core → 5 moderation →
6 SEO/analytics/ads → 7 articles → 8 release.

Expected blockers, none of which stop the blog itself:

- No moderation provider is configured or approved, so guest comments ship disabled.
- No consent mechanism and no GA4 id, so analytics ships disabled.
- No AdSense approval, so ad slots ship disabled.
