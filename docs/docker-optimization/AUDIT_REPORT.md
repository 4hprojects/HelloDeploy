# Docker Optimization P0 Audit Report

Date: 2026-10-09
Repository HEAD: `ea999939035cd231c277cada5243c457e73b3e42`
Status: Repository audit complete; Docker-capable host evidence and operator approval pending. P1 worktree review added 2026-10-10 (see end of report).

## Scope and Evidence Boundaries

This audit covers the code path that turns a hosted user repository into a Docker
image, activates it, and later removes retained artifacts. It does not authorize or
change the HelloDeploy web/worker topology, production services, Docker daemon,
running containers, images, caches, routes, or deployment defaults.

Evidence classifications used below:

- **Observed code:** directly inspected at the repository HEAD above, including
  existing uncommitted user work where noted.
- **Documentation claim:** stated by a blueprint, readiness document, or this
  optimization pack, but not independently proven on a live host by this audit.
- **Local evidence:** commands run on the current development host without Docker
  daemon access.
- **Supported-host evidence:** not yet available for this initiative.

The starting worktree contains an existing multi-area UI/UX change set. In
particular, `packages/database/src/models/deployment.model.js` already has an
uncommitted rollback-related field. That work is preserved and must be coordinated
before P3 adds optional build metrics to the same schema.

## End-to-End Build and Release Trace

1. `handleBuildDeployment()` loads a queued deployment, transitions it to
   `VALIDATING`, and loads its project and repository records.
2. The worker clones the exact commit into
   `BUILD_WORKSPACE_ROOT/<deploymentId>`. Private GitHub repositories use an
   installation token and remove `.git`; public GitHub repositories use the exact
   commit archive endpoint.
3. `prepareBuildContext()` scrubs escaping or broken symlinks, removes user
   Dockerfiles/Compose files and `.dockerignore`, measures the context, and rejects
   contexts above 500 MB.
4. The worker selects browser-public environment variables, calls
   `generateDockerfile()`, and writes the platform-controlled Dockerfile into the
   prepared context.
5. The deployment transitions to `BUILDING`; `buildDockerImage()` invokes
   `docker build` with a tag, HelloDeploy labels, public build arguments, a memory
   limit, the default Docker build network, an optional `--no-cache`, and a timeout.
6. A successful build transitions to `DEPLOYING`, records `imageTag`, removes the
   workspace, and enqueues `ACTIVATE_RELEASE` using the tag as its image identifier.
7. The shared release pipeline allocates a loopback port, creates the application
   network, injects runtime secrets, starts a constrained non-root container, performs
   startup and health checks, activates routes, persists the active deployment and
   `HEALTHY` status, and only then retires the previous container.
8. Activation schedules best-effort last-three-healthy retention. The separate
   `CLEANUP_RELEASES` job also removes excess releases, abandoned workspaces, old
   failed/cancelled image tags, and dangling images.

## Observed Code Findings

| Existing behavior                                                                                                                                                                                                                          | Code location                                                                                                                                                  | Identified risk or gap                                                                                                                                                                                                    | Evidence                                                                                                 | Proposed change                                                                                                                                                                                                                                                                     | Testing requirement                                                                                                                                                            | Priority         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Runtime detection recognizes `package-lock.json`, `yarn.lock`, or `pnpm-lock.yaml` as an acceptable lockfile, but every generated Node-based Dockerfile executes `npm ci`.                                                                 | `apps/web/src/services/detection.service.js:168-179`; `apps/worker/src/deployment/dockerfile-generator.js:112-163`                                             | Yarn/pnpm projects can be declared ready and then fail deterministically during build. Missing npm lockfiles are only warnings even though `npm ci` requires one.                                                         | Observed code; existing detection tests cover npm fixtures but not the mismatch.                         | Make npm plus `package-lock.json` the truthful initial contract. Detection should block unsupported package managers until a separately tested installer exists.                                                                                                                    | Detection, approval-readiness, UI message, and build-job tests for npm-only, Yarn-only, pnpm-only, and missing-lockfile repositories.                                          | P0/P1            |
| Build-context preparation removes platform-controlled Docker files and escaping symlinks, then enforces a 500 MB ceiling.                                                                                                                  | `apps/worker/src/deployment/build-context.js:5-149`                                                                                                            | Committed `.env*`, dependency directories, logs, caches, and coverage are not excluded. Static `COPY .` and Node source copies can therefore include unnecessary or sensitive committed files in an image.                | Observed code; current security tests cover forbidden files and symlinks, not sensitive-file exclusion.  | After sanitization, write a platform-owned `.dockerignore` excluding `.env*`, `.git`, `node_modules`, logs, caches, coverage, and forbidden Docker/Compose files. Never apply user negation patterns.                                                                               | Security tests for nested secrets, forbidden re-inclusion, required framework source, static assets, symlinks, and the size ceiling.                                           | P1 High          |
| Static images use unprivileged Nginx on port 8080; React/Vue already use a Node builder and Nginx runtime with the dependency manifests copied before source.                                                                              | `apps/worker/src/deployment/dockerfile-generator.js:104-125`                                                                                                   | Static `COPY .` sends all non-ignored context. React/Vue root lifecycle scripts can depend on source even though `npm ci` precedes `COPY . .`; changing the legacy output would introduce compatibility risk.             | Observed code; generator tests pass for template shape and non-root runtime.                             | Preserve the exact output as `legacy`. In `optimized-v1`, combine controlled context exclusions with explicit lifecycle compatibility checks and fall back when ambiguous.                                                                                                          | Golden legacy output, lifecycle fixtures, custom output directories, nested assets, browser-public build variables, and real container serving.                                | P1               |
| Next.js uses deps, builder, and standalone runtime stages, then unconditionally copies `.next/standalone`, `.next/static`, and `public`.                                                                                                   | `apps/worker/src/deployment/dockerfile-generator.js:128-151`; detection fetches Next config but does not validate standalone output.                           | Repositories without `output: 'standalone'` or without `public/` fail late with an opaque Docker copy error.                                                                                                              | Observed code and generator tests; no real Docker fixture evidence.                                      | Keep legacy unchanged. For `optimized-v1`, require a verifiable standalone profile, create a safe empty `public/` source when absent, and fail validation clearly when standalone eligibility is unknown.                                                                           | Config variants, dynamic/ambiguous configs, missing `public/`, public build variables, standalone startup, non-root writes, and real health checks.                            | P1 High          |
| Express/Node copies source before `npm ci --omit=dev`.                                                                                                                                                                                     | `apps/worker/src/deployment/dockerfile-generator.js:154-168`                                                                                                   | This preserves source-dependent lifecycle scripts but invalidates the dependency layer on every source edit. Omitting dev dependencies can break root lifecycle/build scripts, as already documented for HelloUniversity. | Observed code plus the explicit regression assertion in `tests/deployment/dockerfile-generator.test.js`. | Preserve as `legacy`. Initially select optimized dependency-first output only for npm projects with no root install/prepare lifecycle and no build step; use legacy for all ambiguous cases and record the reason. Add a separate build/prune profile only after fixtures prove it. | Plain JS, source-dependent `postinstall`, dev-dependent lifecycle, TypeScript/build output, optional/native dependencies, compound start commands, and legacy fallback reason. | P1 High          |
| Build arguments are limited to browser-public names and passed through an argv array; runtime secrets are injected later.                                                                                                                  | `apps/worker/src/deployment/public-build-env.js`; `apps/worker/src/deployment/build.js:46-79`; `apps/worker/src/deployment/secrets.js`                         | Public values can still appear in builder history/cache and must never be copied into telemetry or platform logs. Future cache work could accidentally widen this boundary.                                               | Observed code and existing public-build-env/security tests.                                              | Keep the public-only allowlist and value-free platform logging. Treat cache contents as tenant-sensitive and prohibit secret mounts or private build arguments.                                                                                                                     | Image history, build log, error path, cache reuse, invalid-name, and private-variable exclusion checks.                                                                        | P1/P2 Security   |
| Docker builds use the daemon's ordinary layer cache unless `noCache` is true; no cache mount or builder capability path exists.                                                                                                            | `apps/worker/src/deployment/build.js:35-72`                                                                                                                    | BuildKit availability, `--memory` behavior, cache ownership, disk bounds, and cross-tenant cache behavior are unknown.                                                                                                    | Observed code; local Buildx binary exists but the daemon is inaccessible.                                | Benchmark the current layer cache first. Add default-off cache mounts only after a daemon capability probe and documented storage/isolation policy; transparently retain the current command when unsupported.                                                                      | Cold, warm, source-only, lockfile-only, template, and base-image changes; unsupported daemon fallback; timeout/cancellation and resource-limit checks.                         | P2               |
| Build success attempts to parse an image ID from human-readable stderr and falls back to the tag; the caller ignores the result. The schema has `imageDigest`, but it is not populated.                                                    | `apps/worker/src/deployment/build.js:85-117`; `apps/worker/src/jobs/build-deployment.job.js:330-368`; `packages/database/src/models/deployment.model.js:26-27` | Parsed IDs vary by builder output; tags are mutable identifiers; image size and trustworthy identity are unavailable to cleanup and UI.                                                                                   | Observed code and repository-wide search for `imageDigest`.                                              | After a successful build, use structured `docker image inspect` output for immutable image ID and logical size. Keep inspection best-effort and preserve `imageTag`; do not label a local image ID as a registry digest.                                                            | Structured-output parsing, inspection failure, old records, successful-build continuity, size units, and redaction tests.                                                      | P3 High          |
| Deployment records have general start/completion timestamps but no build-specific timings, context size, template, base-image, or cache profile.                                                                                           | `packages/database/src/models/deployment.model.js:25-33`; build job ignores `prepareBuildContext()`'s returned size.                                           | Optimization results cannot be compared reliably, and the existing context traversal is wasted for metrics.                                                                                                               | Observed code.                                                                                           | Add optional backward-compatible build fields and reuse the existing context-size result. Do not persist complete logs or build argument values.                                                                                                                                    | Old-document compatibility, partial telemetry, failed telemetry, timing boundaries, and sensitive-data absence.                                                                | P3               |
| Retention protects the active project pointer and database records in queued through healthy statuses, including shared rollback tags.                                                                                                     | `apps/worker/src/deployment/retention.js:7-124`; `apps/worker/src/jobs/cleanup-releases.job.js:41-143`                                                         | Release cleanup exists in two paths, uses a database check followed by deletion without a shared build/rollback lock, and does not recheck Docker references immediately before deletion.                                 | Observed code; focused retention tests pass.                                                             | Centralize candidate planning, add a shared lock and dry-run parity, and recheck database plus Docker references immediately before each deletion.                                                                                                                                  | Concurrent build/rollback/cleanup, active pointer, shared rollback tag, queued candidate, running container, and dry-run/apply parity.                                         | P4 High          |
| Image removal always executes `docker rmi --force`; cleanup also runs `docker image prune --force` and counts localized text lines.                                                                                                        | `apps/worker/src/deployment/build.js:130-172`; `apps/worker/src/jobs/cleanup-releases.job.js:143`                                                              | Forced removal can mask stale references or race another operation. Text parsing is not trustworthy telemetry. Expanded BuildKit pruning would increase the blast radius.                                                 | Observed code.                                                                                           | Use non-forced, reference-aware deletion for routine retention. Keep cleanup bounded to managed resources; use structured inspection and native filtered cache pruning only after host support is verified.                                                                         | Referenced-image refusal, race/recheck, idempotency, localized output independence, partial failure, and bounded filters.                                                      | P4 High          |
| The release pipeline health-checks before routing, checks cancellation/project state immediately before traffic moves, persists the new active release before retiring the old container, and treats old-container cleanup as best effort. | `apps/worker/src/deployment/pipeline.js:215-660`                                                                                                               | This is the rollback-safety boundary that template, metric, and cleanup work must not bypass. Route activation precedes the final database writes, so retries and incident handling remain important.                     | Observed code; mocked pipeline coverage exists, but supported-host proof is incomplete.                  | Do not couple optimization success to activation. Preserve the current state machine and old healthy image/container until the candidate is healthy and durable.                                                                                                                    | Broken build, unhealthy candidate, DB failure after routing, cancellation, route failure, rollback, and retained-image recovery on real Docker/Nginx.                          | Cross-phase gate |
| Worker concurrency defaults to one, with build timeout and memory settings already configurable.                                                                                                                                           | `apps/worker/src/config/env.js:30-50,132-140`                                                                                                                  | An 8 GB host can still experience pressure; BuildKit may not honor resource flags identically across builders.                                                                                                            | Observed code; current host capacity snapshot is not benchmark evidence.                                 | Keep sequential builds during evaluation and record actual cgroup/builder behavior before changing concurrency.                                                                                                                                                                     | Resource pressure, timeout kill, cancelled build, host recovery, and concurrency-one benchmarks.                                                                               | P2/P5            |

## Documentation Claims Requiring External Proof

| Claim                                                                                                                      | Source                                                | Current assessment                                                                                              | Required proof                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| The worker host can build and run all supported runtimes through the production routing path.                              | Blueprint architecture and readiness documents        | Not proven. The repository tracker records that the HelloUniversity attempts did not reach build or activation. | Successful legacy builds and routed health checks for Static, React, Vue, Express/Node, and supported Next.js on the supported host. |
| Non-root users, loopback binding, resource limits, secret isolation, cleanup, and rollback work as a complete live system. | Security blueprint and Batch 6 acceptance criteria    | Strong code/test coverage exists, but production or supported-host evidence is incomplete.                      | Inspect real containers, image history, process arguments, routes, failures, retained images, and rollback results.                  |
| Existing layer cache or BuildKit cache mounts materially improve build time or storage.                                    | Optimization proposal                                 | No benchmark evidence yet.                                                                                      | Same-machine, same-commit cold/warm/change trials with at least three iterations and documented cache state.                         |
| Image cleanup frees a defensible amount of disk per project.                                                               | Cleanup intent in operational docs                    | Logical image sizes share layers and cannot support that attribution.                                           | Docker disk accounting with explicit shared-layer and reclaimability caveats; do not promise per-project reclaimed bytes.            |
| Ubuntu 26.04 is a supported optimization benchmark/rollout target.                                                         | Existing readiness work treats it as a candidate gate | Not established by this initiative.                                                                             | Use the project's supported-host decision and readiness gates; do not let optimization silently approve the OS.                      |

## Local and Live-Host Findings

| Check                                     | Classification              | Result                                                                                            | Consequence                                                                                             |
| ----------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `node --version` / `npm --version`        | Local                       | Node `v22.22.1`; npm `11.17.0`                                                                    | Repository toolchain is available.                                                                      |
| `docker version`                          | Local                       | Docker client `29.8.1`; daemon connection denied on `/var/run/docker.sock`                        | No server, builder, image, container, or runtime claim can be made.                                     |
| `docker buildx version`                   | Local                       | Buildx `0.37.1` binary is installed                                                               | Binary presence does not prove a usable builder or supported cache flags.                               |
| Docker socket ownership/group             | Local                       | Socket is `root:docker`; only `hellodeploy-worker` is a Docker-group member, not the current user | Use a dedicated authorized runner or staging host; do not casually grant root-equivalent Docker access. |
| `docker system df` / image inventory      | Local                       | Permission denied                                                                                 | Image and cache footprint remain an open P0 host task.                                                  |
| `free -h` / `df -h .`                     | Local snapshot              | About 1.5 GiB memory available, swap nearly exhausted, about 824 GiB disk available               | Suitable for code/tests, not a trustworthy performance baseline in this state.                          |
| Focused Docker-path tests                 | Local mocked-boundary tests | 64 passed, 0 failed                                                                               | Confirms current unit/integration baseline only; Docker was not executed.                               |
| Supported staging/production Docker audit | Supported-host              | Not run                                                                                           | P0 cannot complete and P5 cannot begin without this evidence.                                           |

## Proposed Decision Record for Operator Review

1. **Template compatibility:** name the exact current behavior `legacy`; introduce
   `optimized-v1`; keep `legacy` as the default throughout P1–P5.
2. **Canary selection:** use worker-owned configuration with a default template plus a
   bounded project-ID allowlist. Users cannot select experimental templates directly.
3. **Package manager:** support npm with `package-lock.json` for this initiative.
   Yarn and pnpm become explicit validation errors until their complete install/cache
   behavior is implemented and tested.
4. **Node eligibility:** the first optimized Node profile is dependency-first only
   when no root install/prepare lifecycle and no build step exists. Everything else
   stays on legacy until a narrower tested profile is added.
5. **Next.js:** `optimized-v1` requires standalone output to be statically confirmed;
   ambiguous configurations fail clearly rather than guessing. An absent `public/`
   directory is supported.
6. **Base images:** retain `node:22-alpine` and
   `nginxinc/nginx-unprivileged:1.27-alpine` for the initial comparison. Debian Slim
   remains a separate compatibility experiment.
7. **Build context:** a platform-owned `.dockerignore` is mandatory for
   `optimized-v1`; `.env*` is always excluded and user ignore rules are never trusted
   or reintroduced.
8. **Cache mode:** keep explicit cache mounts off by default. Capability detection may
   enable an operator-controlled experiment; an unsupported host uses the current
   layer-cache path without changing deployment outcome.
9. **Metrics:** store optional build timings, context size, immutable local image ID,
   logical image size, template, base-image, and cache profile. Keep registry digest
   semantics separate and omit unavailable data.
10. **Cleanup:** routine retention uses non-forced deletion after locked database and
    Docker reference checks. Cache cleanup is dry-run-first, filtered, age/size bounded,
    and never includes volumes.
11. **Benchmark acceptance:** compare reliability, security, cold time, warm time,
    logical image size, and actual Docker disk use per runtime. Set go/no-go thresholds
    only after baseline data; no universal reduction percentage is promised.
12. **Rollout:** first prove the legacy path end-to-end, then canary one approved
    allowlisted project. Feature disablement affects only future builds; current healthy
    and retained rollback releases remain untouched.

## P0 Exit Gate and Exact Next Actions

Repository-side audit work is ready for review. P0 remains incomplete until both
actions below are satisfied:

1. On an authorized Docker-capable staging or supported host, capture the bounded
   read-only evidence from `01_CODE_AUDIT_AND_DECISIONS.md`: Docker server and builder
   versions, builder capability, image/cache/disk footprint, memory, filesystem
   capacity, and readiness state. Do not prune or modify the host.
2. The operator reviews and approves or amends the twelve decisions above. Approval
   authorizes P1 repository implementation only; it does not authorize Docker prune,
   service restart, release installation, live deployment, or production rollout.

## P1 Worktree Review (2026-10-10)

Repository HEAD is unchanged (`ea999939035cd231c277cada5243c457e73b3e42`), but the
worktree now contains **uncommitted P1 code** written before the P0 exit gate:
`apps/worker/src/deployment/template-policy.js`, `build-profile.js`, and changes to
`dockerfile-generator.js`, `build-context.js`, `build-deployment.job.js`,
`config/env.js`, `detection.service.js`, `docs/ENVIRONMENT.md`, `.env.example`, and
the related tests. The original P0 findings above still stand. This section reviews
the new code only.

Evidence: observed code plus local mocked-boundary tests (96 passed, 0 failed). Docker
daemon access is still denied, so none of this has been built on a real daemon.

| ID  | Existing behavior                                                                                                                  | Code location                                                                                                                                                                        | Identified risk or gap                                                                                                                                                                                                              | Evidence                                                           | Proposed change                                                                                                                                        | Testing requirement                                                                             | Priority    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ----------- |
| F1  | Next.js template interpolates `${ensurePublicDirectory ? 'RUN mkdir -p /app/public\n' : ''}` on its own line.                      | `apps/worker/src/deployment/dockerfile-generator.js:151`                                                                                                                             | Legacy Next.js output gains an extra blank line, so legacy is no longer byte-identical to HEAD. The legacy test compares omitted vs explicit `legacy`, which can never fail.                                                        | Observed: diffed against `git show HEAD:…dockerfile-generator.js`. | Emit the optional directive without an extra line. Capture HEAD output for every runtime as golden fixtures.                                           | Golden legacy snapshot per runtime (Static, React, Vue, Next.js, Express, Node.js).             | P1 Blocker  |
| F2  | `optimized-v1` writes a `.dockerignore` excluding `.env*` and `**/.env*` for every runtime.                                        | `apps/worker/src/deployment/build-context.js` (`PLATFORM_DOCKERIGNORE`)                                                                                                              | React/Vue/Next builds that read a committed `.env.production` (Vite/CRA/Next) produce different bundles than legacy. This is secure, but a silent behavior change.                                                                  | Observed code; no fixture covers committed frontend env files.     | Operator decision: keep excluding them, but log a WARN when `.env*` files are present (or fall back to legacy). Point users to public build variables. | Frontend fixture with committed `.env.production`; assert the exclusion plus a visible warning. | P1 Decision |
| F3  | Optimized Node deps stage copies only `package*.json` before `npm ci --omit=dev`.                                                  | `dockerfile-generator.js` `generateNode`; `build-profile.js`                                                                                                                         | npm `workspaces`, `file:`/`link:` dependencies, and a committed `.npmrc` (private registry/scopes) fail or change behavior. The profile resolver does not detect them, so it never falls back.                                      | Observed code; no tests for these shapes.                          | Fall back to legacy, with a reason, when `workspaces`, `file:`/`link:` specs, or `.npmrc` are present.                                                 | Profile tests per shape; real build of one workspace fixture on the legacy path.                | P1 Blocker  |
| F4  | Static runtime copies the whole context into the nginx html root.                                                                  | `dockerfile-generator.js` `generateStatic`                                                                                                                                           | The generated `Dockerfile` (legacy and optimized) and `.dockerignore` (optimized) are publicly served. This is low sensitivity (platform templates), but unnecessary exposure.                                                      | Observed code.                                                     | In `optimized-v1`, add `Dockerfile` and `.dockerignore` to the platform ignore list. Docker still reads both from the context.                         | Static fixture: `GET /Dockerfile` returns 404 under `optimized-v1`.                             | P1 Low      |
| F5  | Resolved template and fallback reason are emitted only as deployment log events.                                                   | `apps/worker/src/jobs/build-deployment.job.js`                                                                                                                                       | Canary analysis and support cannot query which template a deployment actually used.                                                                                                                                                 | Observed code; `deployment.model.js` has no such fields.           | Persist optional `templateVersion` and `fallbackReason` with the P3 metrics fields, coordinated with the pending `replacedDeploymentId` model edit.    | Old-record compatibility; persisted values for the optimized, fallback, and legacy paths.       | P3          |
| F6  | Assorted minor issues.                                                                                                             | Build job uses the literal `'optimized-v1'`; `build-profile.js` throws a plain `Error`; config list omits `next.config.cjs`/`.mts`; ignore list drops `coverage`/`.cache` everywhere | Inconsistency with `ImageTemplateVersion`; violates the typed-error rule; standalone Next.js configs in `.cjs`/`.mts` are wrongly rejected; static sites with a `coverage/` content folder lose it.                                 | Observed code.                                                     | Use the constant, a typed error, the extended config list, and root-only cache/coverage exclusions for static.                                         | Unit tests per item.                                                                            | P1 Low      |
| F7  | Detection now errors on a missing `package-lock.json` or a Yarn/pnpm lockfile, for all non-static runtimes regardless of template. | `apps/web/src/services/detection.service.js:168-179`                                                                                                                                 | Decision #3 is in effect before operator approval. Only detection runs (on demand via `detection.controller.js`) are affected; already-approved projects are not re-gated, and their `npm ci` would fail anyway without a lockfile. | Observed code; detection tests updated.                            | Operator ratifies or reverts the change. Note it in user-facing docs if kept.                                                                          | Existing detection tests; UI message check.                                                     | P0 Decision |

Process note: P1 code exists before the P0 exit gate. It must stay unmerged until the
twelve P0 decisions and F2/F7 are approved, and its P1 exit gate (a real-daemon build
per changed runtime) is still blocked by Docker access.

### Resolution status (2026-10-10)

The operator approved the twelve P0 decisions as written and chose F2 option (a).
F1, F2, F3, F4, and F6 are fixed in the uncommitted worktree, with local tests only
(105/105 focused tests pass). F5 remains P3 scope. F7 awaits the operator's
keep-or-revert answer and is kept in place for now. See `IMPLEMENTATION_TRACKER.md` →
P1 for the details and the remaining real-daemon exit gate.

## Host Audit (2026-10-10)

Read-only commands ran after the operator account joined the `docker` group. **The
audited host is production-shared:** live HelloDeploy user containers run on the same
Docker daemon. Nothing was pruned, built, pulled, started, or stopped. Host-specific
inventory (container names, ports, per-project image sizes, hardware) is deliberately
omitted from this public record.

| Check                | Classification     | Result                                                                                                                  |
| -------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `git rev-parse HEAD` | Local              | `ea999939035cd231c277cada5243c457e73b3e42` (uncommitted P1 work on top)                                                 |
| `docker version`     | Live host          | Client and server `29.8.1`, API `1.56`, linux/amd64                                                                     |
| `docker info`        | Live host          | Ubuntu 26.04 LTS, `overlayfs`, systemd cgroup driver, cgroup v2, small single host, no daemon warnings                  |
| `docker buildx ls`   | Live host          | Default builder uses the `docker` driver, BuildKit `v0.33.0`; `docker build` is an alias of `docker buildx build`       |
| `docker system df`   | Live host          | Images and running containers present; no volumes. **Build cache above 15 GB, none in use**                             |
| `docker image ls`    | Live host          | Release images carry the `hellodeploy.image=true` / `hellodeploy.tag` labels; Node release images are roughly 0.35–1 GB |
| `free -h` / `df -h`  | Live host snapshot | A few GiB of memory available with live apps running; ample free disk on the filesystem holding `/var/lib/docker`       |

### Host findings

| ID                                       | Finding                                                                                                                                                                                                                                                                                                                                                                   | Evidence                                                                                                                               | Consequence and proposed change                                                                                                                                                                                                                                                                                                                                  | Priority   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| H1 (**confirmed 2026-10-10**, see below) | `build.js` passes `--memory ${BUILD_MEMORY_MB}m` to `docker build`, which this host routes to `docker buildx build`. Buildx does not advertise `--memory`; it accepts the flag only for compatibility. **The build memory ceiling is very likely not enforced**, so `docs/ENVIRONMENT.md`'s "Memory ceiling for the docker build cgroup" is probably untrue on this host. | `docker build --help` shows the buildx usage with no `--memory` option; the default builder is BuildKit. Builds with the flag succeed. | Not proven by a controlled build. Confirm with a deliberately memory-hungry fixture build (needs approval), then enforce the limit at the right layer (for example a dedicated `docker-container` builder with a memory limit, or cgroup limits on the worker service) instead of the ignored flag. This is a pre-existing gap that is independent of templates. | P0/P2 High |
| H2                                       | More than 15 GB of BuildKit cache, none in use. Nothing in HelloDeploy prunes build cache; `CLEANUP_RELEASES` only runs `docker image prune`.                                                                                                                                                                                                                             | `docker system df`, `docker builder du`; `cleanup-releases.job.js`.                                                                    | The cache grows without bound. P4 needs a bounded, filtered `docker builder prune` policy (age plus `--keep-storage`) with dry-run reporting. Disk is plentiful today, so this is not urgent. Pruning needs explicit operator approval.                                                                                                                          | P4 Medium  |
| H3                                       | Production containers share a small single host with build and development work; only a few GiB of memory were available at audit time.                                                                                                                                                                                                                                   | `docker ps`, `free -h`.                                                                                                                | Benchmarks and fixture builds here would compete with live apps and with H1 (no build memory cap), and timing results would be noisy. Run P1/P2 fixture builds sequentially, off-peak, with operator approval, or on a separate host. Treat timing numbers from this host as indicative only.                                                                    | P1/P2 Gate |
| H4                                       | Node user images are large: up to about 1 GB, versus ≈160 MB for `node:22-alpine` itself.                                                                                                                                                                                                                                                                                 | `docker image ls`, `docker image inspect`.                                                                                             | This confirms a real optimization target for Express/Node. Note that the largest apps are likely legacy-fallback cases (for example a root `postinstall`), so `optimized-v1`'s deps-first profile may not shrink them; the future build/prune profile is what would. Record the per-project baseline in `BENCHMARK_RESULTS.md` before changing anything.         | P2/P5      |
| H5                                       | Some projects keep more image tags than the last-3-HEALTHY retention target.                                                                                                                                                                                                                                                                                              | `docker image ls`.                                                                                                                     | This may be correct (failed or rollback tags awaiting cleanup, or tags protected by records), but it is unverified. Reconcile against deployment records in P4 before any cleanup change. Do not delete anything manually.                                                                                                                                       | P4         |

### Fixture-build outcomes (2026-10-10)

Approved real-daemon fixture builds ran on this host. Full data is in
`BENCHMARK_RESULTS.md`.

- **H1 confirmed.** A build with `buildMemoryMb: 256` allocated 768 MiB without error
  or warning. `BUILD_MEMORY_MB` is not enforced under buildx/BuildKit, so user builds
  can contend with live application containers. Proposed fix (needs separate approval):
  run builds on a dedicated `docker-container` buildx builder whose BuildKit container
  has a memory limit, or put the worker and its build processes under a systemd/cgroup
  memory limit. Also correct `docs/ENVIRONMENT.md`. Priority: **High**.
- **H6 (new, security): legacy static images serve committed dotfiles.** The legacy
  static fixture answered `GET /.env` with **200**, and `GET /Dockerfile` with 200.
  Any live STATIC project with a committed `.env` exposes it publicly today. This is
  pre-existing and independent of `optimized-v1`, which returned 404 for both.
  Mitigation options for the operator: (a) make STATIC default to `optimized-v1` early
  (it has no fallback cases); (b) add a platform `.dockerignore` for `.env*` to the
  legacy static path only (a deliberate, documented legacy change); (c) add an nginx
  deny rule for dotfiles. Audit live static projects for committed `.env` files.
  Priority: **High**.
- **F8 (new): fallback projects keep committed `.env` in the image.** A project that
  falls back to `legacy` (for example one with `postinstall`) gets no platform
  `.dockerignore`, so its `.env` and `Dockerfile` remain in `/app`. This is consistent
  with "legacy unchanged" but leaves the F2 protection off for exactly the projects
  that fall back. Operator decision: apply the `.env*`-only exclusion to fallbacks as
  well, or accept. Priority: Medium.
- `optimized-v1` passed for Static, React, Vue, Express, and Next.js (without
  `public/`): images serve, run non-root (uid 101 or 1000), exclude `.env` and
  `Dockerfile`, and React/Vue bundles are hash-identical to legacy. The fallback path
  preserved `postinstall` behavior. Legacy Next.js without `public/` failed as
  predicted.

### Resolution of H1, H6, F7, F8 (2026-10-10)

Decided by the implementer under operator delegation; rationale is in
`IMPLEMENTATION_TRACKER.md` → Operator decisions.

- **H6, resolved:** every STATIC build (legacy included) now writes the platform
  `.dockerignore`. Verified through the real build job: `/.env`, `/Dockerfile`, and
  `/.dockerignore` return 404. The Dockerfile text is unchanged (golden tests pass).
  Existing static releases keep their old image until redeployed; no live static
  project existed at audit time.
- **H1, resolved (opt-in):** `BUILD_BUILDER_NAME` routes builds to a worker-created
  `docker-container` buildx builder whose container is capped at `BUILD_MEMORY_MB`
  (swap equal). Verified: a 768 MiB allocation fails under a 512 MiB builder; normal
  builds load into the local image store. Without the setting, the worker logs at
  startup that memory is not enforced.
- **F8, resolved as accept plus visibility:** fallback and legacy Node images keep
  committed `.env` (runtime compatibility), and the build log warns that they ship.
- **F7, kept:** the npm-only detection ERROR stays.
