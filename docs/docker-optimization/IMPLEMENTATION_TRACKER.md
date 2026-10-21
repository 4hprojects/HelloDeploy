# Docker Optimization Implementation Tracker

Updated: 2026-10-10

This document is the operational status monitor for the user-application Docker
optimization initiative. The requirements and safety boundaries remain in
[`00_MASTER_IMPLEMENTATION_PLAN.md`](00_MASTER_IMPLEMENTATION_PLAN.md). Update this
tracker after each meaningful implementation or verification step; keep the
repository-wide tracker limited to summary status and a link here.

## Current Status

| Field            | Value                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall status   | P0 complete; P1 exit gate met; H1, H6, F7 and F8 resolved. All pre-push gates green (lint, format, 1362/1362 tests, audit). Ready to commit and push, pending operator go-ahead |
| Current phase    | P1 — Safe Templates and Build Context (Ready for Review; uncommitted)                                                                                                           |
| Current task     | Operator go-ahead to commit the Docker changes separately from the UI/UX work and push                                                                                          |
| Next action      | Commit, push, upgrade per the release procedure; then set `BUILD_BUILDER_NAME=hellodeploy-builder` on the worker (`OPERATOR_RUNBOOK.md`); then the P2 benchmarks / canary       |
| Rollout state    | Disabled; default `USER_IMAGE_TEMPLATE_VERSION=legacy` and empty `USER_IMAGE_OPTIMIZED_PROJECT_IDS`; `optimized-v1` never built on a real daemon                                |
| Production state | Push-ready at safe defaults (optimized-v1 off, builder opt-in). STATIC exclusions, npm-only detection and `.env` warnings take effect on deploy                                 |

## Status Model and Evidence Contract

Every phase uses one of these states: `Not Started`, `In Progress`, `Blocked`,
`Ready for Review`, or `Complete`.

Every status change must record:

- acceptance criteria completed;
- exact verification commands and results;
- whether evidence is local, CI, staging, supported-host, pilot, or production;
- known limitations and environmental blockers;
- any operator approval required; and
- the exact next action.

Unit tests, mocked system boundaries, and a reachable dashboard are not substitutes
for real Docker build, activation, routing, rollback, or supported-host evidence.

## Phase Overview

| Phase                                 | Status                         | Outcome                                                                               | Entry gate                                             | Completion gate                                                                                               |
| ------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| P0 — Audit and Decisions              | Complete                       | Verified baseline, gap report, and approved design decisions                          | Current repository and host can be inspected read-only | Operator reviews `AUDIT_REPORT.md` and approves the opt-in design                                             |
| P1 — Safe Templates and Build Context | Ready for Review (uncommitted) | Exact legacy path plus guarded `optimized-v1` templates and platform-owned exclusions | P0 decisions approved                                  | Generator, context, lifecycle, and security tests pass; changed runtimes build in isolated Docker             |
| P2 — Cache Evaluation                 | Not Started                    | Evidence-based layer-cache and optional BuildKit cache policy                         | P1 fixtures build reliably                             | Cold/warm/change benchmarks demonstrate value without isolation, quota, or resource regression                |
| P3 — Build Metrics                    | Not Started                    | Optional trustworthy build and image measurements                                     | Structured inspection contract approved                | Old records remain readable; telemetry failures cannot fail deployments; labels are accurate                  |
| P4 — Retention and Cleanup Safety     | Not Started                    | Dry-run, locked, bounded, rollback-safe cleanup                                       | P3 image identity is reliable                          | Active, retained, rollback, queued, building, and Docker-referenced images are protected in tests and staging |
| P5 — Validation and Rollout           | Not Started                    | Supported-runtime proof, canary, rollback, and rollout decision                       | Legacy end-to-end gate and P1–P4 review gates pass     | Representative runtimes pass real build/serve/rollback checks and owner approves default expansion            |

## P0 — Audit and Decisions

### Checklist

- [x] Read the optimization pack, architecture, readiness tracker, worker build path,
      deployment model, retention code, configuration, and related tests.
- [x] Confirm repository HEAD used for the initial local inspection:
      `ea999939035cd231c277cada5243c457e73b3e42`.
- [x] Run the focused local baseline for templates, build context, build orchestration,
      retention, and dangling-image cleanup.
- [x] Check local Node, npm, Docker CLI, Buildx, memory, disk, and daemon access.
- [x] Inspect a Docker-capable host with the read-only commands defined in
      `01_CODE_AUDIT_AND_DECISIONS.md` (2026-10-10; the host is production-shared;
      see `AUDIT_REPORT.md` → Host Audit).
- [x] Record current image, layer-cache, build-cache, and disk footprint without pruning.
- [x] Produce `AUDIT_REPORT.md`, separating observed code, documentation claims, and
      live-host evidence.
- [x] Obtain operator review of the audit and opt-in design (approved as written
      2026-10-10).

### Decisions to lock in the audit

- Initial package-manager contract: npm with `package-lock.json`; Yarn and pnpm are
  not advertised as build-compatible until their installers are implemented and tested.
- Template selection: retain exact `legacy` behavior and introduce `optimized-v1` as
  an operator-controlled, default-off path with a bounded canary allowlist.
- Node/Express eligibility: optimize only when package scripts and required build
  outputs are statically understood; ambiguity falls back to `legacy` with a reason.
- BuildKit: detect capability and fall back to the established `docker build` path;
  cache mounts remain disabled until P2 evidence and storage bounds exist.
- Base images: retain the current Node 22 Alpine and unprivileged Nginx images for the
  first comparison; evaluate Debian Slim separately rather than default-switching.
- Metrics: use structured Docker inspection and omit values that cannot be obtained
  reliably; never infer physical reclaimed disk from logical image size.
- Cleanup: require managed labels, database references, Docker reference checks, a
  shared lock, dry-run parity, and bounded age/count/bytes before expanded pruning.
- Benchmark thresholds: define per runtime after baseline measurements; do not adopt
  a universal percentage-reduction promise.

## P1 — Safe Templates and Build Context

State: In Progress. The code below exists **uncommitted** in the worktree on
`feat/admin-user-management` (HEAD `ea99993`). It was written before the P0 exit gate
(host audit plus operator approval), so it must not merge until the P0 decisions are
approved. Finding IDs (F1–F7) refer to `AUDIT_REPORT.md` → P1 Worktree Review.

Implemented (uncommitted, local mocked-boundary tests only):

- [x] Template policy `legacy | optimized-v1` with env parsing and a canary allowlist
      of up to 100 project ObjectIds; default `legacy`
      (`apps/worker/src/deployment/template-policy.js`, `apps/worker/src/config/env.js`,
      `docs/ENVIRONMENT.md`, `.env.example`).
- [x] Build-profile resolver with legacy fallback plus a logged reason when
      `package.json`/`package-lock.json` is missing, `package.json` is invalid, a root
      install/prepare lifecycle script exists, or a Node `build` script exists
      (`apps/worker/src/deployment/build-profile.js`).
- [x] Dependency-first two-stage Node/Express template for `optimized-v1`
      (`dockerfile-generator.js` `generateNode`).
- [x] Platform-owned `.dockerignore` written after sanitization, for `optimized-v1`
      only (`build-context.js` `writePlatformDockerignore`).
- [x] Next.js `optimized-v1` requires statically confirmed `output: 'standalone'`
      (otherwise the build fails as `BUILD_CONTEXT_INVALID`) and creates `/app/public`
      when it is absent.
- [x] Detection enforces npm only: a missing `package-lock.json`, or a Yarn/pnpm
      lockfile, is now an ERROR (decision #3 put into effect before approval; see the
      open decisions below).
- [x] Wiring in `build-deployment.job.js`, with tests in `build-profile.test.js`,
      `template-policy.test.js`, and additions to the generator, build-context,
      build-job, and detection tests.

Review findings resolved on 2026-10-10 (uncommitted, local tests only):

- [x] **F1:** legacy Next.js output is byte-identical again. Golden fixtures captured
      from HEAD `ea99993` for all six runtimes
      (`tests/deployment/fixtures/legacy-dockerfiles/`) are asserted in
      `dockerfile-generator.test.js`. A mutation check confirmed the old blank-line bug
      fails the Next.js golden test.
- [x] **F3:** Node `optimized-v1` falls back to legacy, with a reason, for npm
      `workspaces`, `file:`/`link:` specs in dependencies, optionalDependencies, or
      devDependencies, and for a committed `.npmrc`.
- [x] **F2 (decision a):** `optimized-v1` keeps excluding `.env*`. The build job now
      logs a VALIDATE WARN naming the excluded root-level `.env*` files (names only,
      never contents) and points users to HelloDeploy environment variables
      (`listRootEnvFiles` in `build-context.js`). Nested `.env*` files are still
      excluded but not named, because frameworks and dotenv read from the project root.
- [x] **F4:** the platform `.dockerignore` lists `Dockerfile` and `.dockerignore`, so
      `COPY .` no longer copies them into `optimized-v1` images. Docker still reads
      both from the context. Legacy static images still serve `/Dockerfile`, unchanged
      by design.
- [x] **F6:** the build job uses `ImageTemplateVersion.OPTIMIZED_V1`; Next.js
      ineligibility throws `BuildProfileError` (`code: BUILD_CONTEXT_INVALID`); the
      standalone check covers `next.config.cjs` and `next.config.mts`. Accepted as-is:
      the global `coverage`/`.cache` exclusions (treated as generated artifacts, not
      deployable content). Revisit if a static site needs them.

Remaining before P1 can be Ready for Review:

- [ ] Preserve non-root runtime users, public-build-variable restrictions, resource
      limits, timeouts, safe CLI arrays, and the 500 MB context ceiling. Unchanged by
      the code review; re-verify in real builds.
- [x] Build at least one representative fixture per changed runtime on a real Docker
      daemon (P1 exit gate). Done 2026-10-10: Static, React, Vue, Express, Next.js, and a
      postinstall-fallback Express fixture all build, serve, and run non-root under
      `optimized-v1`; see `BENCHMARK_RESULTS.md`.
- [x] F8 decided (accept plus warning) and H6 (STATIC exclusions) and H1 (opt-in
      memory-limited builder) implemented and verified on a real daemon; see
      `BENCHMARK_RESULTS.md` → H6 / H1 / F8 Fix Verification.
- [ ] Split the Docker optimization files from the unrelated UI/UX worktree changes
      into their own reviewable commit or PR.

### Operator decisions

1. **Approved 2026-10-10:** the twelve P0 decisions in `AUDIT_REPORT.md`, as written.
2. **Approved 2026-10-10:** F2 option (a): exclude `.env*` and log a warning.
3. **Decided 2026-10-10 (delegated): F7, keep** the npm-only ERROR. `npm ci` fails
   without `package-lock.json` anyway, so detection now reports it earlier and
   truthfully.
4. **Done 2026-10-10:** the operator account is in the `docker` group and daemon access works after
   a fresh login.
5. **Approved and done 2026-10-10:** fixture builds on this production-shared host. 12
   `hdfixture-*` images were built and removed; build cache grew by 1.29 GB (no prune);
   production containers were unaffected.
6. **Approved and done 2026-10-10:** H1 check. Confirmed that the memory limit is not
   enforced.
7. **Decided and done 2026-10-10 (delegated): H6.** Write the platform `.dockerignore`
   for every STATIC build, legacy included. Static sites never read `.env`, and
   anything in the context is publicly downloadable, so there is no compatibility cost.
   The fix is at the image source, independent of optional host nginx. Rejected: a
   default-on optimized-v1 for STATIC (it waits for rollout) and nginx dotfile rules
   (they need a custom image config or host nginx). No live static project existed at
   audit time.
8. **Decided and done 2026-10-10 (delegated): H1.** An opt-in dedicated
   `docker-container` buildx builder (`BUILD_BUILDER_NAME`), created by the worker at
   startup with `BUILD_MEMORY_MB` as its container memory and swap limit. This is the
   only effective mechanism: embedded BuildKit runs inside `dockerd`, so a
   worker-service cgroup cannot reach build steps, and the legacy builder is
   deprecated. It is opt-in because the first builds are cold and `--load` adds time.
   **Recommended to enable in production** (see `OPERATOR_RUNBOOK.md`).
9. **Decided and done 2026-10-10 (delegated): F8.** Keep fallback = exact legacy for
   runtime compatibility (apps may load `.env` with dotenv); legacy Express/Node
   builds now warn that committed root `.env*` files ship in the image.

## P2 — Cache Evaluation

- [ ] Benchmark the existing Docker layer cache before adding a new cache mechanism.
- [ ] Compare cold, warm same-commit, source-only-change, and lockfile-change builds.
- [ ] Add optional BuildKit npm cache mounts only after capability detection, tenant
      isolation, age/size bounds, and resource-limit behavior are verified.
- [ ] Keep cache mounts disabled by default until measured benefit and safe cleanup are
      documented in `BENCHMARK_RESULTS.md`.

## P3 — Build Metrics

- [ ] Persist optional build start/completion/duration, context size, Docker image ID,
      logical image size, template, base-image, and cache metadata.
- [ ] **F5:** persist the resolved `templateVersion` and `fallbackReason` on the
      deployment record. Today they exist only as log events, so a canary has no
      queryable audit trail.
- [ ] Obtain image identity and size with structured `docker image inspect` output.
- [ ] Keep inspection and metric persistence best-effort so telemetry cannot turn a
      successful build into a failed deployment.
- [ ] Verify old deployment records remain readable and no metric contains credentials,
      private repository URLs, build-argument values, or full build logs.
- [ ] Add deployment-detail presentation only after backend measurements are proven.

## P4 — Retention and Cleanup Safety

- [ ] Implement a dry-run cleanup planner with the same candidate selection as apply.
- [ ] Coordinate build, rollback, and cleanup through an exclusive lock.
- [ ] Protect running containers, active releases, retained healthy releases, rollback
      targets, queued/building candidates, and any Docker-referenced image.
- [ ] Replace routine forced deletion with reference-aware removal.
- [ ] Add bounded managed-image and BuildKit-cache policies; never use routine
      `docker system prune -a --volumes`.

## P5 — Validation and Rollout

- [ ] Build and run representative Static, React, Vue, Express, Node.js, and Next.js
      fixtures at pinned commits, including lifecycle and native-dependency cases.
- [ ] Run lint, formatting, configuration validation, the full test suite, dependency
      audit, and focused security/worker checks on the candidate commit.
- [ ] Prove the existing legacy build, activation, routing, broken-candidate continuity,
      and retained-image rollback path on a supported host first.
- [ ] Canary exactly one approved project while retaining its previous healthy image.
- [ ] Observe the canary, exercise rollback, document results, and require owner approval
      before widening the allowlist or changing the default.

## Dependencies, Blockers, and User Setup

- Docker CLI `29.8.1` and Buildx `0.37.1` are installed locally, but the current user
  cannot access `/var/run/docker.sock`; the socket is owned by `root:docker` and only
  the `hellodeploy-worker` service account is currently a Docker-group member. Use a
  dedicated Docker-capable test identity or controlled staging runner rather than
  casually broadening root-equivalent Docker access.
- The local machine has ample disk space but, at the initial check, only about 1.5 GiB
  available memory and nearly exhausted swap. It is suitable for code/tests but not a
  trustworthy performance baseline until idle capacity is restored.
- The existing multi-area UI/UX worktree, including a deployment-model edit
  (`replacedDeploymentId`), must be preserved and coordinated before P3 schema changes.
  The uncommitted P1 Docker files share that worktree and branch
  (`feat/admin-user-management`), so commit them separately in their own reviewable
  change.
- Re-checked 2026-10-10: Docker daemon access is still denied for the operator account (not in
  the `docker` group).
- A controlled benchmark environment and pinned representative fixture repositories
  are required for all supported runtimes.
- Docker prune, cache deletion, worker restart, production configuration changes,
  release installation, and canary deployment require explicit operator authorization.
- Production rollout depends on completing the existing legacy real-deployment and
  rollback readiness gate in the repository-wide implementation tracker.

## Verification Evidence

| Date       | Classification                | Command or check                                                                                                                                                                                                                                                                                                                | Result                                                                                                                                           | Limitation                                                          |
| ---------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 2026-10-09 | Local                         | `node --version` / `npm --version`                                                                                                                                                                                                                                                                                              | Node `v22.22.1`; npm `11.17.0`                                                                                                                   | Toolchain only                                                      |
| 2026-10-09 | Local                         | `docker version`                                                                                                                                                                                                                                                                                                                | Client `29.8.1`; daemon access failed with permission denied                                                                                     | No daemon/server evidence                                           |
| 2026-10-09 | Local                         | `docker buildx version`                                                                                                                                                                                                                                                                                                         | Buildx `0.37.1` available                                                                                                                        | Builder capability not verified against daemon                      |
| 2026-10-09 | Local                         | `docker system df` and `docker image ls --digests`                                                                                                                                                                                                                                                                              | Both failed with permission denied on the Docker socket                                                                                          | Cache/image footprint unknown                                       |
| 2026-10-09 | Local                         | `free -h` / `df -h .`                                                                                                                                                                                                                                                                                                           | About 1.5 GiB memory available; 824 GiB disk available                                                                                           | Snapshot, not a benchmark condition                                 |
| 2026-10-09 | Local mocked-boundary tests   | `node --test tests/deployment/dockerfile-generator.test.js tests/security/build-context.test.js tests/worker/build-deployment.job.test.js tests/worker/retention.test.js tests/worker/cleanup-releases-prune.test.js`                                                                                                           | 64 passed, 0 failed                                                                                                                              | Does not execute Docker or prove deployment                         |
| 2026-10-10 | Local mocked-boundary tests   | `node --test tests/deployment/dockerfile-generator.test.js tests/security/build-context.test.js tests/worker/build-deployment.job.test.js tests/worker/build-profile.test.js tests/worker/template-policy.test.js tests/detection/detection.test.js tests/worker/retention.test.js tests/worker/cleanup-releases-prune.test.js` | 96 passed, 0 failed (includes uncommitted P1 tests)                                                                                              | Does not execute Docker; legacy-exactness test is tautological (F1) |
| 2026-10-10 | Local                         | `docker info`                                                                                                                                                                                                                                                                                                                   | Permission denied on `/var/run/docker.sock`                                                                                                      | `optimized-v1` has never been built on a real daemon                |
| 2026-10-10 | Local mocked-boundary tests   | `node --test tests/deployment/dockerfile-generator.test.js tests/security/build-context.test.js tests/worker/build-deployment.job.test.js tests/worker/build-profile.test.js tests/worker/template-policy.test.js tests/detection/detection.test.js`                                                                            | 105 passed, 0 failed (after F1–F6 fixes, incl. 6 legacy golden tests)                                                                            | Does not execute Docker                                             |
| 2026-10-10 | Local                         | Mutation check: Next.js generator with the old blank line vs the golden fixture                                                                                                                                                                                                                                                 | Mismatch detected (golden test would fail)                                                                                                       | Scratch copy only                                                   |
| 2026-10-10 | Local                         | `npx eslint` on changed worker and test files                                                                                                                                                                                                                                                                                   | No findings                                                                                                                                      | Changed files only                                                  |
| 2026-10-10 | Local                         | `docker info` after adding the operator account to the `docker` group                                                                                                                                                                                                                                                           | Still permission denied (session predates group change)                                                                                          | Restart VS Code to pick up the group                                |
| 2026-10-10 | Live host (production-shared) | `docker version` / `docker info` / `docker buildx ls` / `docker system df` / `docker image ls --digests` / `docker ps -a` / `free -h` / `df -h`                                                                                                                                                                                 | Docker 29.8.1, BuildKit v0.33.0, Ubuntu 26.04; build cache above 15 GB; ample disk (inventory omitted from public record)                        | Read-only snapshot; no builds or prunes                             |
| 2026-10-10 | Live host (production-shared) | Fixture builds via the real worker build functions (12 builds plus 1 H1 build), runtime curls, `id -u`, `ls /app`                                                                                                                                                                                                               | `optimized-v1` passed for all 5 changed runtimes plus the fallback; legacy Next.js without `public/` failed as predicted; H1 confirmed; H6 found | One run each; timings indicative only; see `BENCHMARK_RESULTS.md`   |
| 2026-10-10 | Live host (production-shared) | Real `handleBuildDeployment` runs: legacy STATIC; NODEJS memory hog and EXPRESS via a 512 MiB `hdfixture-builder`                                                                                                                                                                                                               | H6: `/.env`, `/Dockerfile` → 404. H1: hog killed (`ResourceExhausted`), normal build loaded and served. F8 warning emitted                       | Builder and images removed; production unchanged                    |
| 2026-10-10 | Local                         | Focused suite (11 files incl. new `tests/worker/build-args.test.js`)                                                                                                                                                                                                                                                            | 154 passed, 0 failed                                                                                                                             | —                                                                   |
| 2026-10-10 | Local                         | `npm run lint` / `npm run format:check`                                                                                                                                                                                                                                                                                         | Exit 0 / all files formatted                                                                                                                     | Whole repo, including unrelated UI/UX worktree changes              |
| 2026-10-10 | Local                         | `npm test` (full suite, requested by operator)                                                                                                                                                                                                                                                                                  | **1362 passed, 0 failed**, exit 0 (120 s)                                                                                                        | Includes unrelated UI/UX worktree changes                           |
| 2026-10-10 | Local                         | `npm audit --omit=dev --audit-level=moderate`                                                                                                                                                                                                                                                                                   | 0 vulnerabilities                                                                                                                                | —                                                                   |

## Rollout and Rollback Status

- Current effective template: `legacy` (the default; the allowlist is empty).
- Optimized template: implemented uncommitted in the worktree, not enabled anywhere,
  and never built on a real Docker daemon.
- Cache mounts: not implemented and not enabled.
- Canary: not authorized or scheduled.
- Rollback design: future optimized builds must fall back to `legacy` for subsequent
  builds, while build or health failures leave the current healthy container and route
  untouched. Retained rollback images must never depend on rebuilding during an incident.

## Change Log

- **2026-10-10 (findings resolved):** Under operator delegation, decided and
  implemented: H6 (platform `.dockerignore` for every STATIC build), H1 (opt-in
  `BUILD_BUILDER_NAME` memory-limited `docker-container` builder, ensured at worker
  startup; `createDockerBuildArgs` and `ensureBuildBuilder` in `build.js`), F8 (keep
  legacy; warn that legacy Node images ship committed `.env*`), and F7 (keep). Verified
  through the real build job on the host, then cleaned up. Added `OPERATOR_RUNBOOK.md`
  and updated `docs/ENVIRONMENT.md`. Gates: lint, format, 1362/1362 tests, audit
  clean. `.env.example` could not be edited (permission-protected path); it needs a
  `BUILD_BUILDER_NAME=` line added by hand.

- **2026-10-10 (fixture builds):** With operator approval, ran the P1 exit-gate fixture
  builds and the H1 check on the production-shared host. `optimized-v1` built, served,
  and ran non-root for Static, React, Vue, Express, and Next.js (without `public/`);
  the postinstall fixture fell back to legacy and kept its lifecycle output; React/Vue
  bundles are hash-identical to legacy. H1 is confirmed (768 MiB allocated under a
  256 MB limit). New findings: H6 (legacy static serves committed `.env`/`Dockerfile`
  with HTTP 200) and F8 (fallback projects keep `.env` in the image). All
  `hdfixture-*` images were removed, build cache grew by 1.29 GB (no prune), and
  production containers were unchanged. Results are in `BENCHMARK_RESULTS.md`.

- **2026-10-10 (host audit):** After a fresh login, ran the read-only Docker host audit.
  The host is production-shared (live user containers on the same daemon).
  Recorded H1–H5 in `AUDIT_REPORT.md`: H1, `docker build` is the buildx alias, so the
  `--memory` build limit is very likely ignored; H2, more than 15 GB of unpruned build cache;
  H3, a shared host makes benchmarks noisy and risky; H4, Node images ≈0.9–1 GB; H5,
  tag counts above the retention target are unverified. P0 marked Complete. No
  mutation performed.

- **2026-10-10 (later):** The operator approved the twelve P0 decisions and F2 option
  (a); F7 is still pending. Fixed F1 (legacy Next.js output byte-identical, plus six
  golden fixtures from HEAD), F3 (legacy fallback for workspaces, `file:`/`link:`
  deps, and `.npmrc`), F2 (WARN naming excluded root `.env*` files), F4
  (`Dockerfile`/`.dockerignore` excluded from `optimized-v1` image content), and F6
  (constant, `BuildProfileError`, `.cjs`/`.mts` Next.js configs). Focused tests: 105/105
  pass; eslint clean. The operator added the operator account to the `docker` group; this session
  cannot use it until VS Code restarts. All changes are uncommitted.

- **2026-10-10:** Refreshed the analysis against the worktree. Found uncommitted P1
  code that the 2026-10-09 entries did not record: the template policy, the build
  profile, the deps-first Node template, the platform `.dockerignore`, the Next.js
  standalone gate, and npm-only detection. Set P1 to In Progress (ahead of the P0
  gate). Recorded review findings F1–F7 in `AUDIT_REPORT.md`; F1 (legacy Next.js
  output is not byte-identical) and F3 (workspaces, `file:` deps, and `.npmrc` break
  the deps stage) block opt-in. Focused tests: 96/96 pass. Docker daemon still
  inaccessible. Documentation only; no code, Docker, or host state changed.

- **2026-10-09:** Completed the repository-side P0 gap report in `AUDIT_REPORT.md`.
  Confirmed the npm/lockfile mismatch, missing platform context exclusions, Next.js
  standalone/public assumptions, intentionally compatibility-first Node template,
  unconsumed/fragile image identity, absent build metrics, and cleanup force/locking
  risks. Recorded twelve proposed design decisions. P0 remains open for an authorized
  read-only Docker-host audit and operator review; no runtime or host state changed.
- **2026-10-09:** Created the operational tracker; recorded the initial repository audit,
  64-test focused baseline, Docker permission blocker, host-capacity caveat, readiness
  dependency, phase gates, and next action. No Docker daemon mutation, prune, service
  restart, production change, or deployment was performed.
