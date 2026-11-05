# Admin Operations Dashboard: Implementation Progress

Package: `docs/implementation/admin-operations-dashboard/` (`00`–`11`). Each phase ships as its own PR; the owner merges it and autodeploy releases it.

| Phase | Scope                                                    | Status  | Branch / PR                   |
| ----- | -------------------------------------------------------- | ------- | ----------------------------- |
| 0     | Audit and reconciliation                                 | Done    | `feat/admin-ops-p0-audit`     |
| 1     | Full-width overview and settings foundation              | Done    | `feat/admin-ops-p1-ui`        |
| 2     | Trusted collection, snapshot, host and container metrics | Done    | `feat/admin-ops-p2-collector` |
| 3     | App health, queue, services, builder, SSE                | Done    |                               |
| 4     | History, alerts, incident lifecycle                      | Done    |                               |
| 5     | Capacity and attention                                   | Pending |                               |
| 6     | Validation, performance, docs, rollout                   | Pending |                               |

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

## Phase 2: Trusted collection and snapshot

1. **Completed**
   - A worker-side collector (`apps/worker/src/monitoring/`) runs on the policy interval (default 15 s) whether or not anyone has the dashboard open. A Redis lease (`SET NX EX` with a token) keeps a second worker from running a duplicate collector.
   - Each cycle reads:
     - host CPU from `/proc/stat` deltas, normalized over all cores
     - memory and swap from `/proc/meminfo` MemAvailable
     - memory PSI
     - physical-interface network rates from `/proc/net/dev` deltas, with counter-reset and interface-change handling
     - load and uptime
     - disks by `statfs`, on the disk interval, deduplicated per filesystem
   - Each cycle makes three bounded Docker reads: `ps -aq`, one `inspect` of every container (state, restart count, OOM, limits, HelloDeploy labels only), and `stats --no-stream`.
   - Platform units are read with `systemctl show`, on the service interval: state, cgroup memory, CPU share and restart count.
   - `docker system df` runs every 30 min in the background.
   - Containers are classified from Mongo records: active (the project's `activeDeploymentId` container), candidate, retained, orphaned, build, or unmanaged. Unmanaged containers are counted toward host load but never named or attributed.
   - Every value travels in the metric envelope. A missing reading is `null` with a reason, never 0. Examples: CPU on the first cycle, no swap, PSI absent.
   - Each source has a timeout, an output cap and a breaker: after 3 consecutive failures it is skipped for 5 min. A Docker failure still publishes host metrics.
   - The worker publishes the sanitized snapshot to Redis `monitoring:snapshot` (TTL max(90 s, 4 intervals)). It also keeps a capped raw-sample list `monitoring:samples` (240 points, 1 h at 15 s). Both are written in one `MULTI`.
   - The web side reads these only:
     - `snapshot.service.js` uses a 2 s shared read cache, freshness, and schema checking.
     - `GET /admin/overview/snapshot` returns JSON for admins.
     - The KPIs take CPU, memory, swap, disk and network from the collector, with sparklines. When the snapshot is stale they show a Stale tone; when there is no snapshot they fall back to the web process for memory and disk only.
     - The trends panel draws server-rendered SVG charts from the raw samples. Gaps and missing values break the line; each chart has one shared axis and a table summary.
     - A new **Resource consumers** panel shows actual CPU and memory against configured limits, restarts and uptime for platform services and containers, plus an anonymized "other containers" row and Docker storage.
     - The services panel gains Monitoring collector and Docker rows.
   - `MONITORING_COLLECTOR_ENABLED` (default `true`) can turn the collector off without a code rollback.
2. **Changed files**
   - New:
     - `apps/worker/src/monitoring/{proc,docker,classify,systemd,collector}.js`
     - `apps/web/src/services/admin-ops/{snapshot.service,charts}.js`
     - `views/partials/admin-ops/{chart,consumers}.ejs`
     - `scripts/measure-monitoring-overhead.js` (`npm run monitoring:overhead`)
     - `tests/fixtures/admin-ops-fixture.js`
     - `tests/admin-ops/{collector,overview-view}.test.js`
   - Modified:
     - `apps/worker/src/runtime.js`: loop start/stop and job outcome timestamps
     - `apps/worker/src/config/env.js`
     - `apps/web/src/app.js`: `adminOps.deps` test seam
     - the overview service, controller, routes, trends partial and CSS
     - `packages/contracts/src/monitoring.js`: `ORPHANED`/`BUILD` roles, `consumers` widget
     - `scripts/browser-fixture-server.js`: deterministic snapshot from the real collector over fake readers
     - `.env.example`, `docs/ENVIRONMENT.md`, `package.json`
3. **Decisions**
   - The collector runs inside the existing worker, which already holds Docker group membership. The web process still gets no privilege.
   - The `inspect` format string selects fields explicitly. Environment, command lines and mounts are never read into the process that publishes.
   - `docker system df` took 27.7 s on the first measurement (11.4 s later), because it sizes 19 GB of volumes. It was moved out of the cycle and runs at most every 30 min.
   - Raw samples stay in Redis, not Mongo, so the 15 s cadence causes no database writes. Mongo history comes in Phase 4.
4. **Tests executed**
   - `node --test tests/admin-ops/*.test.js`
   - `npm test`
   - `npx playwright test tests/browser/admin-ops.spec.js`
   - lint, format, config, assets
   - a host dry run and `npm run monitoring:overhead -- --cycles 8 --interval 15`
5. **Results**
   - `npm test`: 2985/2985 pass.
   - Admin-ops unit and route tests: 85/85 pass. New cases include:
     - CPU normalization, and iowait counted as idle
     - the first sample is null
     - MemAvailable accounting; swap used
     - only physical interfaces are counted
     - counter reset gives no negative spike; a new interface gives null
     - an idle link reads 0, not unavailable
     - df-style usage
     - Docker binary and decimal sizes; `--` reads as null; a zero limit means unlimited
     - foreign labels are dropped
     - classification: active, retained, candidate, orphaned, build, unmanaged
     - the breaker opens after 3 failures
     - the stats collector can be disabled
     - no lease means no collection
     - unmanaged containers are anonymized
     - a stale snapshot greys the tiles; no snapshot shows Unavailable
     - apps are never Healthy from containers alone
     - limits are kept distinct from usage
     - chart gaps and nulls break the line; the axis is shared
   - Browser: 17/17 pass.
   - Lint: 0 errors.
   - Budgets: `admin-ops.css` 15.4/22 KB, `admin-ops.js` 7.0/16 KB.
6. **Host verification (dry run, real host)**
   - Memory: MemAvailable 4165 MiB against `free -m` 4180 MiB, read seconds apart.
   - Container memory and limits matched `docker stats` (for example 103/112 MiB of 256 MiB).
   - Root and Docker data were deduplicated to one filesystem (11.8%, `df` 12%).
   - Systemd units read without privilege.
   - Swap was fully used (4095/4095 MiB) at the time of measurement. That is an operational finding for Phase 4 alerting.
7. **Performance (production host, 4 cores, 8 cycles at 15 s, `monitoring:overhead`)**
   - Cycle wall time: p50 2218 ms, p95 2272 ms. Nearly all of it is `docker stats` waiting for the daemon's second sample.
   - Collector CPU: 22 ms per cycle, **0.04% of the host**.
   - Docker and containerd CPU during the window: **0.43% of the host**. This is an upper bound, because it includes unrelated daemon work.
   - RSS: no growth (−6.2 MiB over the run).
   - `docker system df`: 11.4 s wall (background, every 30 min).
   - The target was idle CPU under 2% and memory under 100 MiB; both are met.
8. **Security**
   - The web process still has no Docker, sudo or shell access, and reads Redis only.
   - The snapshot is sanitized at the source: there are no names or IDs for unmanaged containers and no environment, command or mount data. Error reasons are cut to one line of 160 characters.
   - The snapshot endpoint is admin-only and sent with `no-store`.
9. **Outstanding**
   - Application health probes, queue stages and the SSE event stream: Phase 3.
   - Mongo history beyond 1 h, and incidents: Phase 4.
   - Capacity: Phase 5.
   - The collector's Redis publish was exercised with a fake Redis, not the host's Redis, which is production's.
10. **Next**: Phase 3, operational integrations.

## Phase 3: Operations integrations

1. **Completed**
   - **Application health.** The worker probes each live release on its loopback port (`127.0.0.1:<containerPort><healthCheckPath>`):
     - single GET, 3 s timeout, no redirects, pass below 400, the same rule as the deploy-time check
     - at most 3 probes at once, on the probe interval
     - counts consecutive passes and failures, so one dropped request does not flip the status
   - **Status derivation.** In order of precedence:
     1. Maintenance, then Stopped (suspended, or no live release). These are intentional and are not counted as outages.
     2. A missing live container, or one stopped or OOM-killed, is Unhealthy.
     3. A crash loop is Restarting.
     4. Probes off, or no probe yet, gives Unknown.
     5. Failures at the threshold or above give Unhealthy; fewer give Degraded.
     6. Starting during a 60 s grace period with no pass yet.
     7. Healthy only after N consecutive passes.
   - A running container is never Healthy without probe evidence.
   - Optional public reachability: HTTPS to `<subdomain>.<PLATFORM_DOMAIN>` every 4th probe cycle, off by default. Shown as a separate column.
   - **Applications panel:** status chips; rows sorted most severe first, then by CPU; evidence, container state and restarts, CPU, memory against limit, uptime, release number, last probe.
   - **Healthy apps KPI:** shown as `healthy / expected`. Expected leaves out stopped and maintenance apps, and the detail line breaks down failing, degraded and unconfirmed. When the snapshot is stale every app shows Unknown.
   - **Deployments panel:**
     - queue counts with a paused-queue explanation
     - deployments in progress, with stage and elapsed time; a stage running over 30 min is flagged "possibly stuck"
     - recent results, with failures that a later deploy fixed marked "since redeployed"
     - unresolved failures: projects whose latest finished attempt in the last 30 days failed. These go to attention.
     - retained failed queue jobs are labelled history only
   - **Platform services:**
     - Nginx, the route helper and both tunnels come from `systemctl show`, collected by the worker without privilege
     - Nginx adds the helper's `validate` check every 5 min
     - a unit not installed on the host shows Not supported, not Down
     - tunnels are marked "local process only"; reachability is checked per app
   - **Build Service block:**
     - Disabled when `BUILDER_CONTROL_ENABLED=false`, with the executor mode reported by the worker
     - otherwise the published builder state, active build, idle stop and last error
     - Unknown when the published status is stale
   - **Activity feed:** admin audit events merged with deployment results; a CSS-only filter (All / Deployments / Admin) that survives refreshes; links to the existing pages.
   - **Attention list**, sorted by severity:
     - worker missing
     - monitoring data not current
     - apps that are unhealthy, restarting or degraded
     - stuck stages
     - unresolved deployment failures
     - paused queue
     - release identity mismatch
     - pending reviews
   - **Live events.** `GET /admin/overview/events` is an SSE stream for admins.
     - Admin status is checked again in the database on connect and every 2 min; a demoted admin gets 403.
     - Each admin may hold 2 streams through the existing `sse-limiter`.
     - Heartbeat every 25 s, `retry: 5000`, sequence ids, `X-Accel-Buffering: no`, flushes through compression, and a 6 min lifetime before reconnecting (inside the limiter's TTL).
     - Each event type has an allowlist of fields: `deployment` (id, status), `app` (project, from/to), `incident` (Phase 4). Unknown types and any other fields are dropped.
     - The worker publishes deployment transitions from `updateStatus`, and the collector publishes app health transitions (none on the first snapshot after a start).
     - The web side reuses the single shared subscriber connection: `subscribeChannel` was extracted from `deploy-log-stream.js`.
   - **Client:**
     - one tab per browser holds the stream, elected with a Web Lock, and relays events over a BroadcastChannel
     - a hidden leader steps down
     - events are deduplicated by id; bursts are merged into one panel refresh; refreshes requested during a request are queued
     - reconnect backoff, and after a dropped connection a full refresh in case events were missed
     - after 5 failures the stream is dropped and polling continues; the stream is retried after 5 min
     - an `unavailable` event (no pub/sub) leads to polling only; a `forbidden` event stops the page
     - the header mode shows "· live events"
2. **Changed files**
   - New:
     - `apps/worker/src/monitoring/probes.js`
     - `apps/web/src/services/admin-ops/deployments.service.js`
     - `tests/admin-ops/{operations,deployment-activity,events-route}.test.js`
   - Modified:
     - `collector.js`: probes, apps, nginx check, health transitions, executor
     - `pipeline.js`: admin event publish
     - `runtime.js`
     - `deploy-log-stream.js`: `subscribeChannel`
     - the overview service and controller (events endpoint), routes
     - `views/partials/admin-ops/{apps,deployments,services,activity}.ejs`, `pages/admin/index.ejs` (announcer)
     - `admin-ops.{css,js}`
     - the fixture: probe results, maintenance and suspended projects
3. **Decisions**
   - Probes run in the collector rather than as BullMQ jobs, so health checks never compete with deployments for the queue's single concurrency slot.
   - The "unresolved failure" rule looks at each project's latest finished attempt. A failure followed by a successful deploy is history.
   - SSE events are only triggers for a refresh. They carry no data the page renders directly, so a lost or duplicated event cannot leave wrong values on screen.
   - In test and fixture processes, which have no Redis connection, the stream does not subscribe. This keeps local runs from listening to the host's production Redis.
4. **Tests executed**
   - `node --test tests/admin-ops/*.test.js`
   - `npm test`
   - `npx playwright test tests/browser/admin-ops.spec.js`
   - lint, format, assets
   - `curl -N` of the event stream on the fixture: headers, `retry`, `hello`
5. **Results**
   - `npm test`: 3022 tests. The first run had 1 failure: a Phase 2 assertion that was out of date, and that test also waited 10 s on an unconnected Mongo. Both were fixed. The admin-ops suites then passed 122/122.
   - The full `npm test` result is recorded under Phase 6.
   - New cases cover:
     - a running container with a failing probe is not Healthy
     - one failure gives Degraded
     - Healthy needs N passes
     - suspended gives Stopped; maintenance; a missing container gives Unhealthy; restarting; probes off gives Unknown; never probed gives Unknown
     - probes against a real local HTTP server: 2xx, 5xx, redirect not followed, timeout
     - tracker counts, and forgetting removed projects
     - transitions: none at startup, then emitted
     - a fixed failure is history; a latest failure is unresolved; a build running over 30 min is stuck, a queued one is not
     - a paused queue is labelled paused
     - a disabled builder is not a failure
     - retained failed jobs are not raised as attention
     - an uninstalled unit shows Not supported
     - stale data shows Unknown for every app
     - SSE: non-admin 403, hello and no buffering, allowlisted fields only (a token in an extra field is not forwarded), unknown types dropped, demoted admin 403, slot released on disconnect
   - Browser: 17/17 pass.
   - Budgets: `admin-ops.js` 12.9/16 KB, `admin-ops.css` 16.5/22 KB.
6. **Performance**
   - About 6 local HTTP probes per 30 s, at most 3 at once.
   - One Nginx validate per 5 min.
   - One shared Redis subscriber per web process.
   - The deployments panel runs 3 Mongo queries per refresh: two bounded by `_id` order with a limit, and one aggregate limited to 30 days that uses `{projectId, sequenceNumber}`.
7. **Security**
   - The stream requires an admin and checks the role again; slots are limited; fields are allowlisted; log text never leaves the project-scoped log stream.
   - Probes call only loopback ports that the platform allocated. Public probes are opt-in.
8. **Outstanding**
   - The stream relays a Phase 4 `incident` event type; incidents themselves come in Phase 4.
9. **Next**: Phase 4, history and alerts.

## Phase 4: History, alerts and incident lifecycle

1. **Completed**
   - **History tiers.** New collection `monitoring_samples`, model `MonitoringSample`.
     - Unique `{resolution, bucketStart}`; TTL on `expiresAt`.
     - The worker writes one 1 m bucket when each minute closes, holding the weighted average and the maximum of every raw sample in it.
     - When a coarser bucket closes, the worker rolls the finer tier up into it: 5 m, then 1 h, then 1 d.
     - Each bucket expires at `bucketStart` plus its tier's retention from the policy: 24 h, 7 d, 30 d and 90 d by default.
     - Shortening retention removes older aggregates once per policy revision. Only monitoring samples are ever deleted; the audit log is untouched.
     - Raw 15 s samples stay in Redis.
   - **History API.** `history.service.js` reads one tier per range, capped at 800 points: 6 h and 24 h from 5 m buckets, 7 d from 1 h, 30 d from 1 d. 15 m and 1 h come from raw samples.
     - The trends panel labels the resolution in use.
     - Gaps break the line, using the bucket step.
   - **Incidents.** New collection `monitoring_incidents`, model `MonitoringIncident`.
     - A partial unique index on `fingerprint` while the incident is active or acknowledged, so there is one open incident per scope + rule + resource.
     - Fields: severity, state, `firstSeen`/`lastSeen`, occurrences, measurement, policy revision, acknowledged by and at, resolved at, resolution (`recovered` or `cleared`).
     - Resolved incidents expire after 90 d.
   - **Deterministic rule engine** (`apps/worker/src/monitoring/alert-engine.js`). Runs every collector cycle, whether or not a browser is open.

     | Rule                      | Behaviour                                                                                                           |
     | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
     | Host CPU                  | Critical only with saturation: load per core ≥ 1                                                                    |
     | Host memory               | Critical only with PSI some60 at or above the policy level, when PSI is available                                   |
     | Per-filesystem disk       | Threshold rule                                                                                                      |
     | Container memory vs limit | Only when a limit is set                                                                                            |
     | App health                | Unhealthy or restarting is critical, degraded is warning. Stopped or maintenance clears the incident as intentional |
     | Collector sources         | Host and Docker                                                                                                     |
     | Nginx config validate     | Critical on failure                                                                                                 |
     | Platform systemd units    | Down is critical                                                                                                    |
     | Queue stalled             | Waiting with none active, not paused, for 10 min                                                                    |
     | Deployment failures       | Reported by `updateStatus`: a FAILED deploy opens or adds an occurrence; the next HEALTHY deploy resolves           |
     - Each rule uses a threshold, a sustain duration and a recovery level (hysteresis).
     - Severity follows the condition while it is open.
     - A missing reading is Unknown: it neither opens nor resolves an incident.
     - A re-breach within 30 min reopens the same incident as another occurrence.
     - Writes happen only on state changes, plus at most one `lastSeen` write per minute.
     - On start the engine loads incidents left open by an earlier process.
     - An acknowledged warning that escalates to critical becomes active again.

   - **Acknowledge.** `POST /admin/overview/incidents/:incidentId/acknowledge`, open to admins.
     - Audited as `admin.incident_acknowledged`, with SUCCESS or FAILURE.
     - Returns 409 when the incident is not active.
     - The page sends it with fetch and refreshes the strip in place; without JavaScript the form posts normally.
     - The incident stays open until its rule recovers.
   - **Incident strip.**
     - Open incidents, most severe first: detail, since, last seen, occurrences, acknowledgement.
     - A collapsible list of incidents resolved in the last 24 h, labelled Recovered or Cleared.
     - When the collector is stale, it says incidents may be out of date and new ones cannot be detected.
   - **Live events.** Incident open, escalate, resolve and acknowledge publish `incident` events.
     - During a notification mute the event carries `muted: true` and the page does not announce it.
     - Collection and recording continue during a mute.
     - A critical active incident is announced through an `aria-live` region.

2. **Changed files**
   - New:
     - `packages/database/src/models/monitoring-{sample,incident}.model.js`
     - `apps/worker/src/monitoring/{history,alert-engine,registry}.js`
     - `apps/web/src/services/admin-ops/{history,incidents}.service.js`
     - `tests/admin-ops/history-alerts.test.js`
   - Modified:
     - `packages/database/src/index.js`
     - `runtime.js`: history, alerts, queue counts, reporter
     - `pipeline.js`: outcome report
     - `collector.js`: queue in the snapshot
     - the overview service: incidents, history-based trends
     - the controller and routes: acknowledge
     - `partials/admin-ops/incidents.ejs`, `admin-ops.{css,js}`
     - the fixture: seeded incidents and 24 h of 5 m history
     - the browser and route specs
3. **Decisions**
   - The engine runs in the worker next to the collector, so evaluation never depends on a browser being open.
   - `observe()` is pure and the lifecycle is a small state machine, which keeps rules testable as data.
   - Incidents fold repeated breaches into occurrences. A flapping condition reads as one incident, not a notification flood.
   - Retention changes apply to new buckets through `expiresAt`. A shorter retention also prunes once. A longer retention does not extend buckets already written, and this is documented.
4. **Tests executed**
   - `node --test tests/admin-ops/*.test.js`
   - `npm test`
   - `npx playwright test tests/browser/admin-ops.spec.js`
   - lint, format, assets
5. **Results**
   - `npm test`: **3050/3050 pass**.
   - Admin-ops suites: 150 tests.
     - History: weighted averages; a missing value is absent, not zero; UTC alignment; one 1 m write per minute (10 for 10 min); 5 m rollup (count 20); per-tier expiry; shortened retention prunes only older data.
     - Rules: CPU needs saturation to be critical; memory needs pressure; a missing reading is unknown.
     - Lifecycle:
       - one sample opens nothing
       - a breach past the sustain duration opens one incident, and only one however long it lasts
       - a reading between recovery and warning stays open
       - a reading below recovery resolves
       - a quick return reopens with occurrence 2
       - missing readings hold the incident
       - `lastSeen` is written at most once a minute
       - an intentional stop is cleared
       - a deployment fail then success resolves; repeated fails add occurrences
       - a restarted engine resolves incidents left open
       - an acknowledged warning escalating to critical reactivates
     - Acknowledge route: admin acknowledges and the incident stays unresolved; the action is audited; a resolved incident gets 409; a non-admin is refused.
   - Browser: **19/19 pass**, adding:
     - acknowledge in place, without a page reload, and the incident stays open
     - the 24 h range renders 5 m averages from seeded Mongo history
   - Budgets: `admin-ops.js` 14.0/16 KB, `admin-ops.css` 16.7/22 KB.
6. **Storage and write bounds (measured)**
   - One history bucket is 342 bytes (BSON).
   - At default retention: 1440 + 2016 + 720 + 90 ≈ 4.3k buckets, about **1.5 MB**.
   - At the policy maximum: about 8.5k buckets, about **2.9 MB**.
   - Writes: about **1,750 sample writes a day**, plus incident state changes.
   - Mongo is not touched at the 15 s cadence.
7. **Security**
   - Acknowledging is admin-only, CSRF-protected and audited.
   - Incident documents hold titles and details built from sanitized snapshot fields only.
   - The SSE allowlist for `incident` carries id, fingerprint, severity, state, title, time and the mute flag.
8. **Outstanding**: none for this phase.
9. **Next**: Phase 5, capacity and attention.
