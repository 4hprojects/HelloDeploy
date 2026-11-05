# Phase 0 Audit Report: Admin Operations Dashboard

- Date: 2026-11-05
- Base commit: `551af5f5becba57b36ed2542da1ada6f5c6d8964` (`main`, matches `origin/main`)
- Branch: `feat/admin-ops-p0-audit`
- Scope: the code was read in full. Runtime checks on the production host were limited to commands any user can run.

This report checks the package in this folder (`00`–`11`) against the code as it exists. Where the two disagree, the code wins (`00` §Source of truth).

## 1. Architecture as it exists

```
Cloudflare edge ─▶ cloudflared tunnel ─▶ host Nginx ─▶ 127.0.0.1 ports
                                                      ├─ hellodeploy-web    (user hellodeploy-web; no docker group)
                                                      └─ project containers (127.0.0.1:hostPort)
hellodeploy-web ──▶ MongoDB (Atlas) · Redis/BullMQ (local)
hellodeploy-worker (user hellodeploy-worker; groups docker, hellodeploy-nginx)
   ├─ Docker CLI (spawn, no shell) ─▶ project containers
   ├─ Unix socket ─▶ hellodeploy-nginx-helper (root, constrained: activate/remove/validate)
   └─ Redis: BullMQ consumer, publishes deploy-logs:<id>, writes builder:status
hellodeploy-autodeploy.timer (root) ─▶ scripts/autodeploy.js ─▶ infrastructure/upgrade.sh
```

Source: `docs/PLATFORM_ARCHITECTURE.md` L34-72, `infrastructure/systemd/*.service`.

## 2. Code map: the current overview

| Concern        | Location                                                                     | Behaviour                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mount          | `apps/web/src/app.js:208`                                                    | `app.use('/admin', adminRoutes)` runs after the session, CSRF, locals and maintenance middleware                                                                                                                 |
| Guard          | `apps/web/src/routes/pages/admin.routes.js:63`                               | `router.use(requireAuth, requireAdmin)`. It checks `req.session.user.platformRole`                                                                                                                               |
| Sidebar badges | `admin.routes.js:66-82`, `admin.controller.js:52`                            | `loadAdminPendingCounts` runs only for the GET paths in an explicit list                                                                                                                                         |
| Overview route | `admin.routes.js:88`, `admin.controller.js:57-64`                            | `Promise.all([getAdminOverview(), collectServerStats()])` renders `pages/admin/index`                                                                                                                            |
| Counts         | `apps/web/src/services/admin.service.js:74-100`                              | User total and active count, projects with status not ARCHIVED, pending approvals, domains and teardowns, and the last 8 `admin.*` audit events                                                                  |
| Server stats   | `apps/web/src/services/server-stats.service.js:35`                           | Memory and disk come from `node:os` and `statfs`. Queue counts come from BullMQ `getJobCounts` and `isPaused`. Worker liveness is `getWorkersCount`, plus a Mongo ping. Also webhook health and release metadata |
| View           | `apps/web/src/views/pages/admin/index.ejs`                                   | The "Needs attention" alert, pending work, health rows, 4 stat cards and recent activity                                                                                                                         |
| Layout         | `views/layouts/main.ejs`, `partials/sidebar.ejs:72-192`, `partials/head.ejs` | `pageStyles` and `pageScripts` hooks; the theme bootstrap reads `localStorage['hd-theme']`                                                                                                                       |

### Where each displayed value comes from

| Value              | Source                                                                                                    | Notes                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory %           | `os.totalmem() - os.freemem()` in the web process                                                         | The package said this misses MemAvailable. That is **wrong**: on Node 22, libuv `uv_get_free_memory` reads `/proc/meminfo` MemAvailable. Measured: `os.freemem()` gave 2240 MiB and MemAvailable gave 2239 MiB. The number is right, but the web process samples it once per request. |
| Running containers | `Deployment.countDocuments({status: HEALTHY, activeContainerId != null})` (`server-stats.service.js:139`) | Comes from Mongo, not Docker. The label says "running", but nothing checks the container's runtime state.                                                                                                                                                                             |
| Failed jobs        | BullMQ `failed` count                                                                                     | The queue keeps up to 500 failed jobs (`removeOnFail: 500`). This is **history**, but the overview treats it as "Needs attention".                                                                                                                                                    |
| Queue Active       | Means `!isPaused()`                                                                                       | It does not prove that jobs are being processed.                                                                                                                                                                                                                                      |
| Worker Ready       | `queue.getWorkersCount() > 0`                                                                             | Shows a worker is connected, not that it is making progress.                                                                                                                                                                                                                          |
| Release identity   | `apps/web/src/utils/release-sha.js` (`.git/HEAD` plus `/var/lib/hellodeploy/platform-release.json`)       | Read once at startup. It is already used by `/health` and `/admin/server`.                                                                                                                                                                                                            |

## 3. Reuse table

Classes: **R** reusable as is · **E** extend · **M** missing · **U** unsafe or unavailable · **O** out of scope.

| Proposed feature          | Class | Existing owner / data source                                                                                                                                      | Privileges                               | Plan                                                                                                                                           |
| ------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Host CPU                  | M     | none. `os.loadavg` only                                                                                                                                           | none (`/proc/stat`)                      | Worker collector: deltas of `/proc/stat` jiffies, normalized to all cores                                                                      |
| Host memory and swap      | E     | `apps/worker/src/builder/host-resources.js` `parseMeminfo` (L59), PSI parser (L78)                                                                                | none                                     | Reuse the parsers in the worker collector                                                                                                      |
| Disk                      | E     | `statfs` in web and in builder host-resources                                                                                                                     | none                                     | Worker reads `/`, `BUILD_WORKSPACE_ROOT` and `/var/lib/docker` (statfs needs no read access to the directory). `docker system df` every 10 min |
| Network                   | M     | —                                                                                                                                                                 | none (`/proc/net/dev`)                   | Counter deltas, with handling for counter resets and interfaces that appear or vanish                                                          |
| Container stats           | E     | `getContainerStats` (`apps/worker/src/deployment/container.js:412`), **never called**                                                                             | Docker group (worker only)               | One `docker stats --no-stream` and one `docker ps -a --filter label=hellodeploy.managed=true` per cycle                                        |
| Container ownership       | E     | Labels `hellodeploy.managed/project/deployment` (`container.js:270-275`). Mongo `Project.activeDeploymentId`, `Deployment.activeContainerId/candidateContainerId` | worker                                   | Classify each container as active, candidate, retained, unmanaged or platform by joining container IDs to Mongo                                |
| App health probe          | E     | `httpHealthCheck` (`apps/worker/src/deployment/health-check.js:21`), used only at deploy time                                                                     | loopback HTTP                            | Periodic single-attempt probe with a 3s timeout and concurrency 3                                                                              |
| Container uptime          | R     | `sweepContainerUptime` (`apps/worker/src/deployment/container-uptime-sweep.js`) writes `Deployment.runtime` every 60s                                             | worker                                   | Read `runtime.containerStartedAt`. Collector `docker ps` gives fresher state                                                                   |
| Shared snapshot           | E     | `builder:status` pattern (`apps/worker/src/builder/builder-runtime.js:40`, web `getBuilderStatus`)                                                                | Redis                                    | New key `monitoring:snapshot`, TTL 90s                                                                                                         |
| Scheduler                 | E     | `setInterval` loops in `apps/worker/src/runtime.js:194-256`                                                                                                       | —                                        | Same pattern. A Redis lease prevents a duplicate collector if a second worker ever starts                                                      |
| Queue status              | R     | BullMQ `getJobCounts`/`isPaused`, `checkWorkerReadiness`                                                                                                          | Redis                                    | Add `waiting-children`/stalled where the API supports it. Add the last-completed timestamp from the worker                                     |
| Deploy stage and progress | R     | `Deployment.status/currentStage` (QUEUED→VALIDATING→BUILDING→DEPLOYING→HEALTHY, FAILED/CANCELLED/ROLLED_BACK)                                                     | Mongo                                    | Active deployments with elapsed time. `updateStatus` (`pipeline.js:130`) publishes transitions                                                 |
| SSE                       | E     | `sseDeploymentLogs` (`apps/web/src/controllers/deployment.controller.js:276`), `sse-limiter.js`, `deploy-log-stream.js`. No heartbeat                             | session                                  | New admin-scoped stream with heartbeat. The channel `admin-ops:events` carries only status payloads, never log text                            |
| Builder status            | R     | `builder:status`, `BuilderState` enum                                                                                                                             | Redis                                    | Show it, and show Disabled when `BUILDER_CONTROL_ENABLED=false`                                                                                |
| Platform settings         | E     | `PlatformSetting` model, `platform-settings.service.js` (5s cache plus audit)                                                                                     | Mongo                                    | New key `monitoringPolicy`                                                                                                                     |
| Personal preferences      | M     | The User model has no preference fields                                                                                                                           | Mongo                                    | Additive subdocument `User.dashboardPreferences`, with defaults applied on read                                                                |
| Theme                     | R     | localStorage `hd-theme`, `window.__setHelloDeployTheme`                                                                                                           | client                                   | Keep. The settings page links to it                                                                                                            |
| Audit                     | R     | `writeAuditEvent` (`packages/observability/src/audit.js:33`), 90d TTL                                                                                             | Mongo                                    | Actions `admin.monitoring_policy.update/reset` and `admin.incident.acknowledge`                                                                |
| History                   | M     | none                                                                                                                                                              | Mongo                                    | New `monitoring_samples` collection with TTL tiers                                                                                             |
| Incidents                 | M     | none                                                                                                                                                              | Mongo                                    | New `monitoring_incidents` collection                                                                                                          |
| Charts                    | M     | No chart library                                                                                                                                                  | —                                        | Inline SVG, so no dependency is added                                                                                                          |
| Nginx routing health      | E     | helper `validate` action (`apps/worker/src/nginx/helper-client.js`)                                                                                               | existing helper socket                   | `validateNginxConfig()` at most once every 5 min. This adds no privilege                                                                       |
| Tunnel health             | E     | systemd units `cloudflared*`                                                                                                                                      | `systemctl is-active` needs no privilege | Read-only check from the worker                                                                                                                |
| Public reachability       | M     | `uptime-check.yml` (GitHub-side, every 10 min)                                                                                                                    | outbound HTTPS                           | Optional and off by default. The page shows "Not checked"                                                                                      |
| Backup evidence           | U     | `/var/backups/hellodeploy/*/manifest.json` is root-owned, mode 0600. No status record                                                                             | would need a new privilege               | **Show as Unknown.** Making it readable needs owner approval (`08` §Autonomous policy)                                                         |
| Remote builder capacity   | O     | Pilots paused (`docs/PRIORITIES.md` L75-80)                                                                                                                       | —                                        | Show the flag state only                                                                                                                       |

## 4. RBAC, privileges and data leaks

- Platform roles are `SUPER_ADMIN`, `ADMIN` and `USER` (`packages/contracts/src/enums.js:9`). Super-admin-only routes so far: role change, user delete, queue pause/resume, maintenance, builder control and quota override.
- **Decision:**
  - Overview, snapshot, history, events stream, personal settings and incident acknowledgement require `ADMIN` or above.
  - Changing the platform-wide monitoring policy requires `SUPER_ADMIN`, matching maintenance, queue and builder. Each change writes an audit event.
- Web keeps **no** Docker access. It reads only the sanitized Redis snapshot and Mongo aggregates.
- What the snapshot excludes:
  - environment variables, image digests, raw `docker inspect` output, container command lines, log text, secrets, internal IPs other than loopback ports
  - container names, except as the existing `hellodeploy-<slug>-<id8>` form
- The snapshot carries project slugs and IDs, which admins can already see in `/admin/projects`.
- SSE events carry IDs, statuses and timestamps only. Deployment log text stays behind the project-scoped stream.
- `requireAdmin` trusts the session role. The 24h rolling session and `revokeUserSessions` on role change already handle demotion. The SSE stream re-checks `platformRole` against Mongo on each reconnect and every 5 min.

## 5. Schema and migration impact

Every change is **additive**. Nothing is dropped, renamed or backfilled destructively.

1. `User.dashboardPreferences` is an optional subdocument. Missing means defaults, so old accounts need no backfill.
2. `PlatformSetting{key:'monitoringPolicy'}` is created on the first save. Missing means defaults.
3. New collection `monitoring_samples`:
   - Fields: `{resolution, bucketStart, host, projects, expiresAt}`.
   - Unique index `{resolution, bucketStart}` and a TTL index on `expiresAt` with `expireAfterSeconds: 0`.
4. New collection `monitoring_incidents`:
   - Partial unique index on `fingerprint` where `state ∈ {ACTIVE, ACKNOWLEDGED}`.
   - Index `{state, severity, lastSeen}`.
   - TTL on `expiresAt`, set only once an incident is resolved.

The repo has no migration framework. Mongoose builds indexes automatically at startup, which is how every existing model gets its indexes. Indexes on new, empty collections build immediately and cannot lock existing data. Rollback means the old code ignores these collections and fields; nothing needs to be deleted.

## 6. Resource baseline (production host, 2026-11-05 02:38 local)

| Measure                                    | Value                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| CPU                                        | 4 cores, load average 0.70 / 0.85 / 0.97                                                                                       |
| Memory                                     | 7335 MiB total, MemAvailable 2268 MiB (69% used), buff/cache 2671 MiB                                                          |
| Swap                                       | 4095 MiB total, **2132 MiB used**                                                                                              |
| Memory PSI                                 | some avg10 0.03, full avg10 0.00                                                                                               |
| Disk `/`                                   | 937 G, 12% used                                                                                                                |
| Containers                                 | 6 running, 5 with the `hellodeploy.managed` label                                                                              |
| Web RSS                                    | 102 MiB                                                                                                                        |
| Worker RSS                                 | 64 MiB                                                                                                                         |
| `docker stats --no-stream`, all containers | **2.25 s wall**, 0.055 s CPU                                                                                                   |
| Services                                   | `cloudflared`, `cloudflared-hellodeploy`, `hellodeploy-nginx-helper`, `redis-server` active. `mongod` inactive (Atlas is used) |

Notes on the baseline:

- `docker stats --no-stream` waits for two daemon samples, so its cost is wall time, not CPU. Running it async once per 15s cycle, with a 10s timeout, is acceptable.
- Estimated extra load at the defaults:
  - one `docker stats` and one `docker ps` per 15s
  - about 6 HTTP probes per 30s
  - about 1 Mongo write per minute (1m bucket), plus rollups and incident changes. That is about 1.6k writes per day, against a 90d-capped store.
- Expected worker RSS growth is under 20 MiB, with ring buffers capped at 240 samples. Phase 2 will measure the real figures.
- Swap is already 2 GiB used. The collector must stay lean, and swap must be shown honestly.

## 7. How the package's plan changes

| Package item                                              | Change                                                                            | Reason                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `01`: "source of memory % may ignore MemAvailable"        | Closed. The semantics are already correct; the value moves to the worker snapshot | Measured on the host                                                  |
| `04`: Redis for the latest snapshot, Mongo for aggregates | Accepted                                                                          | Same pattern as `builder:status`; Redis is local                      |
| `04`: collector lease                                     | Redis `SET NX EX`                                                                 | No Redis lock exists today; it costs one SET per cycle                |
| `05`: route `/admin/overview/settings`                    | Accepted. The admin router lists the path for badges                              | Fits under the existing `/admin` router                               |
| `05`: "concurrency-safe versioning if conventions permit" | `version` field inside the policy value, checked on save                          | `PlatformSetting.value` is Mixed                                      |
| `05`: theme in personal prefs                             | Stays client-side (localStorage); settings links to the toggle                    | Avoids a second source of truth that conflicts with `head.ejs`        |
| `06`: worker "actual job progress"                        | Worker writes `lastJobCompletedAt` and `lastJobFailedAt` into the snapshot        | No custom heartbeat exists                                            |
| `06`: Nginx routing health                                | Helper `validate` at most once every 5 min, then evidence of the route count      | Uses only an existing helper action                                   |
| `07`: raw samples under 1h                                | Redis capped list, never Mongo                                                    | Avoids unbounded Mongo writes                                         |
| `07`: backup evidence                                     | Unknown                                                                           | §3: reading it needs privilege                                        |
| `02`: sidebar collapse                                    | New small `js/admin-shell.js`, loaded only on admin pages                         | `js/app.js` has 106 bytes of headroom (`scripts/check-ui-budgets.js`) |
| `02`: charts                                              | Inline SVG, no library                                                            | Bundle budgets; no dependency added                                   |
| `08`: one PR per phase                                    | Accepted. Owner decision: **owner merges**, autodeploy ships                      | `docs/WORK_LOOP.md`, owner answer on 2026-11-05                       |

## 8. Risks and open assumptions

1. **Shared host.** Monitoring competes with hosted apps for CPU and memory. Mitigations: fixed cadence bounded by policy, one docker call per cycle, timeouts, a circuit breaker after 3 failures with 5-minute cooldowns, and capped ring buffers.
2. **Worker coupling.** The collector runs in the deployment worker. All collection is async with timeouts, and any error is caught and logged at warn level, so it cannot block BullMQ. The process RSS is measured in Phase 2.
3. **Docker CPU % semantics.** `docker stats` CPUPerc is relative to one core (it can exceed 100%). It is converted to share-of-host by dividing by `nproc`. Both values are shown, with their units.
4. **Container memory.** `docker stats` MemUsage is cgroup usage minus inactive file cache, per the Docker CLI. This is documented in the contract.
5. **Atlas.** Mongo health is shown as a ping from web and worker only. Atlas internals are out of scope.
6. **Browser fixture.** It runs without Redis, so Playwright sees the Unavailable states. Phase 1 adds a seeded snapshot fixture for the screenshots.
7. **Tests on the production host** share its CPU and RAM. Heavy suites run one at a time.
8. **Pre-existing doc conflict.** `PLATFORM_ARCHITECTURE.md` L143 says customer hosting is NO-GO, but `PRIORITIES.md` lists live apps. This work does not change that.

## 9. Approved and blocked decisions

| Decision                                                          | Status                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Collector in the worker; sanitized Redis snapshot; web reads only | Approved: no new privilege                                   |
| Additive Mongo collections and fields, with TTL                   | Approved: not destructive                                    |
| SUPER_ADMIN for platform policy, ADMIN for the rest               | Approved: matches conventions                                |
| SSE on the existing session and limiter, with heartbeat           | Approved                                                     |
| Reading backup manifests (new group or ACL)                       | **Blocked: owner approval needed.** Shows Unknown until then |
| Prometheus, Grafana, exporters                                    | Not planned                                                  |
| Builder or pilot flags                                            | Not touched                                                  |
| Merging to `main` and deploying                                   | Owner merges; autodeploy ships                               |

## 10. Test commands and rollout prerequisites

- Per phase:
  - `npm run lint`, `npm run format:check`
  - `npm run assets:build && npm run assets:verify && npm run assets:budget`
  - `npm run config:check`, `npm test`
  - `npm run test:browser` when the UI changes
- Phase 6 adds `npm run test:coverage`, `npm run performance:lab` and `npm audit --omit=dev --audit-level=moderate`.
- Rollout prerequisites:
  - green `ci.yml` on the merge SHA
  - the autodeploy path (`upgrade.sh` takes the backup, pause-and-drain, verification and automatic rollback)
  - after the deploy, `npm run production:check -- https://<host> --expected-sha <sha>`
  - worker logs show no collector errors
  - RSS and CPU stay within budget

Gate result: there is no unresolved privilege or schema ambiguity that affects Phase 1. **Proceed.**
