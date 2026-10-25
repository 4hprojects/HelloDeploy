# Builder Control Design

Status: Phase A approved with conditions (2026-10-23); Phase B implemented on
`feat/builder-control` (section 11), not merged. Phase C (host install and isolated tests) waits
for owner approval. Builder control and every pilot flag stay off in production.

An on-demand build service that administrators start and stop, so the multi-runtime pilots
can build without a paid VPS while the hosted apps (HelloRun, HelloUniversity, HelloPera,
HelloEventHub and the rest) stay protected. It reuses the existing remote-BuildKit executor,
GHCR push and retention, flags, and admin area; see [STATUS.md](STATUS.md) for the gates.

## 1. Current implementation audit

Audited at `main` `3984477` (CI, CodeQL and Uptime green). The multi-runtime code is merged,
every flag is off, and no build infrastructure exists.

**What can be reused as-is (do not duplicate)**

| Need                                                                                          | Existing component                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strategy flags and allowlists, and requiring remote BuildKit, GHCR, cleanup and concurrency 1 | `apps/worker/src/config/env.js:115-146` `parsePilotFlag`; `packages/contracts/src/build-strategies.js:128` `isPilotStrategyEnabledFor`; job gate at `build-deployment.job.js:257`                     |
| No fallback to the production daemon                                                          | `BUILD_EXECUTOR=remote-buildkit` never creates a local builder (`build.js:391`, `runtime.js:60`); `dockerfile_v1` refused off-remote (`build-deployment.job.js:267`)                                  |
| Build, export, push and digest                                                                | `buildAndPushDockerImage`, `createRemoteDockerBuildArgs`, `createOrasPushArgs`, `readLayoutChildDigests` (`apps/worker/src/deployment/build.js:159-339`); `createBuildExecutor` (`build-executor.js`) |
| GHCR connectivity probe                                                                       | `verifyRegistryAccess` (`apps/worker/src/deployment/registry.js:44`)                                                                                                                                  |
| GHCR cleanup and retention                                                                    | `deleteRegistryManifest`, shared-child rule, `sha256-*` tag removal (`registry.js`); `retention.js`; abandoned sweep (`cleanup-releases.job.js:138`)                                                  |
| Build timeout                                                                                 | `BUILD_TIMEOUT_MS` capped by the quota, applied as SIGKILL of the client (`build.js:235` `runTimedProcess`)                                                                                           |
| One build at a time                                                                           | `WORKER_CONCURRENCY=1`, the default, and required by every pilot flag (`env.js:137`)                                                                                                                  |
| Failed build leaves the live release alone                                                    | Pipeline swap happens only after HEALTHY; verified in the 2026-10-20/21 smoke runs (`EVIDENCE.md`)                                                                                                    |
| Pattern for a privileged operation                                                            | `hellodeploy-nginx-helper.service`: root, narrow JSON-over-Unix-socket API, `ProtectSystem=strict` (`infrastructure/nginx/helper-server.js`)                                                          |
| Admin authorization                                                                           | `requireAuth, requireAdmin` on `/admin`; `requireSuperAdmin` for queue pause and maintenance (`apps/web/src/routes/pages/admin.routes.js:46,86-89`)                                                   |
| Admin server page, host stats, worker readiness                                               | `getAdminServer`, `collectServerStats` (`server-stats.service.js`, which reads os and statfs), `checkWorkerReadiness`                                                                                 |
| Persisted platform toggles                                                                    | `PlatformSetting` model with the get/set pattern (`apps/web/src/services/platform-settings.service.js`)                                                                                               |
| Audit log                                                                                     | `writeAuditEvent` (`packages/observability/src/audit.js:33`), `/admin/audit-events` with export                                                                                                       |
| Health status pattern stored in Redis                                                         | `webhook-health.service.js` (Redis hash plus an admin card)                                                                                                                                           |
| Host baseline                                                                                 | `scripts/capture-host-baseline.js` (sanitized, read-only)                                                                                                                                             |
| Acceptance harness                                                                            | `npm run acceptance:multi-runtime` (preflight-only by default), 29 fixtures                                                                                                                           |

**What is missing (new work)**

- An admin-controlled builder lifecycle: start, stop, emergency stop, idle shutdown, state and health.
- Any check of free resources before a build. Nothing reads MemAvailable or PSI before or during a build today. Only the timeout and the memory limit of the existing builder container apply.
- Monitoring during a build that cancels it under host pressure.
- A control channel that does not wait behind a build. Admin queue actions use the single deployment queue, which runs one job at a time, so a "stop" sent that way would wait for the build it is meant to stop.
- An admin UI for runtime and project permissions. Today these are env variables only.
- S1 from the previous audit: nothing checks that the builder is really the isolated one, not a builder with the right name on the production daemon.
- Recovery after an unexpected worker crash. Nothing reconciles deployments stuck in `BUILDING`. Planned restarts are safe because `upgrade.sh` drains the queue first. A crash leaves a stalled BullMQ job (`attempts: 1`, `lockDuration` 10 min, `packages/queue/src/index.js:154`). That behavior is **not verified**.

**Production resource baseline (measured 2026-10-23; this host is also the owner's desktop)**

| Resource               | Value                                                                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU                    | 4 cores; load 0.8–1.3; CPU PSI some avg60 4.3%                                                                                                                                                                                  |
| Memory                 | 7.2 GiB total, **1.19 GiB available**; **swap 4.0/4.0 GiB used**; memory PSI some avg10 0.09                                                                                                                                    |
| Memory users           | Desktop apps (VS Code, Chrome, Claude) about 3 GB; 4 app containers 47–107 MiB each (limit 256 MiB)                                                                                                                             |
| Disk                   | 801 GB free (ext4). Docker: images 8.0 GB, volumes 9.2 GB, **build cache 18.7 GB (14.6 GB reclaimable)**                                                                                                                        |
| Kernel and init        | Ubuntu 26.04.1, kernel 7.0; cgroup v2 with the cpu, memory, io and pids controllers; systemd 259; `systemd-oomd` active                                                                                                         |
| Rootless prerequisites | `rootlesskit` present. **Missing:** `newuidmap`/`newgidmap` (package `uidmap`) and a subuid range for a builder user. **`kernel.apparmor_restrict_unprivileged_userns=1`**, so rootless BuildKit needs its own AppArmor profile |
| Existing Node builder  | `buildx_buildkit_hellodeploy-builder0`: `docker-container` driver, **privileged=true**, memory 2 GiB, **no CPU limit, no PID limit, no cache GC limit**, restart unless-stopped                                                 |
| Leftover               | `hellodeploy-dev-builder` (1 GiB limit, last used 2026-10-12, empty cache). **Removed 2026-10-23** with owner approval: available memory 1,215 → 1,284 MB; nothing else pruned; apps answered as before                         |

**Changes that could affect existing deployments**

- Anything that touches the existing Node builder, the production daemon, `WORKER_CONCURRENCY`, or the routing and pipeline code. The design below touches none of them. Builder control is an additional path that only versioned strategies use.
- Memory contention. Any build service on this host competes with the live apps. This risk exists today (the privileged 2 GiB Node builder). The design adds hard caps and admission rules so it does not grow.

---

## 2. Proposed architecture: a restricted same-host builder (recommended)

```
admin browser ──HTTPS──> web (no Docker, no credentials)
                           │ server-side requireSuperAdmin/requireAdmin + CSRF + audit
                           ▼
                Redis: BullMQ "builder-control" queue (separate from deployments)
                           │
                           ▼
worker process: builder-control consumer (concurrency 1, runs beside the deployment worker)
   │  admission checks + monitor during builds + idle timer + status publisher (Redis hash)
   │  systemctl start|stop|kill hellodeploy-buildkitd.service  ← polkit rule: this unit only
   ▼
hellodeploy-buildkitd.service: rootless buildkitd as user hellodeploy-builder
   cgroup: MemoryMax, MemorySwapMax=0, CPUQuota, TasksMax, IOWeight; ManagedOOM=kill
   store: fixed-size ext4 image mounted at /var/lib/hellodeploy-builder (hard disk cap)
   socket: unix:///run/hellodeploy-builder/buildkitd.sock (group hellodeploy-builder-clients ∋ worker)
   egress: nftables `meta skuid hellodeploy-builder` → deny loopback, RFC1918, link-local,
           metadata; allow 53/80/443 to public addresses
   ▼ OCI layout → worker → ORAS push → private GHCR → production daemon pulls by digest
```

Key properties:

- **Off by default.** `BUILDER_CONTROL_ENABLED=false` hides the UI and refuses the control jobs. The unit is installed `disabled` and never starts at boot. No pilot flag changes.
- **No automatic start.** A versioned-strategy build while the builder is stopped fails at once with `BUILDER_OFFLINE`: "An administrator must start the build service". It never waits in the queue, so it can never block a Node deploy behind it in the one-job queue. Legacy Node builds never touch this builder.
- **No fallback, and legacy builds untouched.** `BUILD_EXECUTOR=remote-buildkit` sends _every_ snapshot build to the remote executor, legacy Node builds included, so it cannot be used for an on-demand builder. Builder control therefore has its own settings (`BUILDER_CONTROL_BUILDX_NAME`, `BUILDER_CONTROL_ENDPOINT`), `BUILD_EXECUTOR` stays `local`, and only Next.js, Python, PHP and Java strategies use the builder. The S1 check requires the `remote` driver at the configured socket, never the Docker daemon socket, when the builder starts and before every build.
- **A separate daemon.** buildkitd is not the production Docker daemon. Starting, stopping or killing it cannot restart dockerd or touch app containers, networks or nginx.
- **Least-privilege control.** The web only enqueues control jobs. The worker manages exactly one systemd unit through a polkit rule. No new root daemon. The nginx-helper pattern is the alternative if polkit proves awkward.
- **Secrets.** Only `public-build-env.js` values reach builds, as today. GHCR credentials stay in the worker's credential store. The builder user has no Docker group, no Mongo or Redis access, and no `/opt/hellodeploy` read.
- **Owner Dockerfile and prebuilt-image pilots stay off.** A builder sharing the kernel is acceptable only for the platform's own generated templates.

**Admin interface:** a new card on `/admin/server`, plus `/admin/builder`.

- Status: Stopped, Starting, Ready, Building, Stopping, Failed, or "Not reporting" when the worker's status is over a minute old. Also the last error, uptime and the idle countdown. With builder control off, the page and its routes do not exist.
- **Start**, **Stop** and **Emergency Stop**: super-admins only. Stop refuses while a build runs; Emergency Stop cancels the build and SIGKILLs the unit. Ordinary admins may view the page and run the registry check.
- Active and queued builder deployments.
- Resource use: the builder cgroup's `memory.current` and `cpu.stat`, store disk use, and host MemAvailable, swap and PSI.
- GHCR connectivity: the result and time of the last `verifyRegistryAccess` probe, plus a "Check now" button.
- Permissions per runtime and per project. The env flag remains the operator's upper limit, and admins edit a DB allowlist within it. Every change is audited.
- The idle-shutdown setting, and the activity log filtered from `/admin/audit-events`.

### Remote BuildKit vs the restricted same-server builder

|                                   | Same-server rootless (recommended now)                                          | Remote builder (second machine or VPS) |
| --------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| Extra cost                        | $0 (optional one-time RAM upgrade)                                              | $0 if spare hardware, else ~$6–24/mo   |
| Isolation                         | Separate user, user namespace, cgroup, egress filter; **shared kernel and RAM** | Separate kernel and hardware           |
| Effect on live apps               | Bounded by cgroup caps and admission; still competes for RAM                    | None                                   |
| Suits generated templates (P1–P3) | Yes                                                                             | Yes                                    |
| Suits owner Dockerfiles (P4)      | **No**                                                                          | Only with a builder per build          |
| Code changes                      | Socket endpoint and S1 check; otherwise the same executor                       | None beyond S1 (mTLS over `tcp://`)    |

The control plane is the same in both cases. Moving to remote later changes only the endpoint and who runs the unit.

---

## 3. Resource requirements and limitations

Enforced **during** the build, not only before it:

| Control                                        | Mechanism                                                                                                                                                                 | Proposed default                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| One build at a time                            | `WORKER_CONCURRENCY=1` (existing) plus buildkitd `max-parallelism=1`                                                                                                      | 1                                            |
| CPU                                            | `CPUQuota=200%`, `CPUWeight=20` (live apps win any contention)                                                                                                            | 2 of 4 cores                                 |
| Memory                                         | `MemoryMax=1536M`, `MemoryHigh=1280M`, `MemorySwapMax=0`, `ManagedOOMMemoryPressure=kill`                                                                                 | 1.5 GiB hard                                 |
| Processes                                      | `TasksMax=512`                                                                                                                                                            | 512                                          |
| Disk I/O                                       | `IOWeight=20`                                                                                                                                                             | low                                          |
| Disk space                                     | Fixed-size store image (hard cap) plus BuildKit GC `keepStorage`                                                                                                          | 30 GB image, GC at 20 GB                     |
| Timeout                                        | Existing `BUILD_TIMEOUT_MS` (client killed, BuildKit cancels the solve); also a worker watchdog that kills the unit if the build is still running after timeout plus 60 s | 15 min                                       |
| Admission (before start and before each build) | MemAvailable ≥ MemoryMax + 1 GiB reserve; free swap ≥ 512 MiB; memory PSI some avg60 < 10%; free disk ≥ 20 GB; store ≥ 5 GB free; builder healthy                         | reject with `BUILDER_INSUFFICIENT_RESOURCES` |
| Monitor during a build (every 5 s)             | Host MemAvailable < 600 MiB, memory PSI full avg10 > 5%, or free disk < 10 GB: cancel the build and fail it with a clear reason                                           | cancel                                       |

**Limitations, stated honestly:**

1. With today's numbers (1.19 GiB available, swap full), **admission would reject every build**. The same-host builder works only when the desktop session isn't holding about 3 GB, or after a one-time RAM upgrade. That is a hardware cost, not a monthly one.
2. Java (Gradle/Maven) may need more than 1.5 GiB. This has never been measured, so the first Java run is part of Phase C.
3. A shared kernel means a kernel exploit in a build reaches the host. The design accepts this only for platform-generated templates.
4. Allowing only public addresses does not stop exfiltration to the internet. But builds hold no secrets.

---

## 4. Security and production impact assessment

| Risk                                                              | Rating            | Control                                                                                                                                        |
| ----------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A build starves the live apps of memory                           | High on this host | cgroup MemoryMax with no swap, admission, monitor, oomd kills the builder unit first, CPU and IO weights                                       |
| A build reaches Redis, the nginx helper, Docker or cloud metadata | Medium            | Rootless user with no groups; nftables rule matched on the builder's uid; Unix sockets permission-locked                                       |
| Fallback to the production daemon                                 | Medium (S1)       | Driver and endpoint assertion at start and before each build; tests that fail closed                                                           |
| Web compromise gains infrastructure control                       | Low               | The web can only enqueue validated control jobs; the worker applies its own admission rules; polkit allows one unit only; every action audited |
| Builder lifecycle touches the apps                                | Low               | A separate unit and daemon; no dockerd restart; no nginx calls; no container operations in the control path                                    |
| GHCR token leak                                                   | Low               | Worker credential store, file-based packages token, existing redaction; never in env, the UI or logs                                           |
| Owner Dockerfile on the shared kernel                             | Excluded          | P4 flags stay off; env validation stays as is                                                                                                  |
| Rootless setup weakens AppArmor                                   | Medium            | A dedicated profile for `rootlesskit`/`buildkitd` only; `apparmor_restrict_unprivileged_userns` stays 1                                        |

**Effect on production while everything is off: none.** The new code paths are behind `BUILDER_CONTROL_ENABLED=false` and the existing pilot flags. The host changes in Phase C (install the unit, user, AppArmor profile, nftables rule, store image) are additive, and they are installed disabled.

---

## 5. Development phases and estimated effort

| Phase | Scope                                                                                                                                                                                                                                                                                                                                                                                                                      | Agent sessions (uncertainty)                                           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **A** | This audit and design                                                                                                                                                                                                                                                                                                                                                                                                      | done                                                                   |
| **B** | `BuilderState` (PlatformSetting key) state machine; `builder-control` queue and consumer; admission and monitor modules (inputs injected); S1 driver check; `BUILDER_OFFLINE` and `BUILDER_INSUFFICIENT_RESOURCES` failure codes; admin card and page, controls, permissions UI, audit events; unit, browser and axe tests. Everything off by default, and the systemctl, cgroup and /proc readers injected through `deps` | 3–4 (medium)                                                           |
| **C** | Host scripts the owner runs with sudo: builder user and subuid, `uidmap`, AppArmor profile, `buildkitd.toml`, store image, unit file (disabled), polkit rule, nftables table, plus an uninstall script. Isolated tests: throwaway Mongo and Redis, a nonproduction worker, a throwaway GHCR repository, runbook step 7, the acceptance harness on Next.js fixtures, and each failure case in §8                            | 3–5 (low to medium; depends on AppArmor/rootless on 26.04 and on GHCR) |
| **D** | The production activation checklist (§7) with the owner; one allowlisted Next.js project                                                                                                                                                                                                                                                                                                                                   | 1 plus owner time                                                      |

## 6. Automated testing plan

- **Unit tests (Phase B):**
  - state-machine transitions, including illegal ones;
  - admission thresholds at each boundary;
  - monitor cancellation;
  - idle-timer expiry, without stopping during a build;
  - the S1 driver and endpoint check (rejects a `docker-container` builder or the wrong socket);
  - `BUILDER_OFFLINE` when stopped;
  - legacy Node builds unaffected while the builder is stopped, failed or disabled;
  - the control queue is processed while a deployment job holds the deployment queue.
- **Web tests:**
  - non-admins get 403 on every builder route;
  - Start and Stop need a super-admin;
  - CSRF is required;
  - every action writes an audit event;
  - the UI and routes are absent when disabled;
  - no credential values reach rendered HTML (redaction assertion).
- **Browser and axe:** the builder card and page in the fixture server, keyboard access, and an accessible name for every control.
- **Regression:** existing CI (lint, format, the full suite in CI, browser tests, Lighthouse). Locally, focused files only.
- **Phase C (isolated, live):** each scenario in §8, the acceptance harness on Next.js fixtures, and a before/after diff of production containers and networks.

## 7. Production activation checklist (Phase D, owner-approved only)

1. Phase C evidence is recorded in `EVIDENCE.md`; every case in §8 passed.
2. A backup is taken (`infrastructure/backup.sh`); the leftover dev builder is removed.
3. The host scripts are installed with the unit **disabled**, and `config:check` passes.
4. Runbook step 7 has passed on the production GHCR repository; ORAS and the credentials are present for the worker.
5. On the worker and web, set `BUILDER_CONTROL_ENABLED=true`; on the worker also `BUILDER_CONTROL_BUILDX_NAME`, `BUILDER_CONTROL_ENDPOINT`, `USER_IMAGE_REGISTRY=ghcr.io/4hprojects/hellodeploy-builds` and `REGISTRY_MANIFEST_DELETE_ENABLED=true`. `BUILD_EXECUTOR` stays `local`. All pilot flags stay off.
6. Start the builder and stop it. Confirm the apps answered 200 throughout, with containers and networks unchanged.
7. Enable `MULTIRUNTIME_NEXT_V1` for one allowlisted project. Deploy it and roll it back.
8. Watch it for 7 days: idle shutdown works, and no admission or monitor events touch the apps.

## 8. Recovery and rollback

| Scenario                               | Expected behavior (tested in Phase C)                                                                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| BuildKit fails to start                | State becomes Failed with the reason; builds are rejected with `BUILDER_OFFLINE`; apps untouched                                                                                                                                                                               |
| BuildKit crashes during a build        | The monitor sees the unit is not active and cancels the build (`BUILD_CANCELLED`), or the client fails first (`BUILD_FAILED`); state becomes Failed; the live release stays; the unit is not restarted automatically                                                           |
| GHCR unavailable                       | The push fails, so the build fails; the live release stays; the connectivity card shows the error; the abandoned sweep cleans up partial pushes                                                                                                                                |
| Host memory pressure                   | Admission rejects, or the monitor cancels; oomd or the cgroup kills the builder, never an app                                                                                                                                                                                  |
| Disk near capacity                     | Admission rejects; GC runs; the store image caps growth; Emergency Stop plus "Prune cache"                                                                                                                                                                                     |
| Admin stops the builder during a build | Stop is refused while a build runs. Emergency Stop cancels it (`BUILD_CANCELLED`, "Stopped by an administrator"), SIGKILLs the unit, and no activation is queued                                                                                                               |
| Worker restarts unexpectedly           | The client dies, so BuildKit cancels the solve. At startup, when no other worker is connected, the worker fails builder deployments left `VALIDATING`/`BUILDING` (`WORKER_INTERRUPTED`; legacy ones untouched), adopts a still-running unit, and the idle timer stops it later |
| Deploy fails after the image was built | The existing pipeline keeps the previous HEALTHY release; the abandoned-image sweep removes the unused digest                                                                                                                                                                  |

**Rollback of every production-facing change:**

- Code: revert the PR. Flags off restores today's behavior, because nothing else reads the new code.
- Host: `uninstall-builder.sh` stops and disables the unit, removes the polkit rule, nftables table, AppArmor profile and store image, and keeps a backup.
- Config: unset `BUILDER_CONTROL_ENABLED` and `BUILD_EXECUTOR`, then restart the worker.
- No step touches dockerd, app containers or nginx.

## 9. Owner decisions (2026-10-23)

1. **Builder location:** approved conditionally. A dedicated rootless BuildKit service on this
   host, for administrator-owned, trusted repositories using platform-generated templates only.
   Public self-service builds stay disabled. Generated templates do not make arbitrary
   repositories safe. Enforced: builds need a project owned by an `ADMIN` or `SUPER_ADMIN`.
2. **Memory:** reject builds when admission fails; thresholds are never overridden; no hardware
   purchase now. Enforced: the thresholds are code constants (`BUILDER_LIMITS`).
3. **Limits:** 1.5 GiB memory, no swap, 2 cores, 30 GB storage, 15 minutes, provisionally, for
   testing. They must be measured in Phase C and adjusted before activation.
4. **Builder stopped:** reject new multi-runtime builds at once with a clear error, keeping the
   Node.js workflow as it is.
5. **Roles:** super-admins Start, Stop and Emergency Stop; ordinary admins view status and use
   only the non-destructive registry check.
6. **Permissions:** environment flags stay the upper limit; database allowlists only narrow them
   and never override a disabled flag.
7. **Idle shutdown:** 30 minutes by default, set by super-admins (5–240); it never stops an
   active build.
8. **Privilege mechanism:** a narrowly scoped polkit rule for the builder unit only, approved
   conditionally: Phase C validates the authorization boundary, service identity and failure
   behavior. No privileged command is exposed to the web.
9. **GHCR:** proposed `ghcr.io/4hprojects/hellodeploy-builds`. Checked 2026-10-23: the prefix
   passes `USER_IMAGE_REGISTRY` validation; `4hprojects` is a **personal account**, so the GitHub
   Packages deletion mode needs `GHCR_PACKAGES_OWNER_TYPE=user`; whether the package name is free
   is unverified (the local `gh` token lacks `read:packages`). No package or credential created.
10. **Existing Node builder:** unchanged by this feature; see section 10.
11. **Leftover development builder:** removed after confirming it was unused (section 1).

## 10. Existing Node builder: risks and a separate hardening phase

Recorded, not changed by this feature. `buildx_buildkit_hellodeploy-builder0` runs on the
production Docker daemon with the `docker-container` driver, **privileged**, with a 2 GiB memory
limit (no swap), **no CPU or PID limit**, no cache garbage-collection limit (18.7 GB of build
cache, 14.6 GB reclaimable), and `--restart unless-stopped`. Owner build commands run in it.

Proposed separate phase (its own branch, PR and rollback):

- Add `--driver-opt cpu-quota`/`cpu-period` and a PID limit when `ensureBuildBuilder` creates the
  builder, plus a `buildkitd.toml` GC policy; recreate the builder in a maintenance window.
- Regression tests: the exact `buildx create` argument vector, and the flags-off smoke matrix
  (static, React, Vue, Express, Node, rollback, failure cases) before and after.
- Rollback: `docker buildx rm hellodeploy-builder`; the worker recreates it with the previous
  options on its next start (`ensureBuildBuilder`).

## 11. Phase B implementation (2026-10-23, `feat/builder-control`)

Everything below is off unless `BUILDER_CONTROL_ENABLED=true`, which production does not set.
No BuildKit was installed or started, no pilot flag was enabled, and no production
configuration changed.

**Shared rules** (`packages/contracts/src/builder-control.js`): builder states and control
actions; `BUILDER_LIMITS` (the code-constant thresholds); `evaluateBuilderAdmission` and
`evaluateBuilderPressure`, which fail closed on missing readings; `evaluateBuilderEligibility`
(owner images refused, administrator-owned projects only, database allowlist required);
`isIsolatedBuilderEndpoint`; settings normalization that defaults to every runtime off.

**Worker** (`apps/worker/src/builder/`):

- `builder-controller.js`: the state machine, admission before start and before every build, a
  build lease with an abort signal, monitoring every 5 s (memory, memory pressure, disk, unit
  health, a watchdog at timeout + 60 s), idle shutdown that never stops a running build, Stop
  that refuses during a build, Emergency Stop that cancels and SIGKILLs, reconciliation after a
  restart, and re-reading the requester's role from the database for every control job.
- `unit-control.js`: `systemctl --no-ask-password start|stop|kill|is-active` for the one
  configured unit. `host-resources.js`: `/proc/meminfo`, `/proc/pressure/memory`, `statfs`,
  and the unit's cgroup `memory.current`. `interrupted-builds.js`: fails builder deployments
  a crash left mid-build. `builder-runtime.js`: wiring, with 30 s timeouts on the builder and
  registry probes.
- `build.js`: the S1 check (`parseBuildxInspect`; `remote` driver at the configured,
  isolated address) and cancellation of the build and push through an `AbortSignal`.
- `build-deployment.job.js`: the builder gate runs before any clone, so a refused build frees
  the deployment queue at once; only builder strategies take the on-demand path, with
  `BUILDER_CONTROL_BUILDX_NAME`; legacy builds keep `BUILD_EXECUTOR` and `BUILD_BUILDER_NAME`.
- `runtime.js`: a separate `builder-control` BullMQ consumer, a 15 s status tick that
  publishes to Redis (`builder:status`, 120 s TTL), and startup reconciliation.
- `config/env.js`: the `BUILDER_CONTROL_*` settings and their validation; pilot flags accept
  builder control as their isolated build path.

**Web:** `builder-control.service.js` (status read that fails closed when stale, settings
capped by the environment, control requests, the deployment gate called before queueing in
`createDeployment` and `retryDeployment`), `builder-control.controller.js`, `/admin/builder`
routes (404 while disabled), the Build Service page, a Server-page card, and a sidebar link.

**Failure codes:** `BUILDER_OFFLINE`, `BUILDER_INSUFFICIENT_RESOURCES`,
`BUILDER_PROJECT_NOT_ALLOWED`, `BUILD_CANCELLED`, `WORKER_INTERRUPTED`, each with
plain-language copy.

**What Phase B cannot prove** (Phase C, live): that the systemd caps hold under a real build;
that the polkit rule admits only this unit and only the worker; that the builder user cannot
reach the Docker socket, Redis, MongoDB or the nginx helper; real `buildx inspect` output for a
rootless remote builder; GHCR push, pull and deletion for `4hprojects/hellodeploy-builds`;
and peak build memory per framework.

### Updated resource estimates

| Item                   | Estimate                                                          | Basis                                                   |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| Builder idle           | about 60–100 MB (buildkitd, rootlesskit, slirp4netns)             | upstream rootless BuildKit; to be measured in Phase C   |
| Builder during a build | capped at 1,536 MB, no swap                                       | systemd `MemoryMax`/`MemorySwapMax`                     |
| Admission needs        | 2,560 MB available, 512 MB free swap, 20 GB disk, 5 GB cache free | `BUILDER_LIMITS`                                        |
| Today's host           | 1,284 MB available, swap 0 MB free after the leftover removal     | measured 2026-10-23; **every start would be refused**   |
| Practical prerequisite | about 1.3 GB more available memory, mostly the desktop session    | VS Code, Chrome and Claude hold about 3 GB              |
| Next.js standard build | likely 700 MB–1.3 GB                                              | unmeasured; first Phase C measurement                   |
| Java (Gradle/Maven)    | may exceed 1.5 GB                                                 | unmeasured; may need a higher cap or must stay disabled |
| Disk                   | 30 GB fixed store image, out of 801 GB free                       | no effect on app storage                                |

## 12. Phase C results (2026-10-25)

Host install, `verify-builder.sh`, runbook step 7, and live isolated tests are complete; see
`EVIDENCE.md` (2026-10-25). Every scenario in section 8 behaved as designed on real
infrastructure. A failed start was covered by the unit tests and the S1 check, not by a live run.

**Measured resources** (replacing the section 11 estimates where measured):

| Item                               | Measured                                                 |
| ---------------------------------- | -------------------------------------------------------- |
| Builder idle                       | 92–128 MiB                                               |
| Next.js 16 standalone build        | 1,255 MiB peak, 3 min 44 s cold; cached rebuilds seconds |
| Host available memory during build | never below 2,375 MB                                     |
| Over-limit build                   | worker cancels at host pressure before systemd-oomd acts |

**Before Phase D** (activation needs owner approval):

1. ~~Fix the referrers fallback leak~~: done (cleanup deletes untagged indexes whose every
   listed manifest is gone; verified live on GHCR).
2. ~~Reinstall the unit for `SuccessExitStatus=1`~~: done; `verify-builder.sh` passed all
   36 checks.
3. The production worker gains the builder groups only at its next restart (polkit checks the
   process's own groups); activation therefore happens through a normal `upgrade.sh` restart.
4. `REGISTRY_DELETE_API=github-packages`, `GHCR_PACKAGES_OWNER_TYPE=user`, a long-lived worker
   token file (`read:packages`, `delete:packages`) and the worker's GHCR login replace the Phase C
   test token, which is then revoked.
5. Watch the 5% memory-pressure cancel threshold on real pilot builds: it cancelled a 2 GB
   build correctly and did not cancel a normal Next.js build, but it is close to the limit.
6. Java builds are still unmeasured and should stay disabled until measured.
