# Implementation progress

Package: `docs/todo/HelloDeploy_Public_Content_Implementation_Package_2026-10-31 (1)/`. One PR per phase; the owner merges and autodeploy ships.

| PR  | Phase                                       | Status      | Branch / SHA                 |
| --- | ------------------------------------------- | ----------- | ---------------------------- |
| 1   | 0 audit + 1 legal/security                  | In review   | `feat/public-content-phase1` |
| 2   | 2 product pages                             | Not started | —                            |
| 3   | 3 docs and support                          | Not started | —                            |
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
