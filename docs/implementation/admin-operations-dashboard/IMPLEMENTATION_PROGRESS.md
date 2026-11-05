# Admin Operations Dashboard: Implementation Progress

Package: `docs/implementation/admin-operations-dashboard/` (`00`–`11`). Each phase ships as its own PR; the owner merges it and autodeploy releases it.

| Phase | Scope                                                    | Status  | Branch / PR               |
| ----- | -------------------------------------------------------- | ------- | ------------------------- |
| 0     | Audit and reconciliation                                 | Done    | `feat/admin-ops-p0-audit` |
| 1     | Full-width overview and settings foundation              | Done    | `feat/admin-ops-p1-ui`    |
| 2     | Trusted collection, snapshot, host and container metrics | Pending |                           |
| 3     | App health, queue, services, builder, SSE                | Pending |                           |
| 4     | History, alerts, incident lifecycle                      | Pending |                           |
| 5     | Capacity and attention                                   | Pending |                           |
| 6     | Validation, performance, docs, rollout                   | Pending |                           |

## Phase 0: Audit

1. **Completed.**
   - Source audit, recorded in `PHASE_0_AUDIT_REPORT.md`.
   - Runtime baseline taken on the production host.
   - Package moved from `docs/todo/` to `docs/implementation/`, as the package README directs.
2. **Changed files.** This folder only. No code changed.
3. **Decisions.** See audit §7 and §9.
   - The collector runs in the worker and publishes a sanitized snapshot to Redis.
   - All schema changes are additive.
   - Platform policy changes require SUPER_ADMIN.
   - Backup evidence shows Unknown, because reading it needs owner approval.
4. **Tests executed.** None, since Phase 0 changes no code. Ran `npm run lint` and `npm run format:check`; results are under "Phase 0 checks" below.
5. **Results.** See "Phase 0 checks".
6. **Screenshots.** Not applicable.
7. **Performance.** Baseline is in audit §6. Key figures:
   - `docker stats --no-stream` takes 2.25 s wall time and 0.055 s CPU.
   - Web RSS is 102 MiB; worker RSS is 64 MiB.
   - Swap in use: 2132 MiB.
8. **Security.** No change.
9. **Outstanding.** Backup evidence: reading backup manifests needs an owner decision.
10. **Next.** Phase 1.

### Phase 0 checks

- `npm run lint`: 0 errors, 1 warning. The warning predates this work and is in a file this PR does not touch.
- `npm run format:check`: all matched files pass.

## Phase 1: UI and settings foundation

1. **Completed**
   - `/admin` is rebuilt as a full-width operations overview with these parts:
     - sticky header with a Live, Degraded, Stale or Offline badge, last update time, refresh mode, a Refresh button and a Settings link
     - incident strip
     - six compact KPI cards
     - a 12-column container-query grid holding the trends, capacity, applications, deployments, services, attention and activity panels
   - The page refreshes in place from panel fragments served by `GET /admin/overview/live?panels=…`. There is no full reload.
     - Polling cadence is set per panel group.
     - Polling pauses while the tab is hidden; when the tab becomes visible again, every panel is fetched.
     - After failures, requests back off.
     - A panel that holds keyboard focus is not replaced.
     - The page shows Stale or Offline when data stops arriving.
     - The page detects an expired session.
   - Settings live at `/admin/overview/settings`. Personal preferences cover density, visible panels, refresh interval, history range, table rows and sidebar collapse. The platform-wide monitoring policy covers:
     - collection intervals
     - optional collectors
     - capacity reserves
     - thresholds, recovery level and sustained duration
     - memory pressure
     - probe counts
     - notification mute
     - retention
     - fixed safeguards
   - Each settings form has a "Restore defaults" action.
   - The sidebar can be collapsed on every admin page. The state is saved per administrator and rendered on the server, so the page does not flash.
   - Panels without a trusted source yet (CPU, network, application health, trends, capacity, incidents) say Unavailable or Unknown. They never show 0 or Healthy.
2. **Changed files**
   - New:
     - `packages/contracts/src/monitoring.js`
     - `apps/web/src/services/admin-ops/{overview,dashboard-preferences,monitoring-policy}.service.js` and `format.js`
     - `apps/web/src/controllers/admin-ops.controller.js`
     - `apps/web/src/views/pages/admin/{index,overview-settings}.ejs` and `views/partials/admin-ops/*`
     - `apps/web/public/{css,js}/admin-{shell,ops}.{css,js}`
     - `tests/admin-ops/*`, `tests/browser/admin-ops.spec.js`
   - Modified:
     - `packages/database/src/models/user.model.js`: optional `dashboardPreferences`
     - `admin.routes.js`, `admin.controller.js`: old index handler removed
     - `layouts/main.ejs`, `partials/head.ejs`: shell assets and layout modifier
     - `partials/sidebar.ejs`: collapse toggle
     - the asset build, verify and budget scripts, and `utils/assets.js`
     - `tests/browser/ui-ux.spec.js`: heading renamed
3. **Decisions**
   - Panels are rendered on the server from one EJS partial per panel. The page render and the live refresh share these partials, so the client only swaps HTML. This keeps `js/admin-ops.js` at about 7 KB, and there is a single rendering path.
   - Platform policy edits need `SUPER_ADMIN`, the same lever class as maintenance, queue and builder control. Each save carries a `revision` used for optimistic concurrency. A stale save is refused, and the refusal is audited (`FAILURE`, `revision_conflict`).
   - The stored policy is re-normalized on every read. A corrupt stored rule falls back to its defaults; it is never used as stored.
   - Theme stays on the existing localStorage toggle. A server copy would create two sources of truth.
   - The shell and dashboard assets are separate bundles, so `js/app.js` and `css/main.css` are untouched; both have only about 100 bytes of headroom.
4. **Tests executed**
   - `node --test tests/admin-ops/monitoring-contract.test.js`
   - `node --test tests/admin-ops/settings-routes.test.js`
   - `npm test`
   - `npx playwright test tests/browser/admin-ops.spec.js`
   - `npx playwright test`
   - `npm run lint`, `format:check`, `config:check`, `assets:build`, `assets:verify`, `assets:budget`
5. **Results**
   - `npm test`: 2938 tests, 2938 passed, 0 failed (3m02s).
   - Contract tests: 23/23 passed.
   - Route tests: 15/15 passed. They cover:
     - USER is refused with 403
     - ADMIN cannot save the platform policy (403)
     - a missing CSRF token gets 403
     - personal settings are isolated per account
     - policy changes are audited with a diff
     - a revision conflict is refused
     - an unsafe policy gets 422 and nothing is stored
     - reset creates a new revision
     - the sidebar state persists
   - `admin-ops.spec.js`: 17/17 passed. It covers:
     - 6 viewports × 2 themes
     - at widths of 1366 px and above, utilization is at least 95% of the area beside the sidebar
     - 6 KPIs in the first row at widths of 1600 px and above
     - no body overflow at 390 px or at 125% and 150% zoom
     - axe finds no critical or serious issues on the overview or settings page, in either theme
     - Refresh updates the page in place
     - preferences persist and restore
   - Full Playwright run: 151 passed, 2 failed. The failures are `dashboard-1440` and `deployment-failure-390`, on pages this phase does not change. The diff images show glyph-only differences across all text, with no layout change: this host's fonts differ from the CI-generated baselines. CI remains the authority.
   - Lint: 0 errors, 1 warning that predates this work. Format, config and asset checks pass.
   - Budgets: `admin-shell.css` 2.9/4 KB, `admin-shell.js` 1.7/2.5 KB, `admin-ops.css` 13.1/22 KB, `admin-ops.js` 7.0/16 KB.
6. **Screenshots**
   - Generated by `ADMIN_OPS_SCREENSHOT_DIR=<dir> npx playwright test tests/browser/admin-ops.spec.js`.
   - Files: `overview-<w>x<h>-<theme>.png` for all reference sizes, plus `overview-1600x900-collapsed.png`.
   - The final set is committed in Phase 6.
7. **Performance**
   - A page view or refresh adds one `User` preference read. The policy read is cached for 5 s.
   - There is no new background work in this phase.
8. **Security**
   - The web process gains no new privilege.
   - The new routes sit behind `requireAuth` and `requireAdmin`; platform writes also need `requireSuperAdmin`. CSRF is enforced on every POST, including the JSON sidebar toggle (header token).
   - Policy changes are audited; preference changes are not, because they affect only the administrator's own view.
9. **Outstanding**
   - The CPU, network, application, trend and capacity panels wait for the trusted collector (Phase 2 and later).
   - Incidents wait for Phase 4.
10. **Next**: Phase 2, trusted host and container collection in the worker.
