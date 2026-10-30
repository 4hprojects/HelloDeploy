# HelloDeploy public content audit

Date: 2026-10-31. Scope: the Public Content Improvement Package (`docs/todo/HelloDeploy_Public_Content_Implementation_Package_2026-10-31 (1)/`), Phase 0.

Method: read-only review of the repository at `main` (`6bb1c0f`) plus anonymous requests to https://hellodeploy.online. No credentials were read or printed. "Repo" means the code says it; "Prod" means it was observed on the live site.

Status values: **verified** (in code and observed or tested), **partial** (exists with gaps), **planned** (documented intent only), **absent**.

## 1. Capability matrix

### Public pages and content

| Capability             | Status   | Code evidence                                                           | Prod verification | Risk                                                                                   | Action                             | Priority |
| ---------------------- | -------- | ----------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------- | ---------------------------------- | -------- |
| Home page              | verified | `apps/web/src/views/pages/index.ejs`                                    | 200               | Operator line names a person (`index.ejs:39`)                                          | Use `legalOperator`                | P1       |
| How It Works           | verified | `app.js:199`, `pages/how-it-works.ejs`                                  | 200               | —                                                                                      | Link from nav                      | P2       |
| Docs hub + 11 topics   | partial  | `controllers/public.controller.js:7-262`, `config/public-pages.js:1-73` | 200               | 6 topics are 2–3 bullets; one generic meta description for all (`public-pages.js:100`) | Expand topics, unique descriptions | P2       |
| Supported Applications | verified | `pages/supported-apps.ejs`                                              | 200               | Contradicted by `service-limits.ejs:103`                                               | Align wording                      | P1       |
| Pilot and Pricing      | verified | `pages/pilot.ejs`                                                       | 200               | —                                                                                      | Becomes Pricing target             | P2       |
| Premium                | partial  | `pages/premium.ejs`                                                     | 200, in sitemap   | "Coming soon: unlimited deployments" reads as a pricing promise                        | Remove promise, drop from sitemap  | P1       |
| Status                 | verified | `pages/status.ejs`                                                      | 200               | —                                                                                      | —                                  | —        |
| Blog (Learning Hub)    | verified | `routes/pages/blog.routes.js`                                           | 200               | —                                                                                      | —                                  | —        |
| About                  | absent   | —                                                                       | 404               | —                                                                                      | Build                              | P2       |
| Features               | absent   | nav uses `/#product` anchor                                             | —                 | —                                                                                      | Build with status badges           | P2       |
| Pricing URL            | absent   | `/pilot` covers it                                                      | 404               | —                                                                                      | 301 to `/pilot`                    | P2       |
| Contact                | absent   | —                                                                       | 404               | Only policy-page emails                                                                | Build email-only page              | P2       |
| FAQ / Help URLs        | absent   | only `/docs/faq`                                                        | 404               | —                                                                                      | 301s                               | P3       |

### Legal pages (`apps/web/src/views/pages/`, config `apps/web/src/config/legal-policies.js`)

| Capability                                        | Status   | Evidence                                                 | Risk                                                                                                                           | Action                                                                  | Priority |
| ------------------------------------------------- | -------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- | -------- |
| Terms                                             | partial  | 17 sections                                              | Licence covered clone/build only (`terms.ejs:58`); governing law unnamed (`:86`); liability has no cap (`:80`); no appeal path | Licence + appeal added (PR 1); law and cap drafted in `LEGAL_DRAFTS.md` | P1       |
| Privacy                                           | verified | 15 sections, retention table `privacy.ejs:106-124`       | GitHub App permissions not listed: they live in the App settings on GitHub, not in code                                        | Owner input `TODO_USER_INPUT_GITHUB_APP_PERMISSIONS`                    | P2       |
| Acceptable Use                                    | partial  | 7 sections                                               | No adult-content rule; spam only implied; "suspended without notice" (`:43`); no appeal                                        | Fixed in PR 1                                                           | P1       |
| Cookies                                           | verified | one cookie `hellodeploy.sid`; prod sets only that cookie | Must change before any analytics                                                                                               | Conditional rows in PR 4                                                | P2       |
| Service Limits                                    | verified | numbers match `packages/database/src/quota.js:5-15`      | Runtime list was out of date                                                                                                   | Fixed in PR 1                                                           | P1       |
| Security, Data Processing, Copyright, Legal index | verified | —                                                        | —                                                                                                                              | —                                                                       | —        |
| Counsel review                                    | absent   | `docs/LEGAL_POLICIES.md:5,135` calls them drafts         | Legal exposure                                                                                                                 | Owner gate                                                              | P1       |

### Accounts and authentication

| Capability                                        | Status   | Code evidence                                         | Risk                                                                         | Action                                                                   | Priority |
| ------------------------------------------------- | -------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| Email + password (Argon2id)                       | verified | `packages/auth/src/password.js:6`                     | —                                                                            | —                                                                        | —        |
| Google sign-in (OIDC, `openid email profile`)     | verified | `services/google-auth.service.js:10,61-64`            | —                                                                            | —                                                                        | —        |
| Email verification (24 h token)                   | verified | `services/auth.service.js:15,64-77`                   | —                                                                            | —                                                                        | —        |
| Password reset (3 steps)                          | partial  | `auth.service.js:309-470`                             | Other sessions survived a reset; steps 2–3 had no IP limiter                 | Fixed in PR 1                                                            | P1       |
| Sessions (Mongo, 24 h rolling, `hellodeploy.sid`) | verified | `middleware/session.js:6-74`                          | Status cached in session; suspension relies on revoking sessions             | —                                                                        | —        |
| CSRF                                              | verified | `middleware/csrf.js:16-69`                            | —                                                                            | —                                                                        | —        |
| Rate limits + account lockout                     | verified | `middleware/rate-limit.js`, `auth.service.js:198-222` | —                                                                            | —                                                                        | —        |
| Turnstile                                         | partial  | `services/turnstile.service.js:15-17`                 | Fails open when the secret is unset; widget observed live on `/auth/sign-in` | Owner confirms secret set (`TODO_USER_INPUT_TURNSTILE_SECRET_CONFIRMED`) | P2       |
| Account settings page                             | absent   | no `/account` route                                   | Users cannot change name/password                                            | PR 5                                                                     | P2       |
| Self-service account closure                      | absent   | Super Admin only, `services/admin.service.js:528-600` | Rights requests by email only                                                | Request flow, PR 5                                                       | P2       |
| Data export                                       | absent   | per-project audit export only                         | DPA portability by email only                                                | Document; planned                                                        | P3       |
| MFA / suspicious-login alerts                     | absent   | —                                                     | —                                                                            | Mark Planned                                                             | P3       |

### GitHub, deployments, isolation

| Capability                                            | Status   | Code evidence                                                                       | Risk                                                                                                                          | Action                                 | Priority   |
| ----------------------------------------------------- | -------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------- |
| GitHub App, tokens minted per use, never stored       | verified | `services/github.service.js:218-248`, `apps/worker/src/git/clone.js:110-130`        | —                                                                                                                             | —                                      | —          |
| Repo disconnect per project                           | verified | `controllers/github.controller.js:505-545`                                          | —                                                                                                                             | Document in docs                       | P2         |
| Account-level GitHub disconnect                       | absent   | uninstall webhook only marks repos `REVOKED` (`webhook.controller.js:324-335`)      | `githubInstallationId` stays set                                                                                              | Explain on `/account`                  | P3         |
| Project delete with teardown                          | partial  | `services/project.service.js:532-607`, `apps/worker/src/jobs/delete-project.job.js` | Leaves Repository, ProjectInvitation, custom-domain nginx routes and Cloudflare hostnames                                     | Document honestly; fix separately      | P2         |
| Archive                                               | partial  | `project.service.js:499-524`                                                        | Does not stop the container                                                                                                   | Document                               | P3         |
| Quotas enforced                                       | verified | `services/quota.service.js`, `deployment.service.js:267`                            | No disk quota                                                                                                                 | Do not publish a disk limit            | P2         |
| Container hardening                                   | partial  | `apps/worker/src/deployment/container.js:222-282`                                   | Outbound network open; owner Dockerfile/image may run as root; no disk limit; secrets visible to `docker inspect` on the host | Mitigate before wider untrusted access | P1 (infra) |
| Secrets AES-256-GCM, owner-only reveal, log redaction | verified | `packages/security/src/encryption.js`, `apps/worker/src/deployment/log-capture.js`  | Project secret values not masked in general log capture                                                                       | Fix separately                         | P2         |
| Admin RBAC, audit-logged actions                      | verified | `routes/pages/admin.routes.js`, `admin.service.js`                                  | Suspension succeeds even if the queue is offline (`:961`)                                                                     | Fix separately                         | P3         |
| Suspension notice / appeal                            | partial  | sign-in error only (`auth.service.js:254`)                                          | No email, no appeal                                                                                                           | Appeal text PR 1; email PR 5           | P1         |

### Data retention and backups

| Item                                                     | Status   | Evidence                                               |
| -------------------------------------------------------- | -------- | ------------------------------------------------------ |
| Sessions 24 h                                            | verified | `middleware/session.js:60-62`                          |
| Deployment logs 30 days                                  | verified | `deployment-event.model.js:23`                         |
| Audit events 90 days                                     | verified | `audit-event.model.js:90-91`                           |
| Product events 90 days                                   | verified | `product-event.model.js:43`                            |
| Deployment, Notification, Repository, Invitation records | no TTL   | kept until project/account deletion or indefinitely    |
| Backups before upgrade (`mongodump`)                     | verified | `infrastructure/upgrade.sh:118-127`, `backup.sh:54-97` |
| Scheduled backups                                        | absent   | only autodeploy units in `infrastructure/systemd/`     |

### SEO, analytics, ads, payments

| Capability                                 | Status   | Evidence                                                                                        | Action                                      |
| ------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Per-page title/description/canonical/og    | verified | `partials/head.ejs`, `config/public-pages.js:171-183`                                           | Unique descriptions                         |
| Default `noindex` for private pages (meta) | verified | `middleware/locals.js:22-44`                                                                    | Add `X-Robots-Tag` header                   |
| robots.txt / sitemap.xml                   | verified | `public.controller.js:329-353`                                                                  | Add `lastmod` for policies, drop `/premium` |
| JSON-LD                                    | partial  | blog only                                                                                       | Organization + WebSite on `/`               |
| GA4                                        | partial  | blog only, needs `GA4_MEASUREMENT_ID` + `LEARNING_HUB_ANALYTICS_CONSENT_READY`; not set in prod | Consent banner + Consent Mode, stays off    |
| Consent banner                             | absent   | —                                                                                               | PR 4                                        |
| Search Console verification                | absent   | —                                                                                               | Optional meta tag                           |
| AdSense                                    | partial  | gated, but CSP lacks `pagead2.googlesyndication.com` (`app.js:111-116`)                         | Fix CSP when configured; stays off          |
| Donations / payments                       | absent   | no strings in `apps/web/src`                                                                    | Disabled scaffold PR 5                      |

### Governance

| Item                         | Status | Evidence                                |
| ---------------------------- | ------ | --------------------------------------- |
| PR template                  | absent | `.github/` has only `workflows/`        |
| Link checker                 | absent | —                                       |
| Content owner / review dates | absent | `docs/LEGAL_POLICIES.md` has dates only |

## 2. Repository vs production-only facts

Production-only (observed, not provable from the repo): Turnstile widget present on `/auth/sign-in`; only the `hellodeploy.sid` cookie is set; GA4, AdSense and Search Console are not present in page HTML; MongoDB is on Atlas, Redis is local.

Needs the owner (cannot be verified by the agent): GitHub App permission list, Turnstile secret, legal operator registration status, backup schedule on the host.

## 3. Dependency map

1. Legal factual fixes (PR 1) → product pages cite them (PR 2) → docs cite both (PR 3).
2. Navigation and footer (PR 4) need the PR 2 and PR 3 routes to exist.
3. Analytics (PR 4) needs the consent banner and conditional Cookie/Privacy text before any ID is set.
4. Donations (PR 5) need owner-verified payment destinations before enabling.
5. Account closure requests (PR 5) depend on the existing Super Admin deletion path.
6. Link checker (PR 6) covers everything above.

## 4. Remediation backlog (outside this package's text work)

- P1 infra: block or limit container egress; force non-root for owner-supplied images; disk quota. Required before opening to wider untrusted use.
- P2: project delete should remove custom-domain routes, Cloudflare hostnames, Repository and Invitation records.
- P2: mask project secret values in captured deploy logs.
- P2: scheduled database backups.
- P3: suspension should fail when the stop job cannot be queued.
