# Builder Control Design

Status: Proposed (Phase A, 2026-10-23). Phase B starts only after the owner answers the
decisions in section 9. Nothing here is implemented, and every pilot flag stays off.

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
| Leftover               | `hellodeploy-dev-builder` from the 2026-10-20 smoke runs, still running (1 GiB limit)                                                                                                                                           |

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
- **No fallback.** The executor stays `remote-buildkit`, pointed at the buildkitd socket with the `remote` driver. The S1 fix checks that the builder's driver is `remote` and that its endpoint is the configured socket, both when the worker starts and before every build.
- **A separate daemon.** buildkitd is not the production Docker daemon. Starting, stopping or killing it cannot restart dockerd or touch app containers, networks or nginx.
- **Least-privilege control.** The web only enqueues control jobs. The worker manages exactly one systemd unit through a polkit rule. No new root daemon. The nginx-helper pattern is the alternative if polkit proves awkward.
- **Secrets.** Only `public-build-env.js` values reach builds, as today. GHCR credentials stay in the worker's credential store. The builder user has no Docker group, no Mongo or Redis access, and no `/opt/hellodeploy` read.
- **Owner Dockerfile and prebuilt-image pilots stay off.** A builder sharing the kernel is acceptable only for the platform's own generated templates.

**Admin interface:** a new card on `/admin/server`, plus `/admin/builder`.

- Status: Disabled, Stopped, Starting, Ready, Building, Stopping, Failed. Also health, the last error, uptime and the idle countdown.
- **Start** and **Stop** (super-admin). **Emergency Stop** (any admin): it cancels the active build and SIGKILLs the unit.
- Active and queued versioned builds, from BullMQ jobs whose strategy is not legacy.
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
5. On the worker and web, set `BUILDER_CONTROL_ENABLED=true`, `BUILD_EXECUTOR=remote-buildkit` and the builder name. All pilot flags stay off.
6. Start the builder and stop it. Confirm the apps answered 200 throughout, with containers and networks unchanged.
7. Enable `MULTIRUNTIME_NEXT_V1` for one allowlisted project. Deploy it and roll it back.
8. Watch it for 7 days: idle shutdown works, and no admission or monitor events touch the apps.

## 8. Recovery and rollback

| Scenario                               | Expected behavior (tested in Phase C)                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BuildKit fails to start                | State becomes Failed with the reason; builds are rejected with `BUILDER_OFFLINE`; apps untouched                                                                                                                                |
| BuildKit crashes during a build        | The build fails (`BUILD_FAILED`); the live release stays; the unit is not restarted automatically                                                                                                                               |
| GHCR unavailable                       | The push fails, so the build fails; the live release stays; the connectivity card shows the error; the abandoned sweep cleans up partial pushes                                                                                 |
| Host memory pressure                   | Admission rejects, or the monitor cancels; oomd or the cgroup kills the builder, never an app                                                                                                                                   |
| Disk near capacity                     | Admission rejects; GC runs; the store image caps growth; Emergency Stop plus "Prune cache"                                                                                                                                      |
| Admin stops the builder during a build | Stop cancels the build (deployment FAILED, "stopped by an administrator"); Emergency Stop SIGKILLs the unit                                                                                                                     |
| Worker restarts unexpectedly           | The client dies, so BuildKit cancels the solve. **New:** at startup the worker marks this worker's stale `BUILDING` deployments FAILED (`WORKER_INTERRUPTED`) and leaves releases alone. The idle timer stops the builder later |
| Deploy fails after the image was built | The existing pipeline keeps the previous HEALTHY release; the abandoned-image sweep removes the unused digest                                                                                                                   |

**Rollback of every production-facing change:**

- Code: revert the PR. Flags off restores today's behavior, because nothing else reads the new code.
- Host: `uninstall-builder.sh` stops and disables the unit, removes the polkit rule, nftables table, AppArmor profile and store image, and keeps a backup.
- Config: unset `BUILDER_CONTROL_ENABLED` and `BUILD_EXECUTOR`, then restart the worker.
- No step touches dockerd, app containers or nginx.

## 9. Decisions for the owner (recommendation first)

1. **Builder location:** same-host rootless for generated templates, with remote moved to later. _Recommend same-host._
2. **Memory:** builds run only when admission passes, so close desktop apps or add RAM. _Recommend accepting rejections now and considering a RAM upgrade._
3. **Caps:** 1.5 GiB memory, 2 cores, 30 GB store, 15 min timeout. _Recommend these._
4. **Builder stopped:** reject at once, or wait in the queue. _Recommend rejecting at once, so Node deploys are never blocked._
5. **Roles:** super-admin for Start and Stop; any admin for Emergency Stop. _Recommend this._
6. **Permissions:** the env flag stays the upper limit and admins edit a DB allowlist within it. _Recommend this._
7. **Idle shutdown default:** 30 min. _Recommend this._
8. **Privilege mechanism:** a polkit rule for one unit, or a root helper like the nginx helper. _Recommend polkit._
9. **GHCR:** the account or org and the private repository name. A classic PAT if step 7 needs the packages API.
10. **The existing privileged Node builder** (no CPU, PID or GC limits; 18.7 GB cache): harden it in a separate, later change with its own rollback, or leave it. _Recommend later and separate. It is out of scope here._
11. **Removing the leftover `hellodeploy-dev-builder`** container. _Recommend removing it._
