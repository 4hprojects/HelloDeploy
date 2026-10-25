# Multi-Runtime Evidence

## Local repository evidence

- Baseline full suite: 1,787/1,789; both failures were the documented inherited-email
  readiness leak. Focused isolated readiness: 9/9.
- First integration run after contracts/worker changes: 137/137 targeted legacy and
  compatibility tests passed.
- New focused tests cover application-root traversal/symlink rejection, Next.js config
  extensions/mode recommendations, three templates, remote Buildx arguments, remote
  builder no-fallback behavior, registry command safety, strategy routing, and Nginx
  streaming buffering.
- Changed-area regression set: 178/178 passed.
- Security, worker, Nginx, operations, and installer suites: 740/740 passed with
  `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`.
- Full suite: 1,805/1,805 passed with `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`.
- `npm run lint`, `npm run format:check`, and `npm run config:check` passed.
- The tracked acceptance matrix contains 18 application roots and exact lockfiles.
  React/Vite, Vue/Vite, Next.js 14.2.35, Next.js 15.5.28, and Next.js 16.4.2
  production builds passed locally. Coordinator/fixture tests cover protected-config
  validation, mutation gates, polling/timeouts, route and streaming checks, Docker
  inspection, evidence sanitization, detection, lockfiles, and generated templates.
- Focused detection, deployment, worker, Nginx, security, operations, and installer
  suites: 975/975 passed. The full repository suite: 1,834/1,834 passed with dotenv
  disabled. The first full attempt found 39 third-party tests under fixture-local
  `node_modules`; test discovery now excludes generated dependency/framework output,
  its focused regression passes, and the full rerun is clean.

The full suite initially exposed one stale retry-payload assertion that still expected
the version-1 commit field. The test was updated to assert the version-2 identity-only
payload, its focused rerun passed 5/5, and the complete suite then passed 1,805/1,805.

## 2026-10-17 P0B hardening

- Focused guard, env-validation, build-context, image-platform, and acceptance files:
  79/79 passed with `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`.
- Changed-area suites (`tests/worker`, `security`, `deployment`, `operations`,
  `config`, `nginx`; 105 files): 895/895 passed with the same environment.
- `npm run lint`, `npm run format:check`, and `npm run config:check` passed.

## 2026-10-17 P1 close-out audit

Checked against the P1 brief (`03_PHASE_0_1_BASELINE_NEXTJS.md`):

| Requirement                                                                   | State               | Evidence                                                            |
| ----------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------- |
| npm lockfile detection, Yarn/pnpm rejected                                    | Repository-complete | `detection.service.js` lockfile check and tests                     |
| `next.config.*` output mode detection                                         | Repository-complete | five config extensions, comment-stripped static read                |
| `next start`, standalone, and static export                                   | Repository-complete | three versioned templates and tests                                 |
| Standalone `public` and `.next/static` assets                                 | Repository-complete | template copies both, with `public` created when absent             |
| Host and port binding                                                         | Fixed 2026-10-17    | `HOSTNAME=0.0.0.0` and `PORT` in both server images                 |
| Build-time vs runtime environment                                             | Repository-complete | only public-prefixed values reach the build (`public-build-env.js`) |
| Server Actions behind the proxy                                               | Repository-complete | Nginx forwards `Host` and `X-Forwarded-Host`                        |
| Plain-language unsupported messages                                           | Extended 2026-10-17 | start script, development-only `next`, custom `distDir`             |
| SSR, route handlers, Server Actions, `next/image`, middleware, ISR at runtime | Blocked (external)  | fixtures exist; needs the BuildKit/GHCR acceptance run              |

Tests: detection and Dockerfile generator files 78/78; every file that uses detection or
the generator 96/96, with `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`.

## 2026-10-17 P2 Python

| Requirement (`04_PHASE_2_PYTHON.md`)                            | State               | Evidence                                                                                                                                                                    |
| --------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strategy interface with unchanged release lifecycle             | Repository-complete | Python strategies use the existing snapshot, resolver, executor, and activation path                                                                                        |
| Framework detection from dependency metadata                    | Repository-complete | requirements/pyproject parsing; entry files only confirm the module                                                                                                         |
| Approved Python version and installer                           | Repository-complete | `.python-version`, 3.12/3.13, `requirements.txt` only                                                                                                                       |
| Non-root multi-stage image, `0.0.0.0` inside the container      | Repository-complete | venv builder, uid 10001 runtime, loopback host publish unchanged                                                                                                            |
| Server defaults with confirmed module                           | Repository-complete | gunicorn/uvicorn; validator and deploy guard require the module                                                                                                             |
| Django hosts, static files, migrations, external database       | Documented          | user guide; nothing runs implicitly                                                                                                                                         |
| No arbitrary pre-deploy shell in the free tier                  | Repository-complete | only the existing build command, inside the isolated builder                                                                                                                |
| UI: framework, module, port, health, env                        | Repository-complete | guided build form and render tests                                                                                                                                          |
| Fixtures and Node regressions                                   | Repository-complete | three pinned fixtures; PyPI metadata check confirmed every pin exists, supports its Python version, and closes its dependency tree, with Linux wheels for compiled packages |
| Live deploy, restart, rollback, redaction, quotas per framework | Blocked (external)  | needs the BuildKit/GHCR acceptance run                                                                                                                                      |

Tests, all with `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`: Python contracts 17/17;
detection 46/46; Dockerfile generator 57/57; Python build job 3/3; config validation
37/37 with the job file; web-facing suites (projects, UI, deployment, admin, security,
detection, API) 1,130/1,130; worker, deployment, security, config, contract, and detection
suites 796/796. Phase gate: 179 files plus API and contract suites, 1,636/1,636. Playwright browser tests were not run.

## 2026-10-17 P3A PHP

| Requirement (`05_PHASE_3_PHP_JAVA.md`, part A)                              | State               | Evidence                                                                                                                                     |
| --------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Detect `composer.json` and Laravel signatures                               | Repository-complete | `laravel/framework` plus `artisan`; WordPress rejected                                                                                       |
| Approved PHP versions and extensions                                        | Repository-complete | 8.3/8.4 from `require.php`; official extensions plus `pdo_mysql`                                                                             |
| Reproducible Composer install                                               | Repository-complete | lockfile required by detection and enforced in the build                                                                                     |
| Deterministic document root and server config                               | Repository-complete | `.` or `public`; generated Apache site, no FastCGI port                                                                                      |
| Laravel `public/`, env, APP_KEY, storage and cache permissions, asset build | Repository-complete | `public` enforced; APP_KEY documented as a secret; storage/cache owned by `www-data`; Node asset stage                                       |
| Queues, scheduler, persistent storage tracked separately                    | Documented          | unsupported in the pilot                                                                                                                     |
| External MySQL/MariaDB only                                                 | Documented          | no database is provisioned                                                                                                                   |
| Laravel fixture                                                             | Repository-complete | Laravel 13.37 skeleton from `composer create-project --no-scripts` (76 locked packages); `composer validate` passes; lock kept byte-for-byte |
| Live routing, logs, secrets, rollback, quotas, version errors               | Blocked (external)  | needs the BuildKit/GHCR acceptance run                                                                                                       |

Phase gate with `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`: 180 files plus API and
contract suites, 1,692/1,692; lint and format clean. The Composer fixture's
`composer.lock` has no packages; its `content-hash` was computed
with Composer's algorithm (sorted relevant keys, PHP-style JSON escaping).

## 2026-10-17 P3B Java

| Requirement (`05_PHASE_3_PHP_JAVA.md`, part B)                        | State               | Evidence                                                                 |
| --------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| Detect `pom.xml` or the Gradle wrapper and Spring Boot                | Repository-complete | parent/plugin/groupId for Maven; plugin id for Gradle; wrapper required  |
| Approved JDKs, verified toolchains, multi-stage build                 | Repository-complete | 17/21/25 Temurin JDK builder and JRE runtime                             |
| Locate the executable artifact deterministically                      | Repository-complete | exactly one non-plain jar with `BOOT-INF/`, copied to a platform name    |
| HTTP binding, port, and health via policy; Actuator only when present | Repository-complete | `SERVER_PORT=8080`; `/actuator/health` only with the Actuator starter    |
| Heap limited to a safe share of memory                                | Repository-complete | `MaxRAMPercentage=60`; 512 MB recommendation                             |
| Build CPU/memory measured on the 8 GB pilot host                      | Blocked (external)  | needs the remote builder                                                 |
| Fixtures: Maven and Gradle Spring Boot                                | Repository-complete | wrapper checksums verified against Maven Central and services.gradle.org |
| Live routing, logs, secrets, rollback, quotas, version errors         | Blocked (external)  | needs the BuildKit/GHCR acceptance run                                   |

Phase gate with `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`: 181 files plus API and
contract suites, 1,727/1,727; lint, format, and config checks clean.

## 2026-10-17 P4 owner images (then a stacked branch)

| Requirement (`06_PHASE_4_DOCKERFILE_REGISTRY.md`)                            | State                       | Evidence                                                           |
| ---------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------ |
| Build context and Dockerfile path restricted to the repository subtree       | Repository-complete         | contained reader; traversal, symlinked file, and link-escape tests |
| Safe `.dockerignore`, no host volumes, entitlements, host network, or socket | Repository-complete         | negation-free owner rules; static policy; remote builder only      |
| Dedicated isolated builder                                                   | Repository-complete in code | job refuses local builds; host itself is blocked externally        |
| No build-arg secrets                                                         | Repository-complete         | only public-prefixed values reach any build                        |
| Digest, user, volumes, size, platform checks; scan                           | Repository-complete         | activation policy tests; Trivy wrapper fails closed                |
| Runtime profile enforced regardless of the Dockerfile                        | Repository-complete         | unchanged container profile for every strategy                     |
| Approved registries, encrypted per-project credentials                       | Repository-complete         | docker.io and ghcr.io only; AES-GCM bound to project and registry  |
| Immutable digests; tags locked at deploy                                     | Repository-complete         | digest resolution; rollback reuses the recorded digest             |
| Reject redirects and credential leakage                                      | Repository-complete         | token host allowlist; `redirect: 'error'`; leak test               |
| Cleanup never removes an owner's image                                       | Repository-complete         | platform-repository deletion guard; ownership on failure           |
| Security review, isolated test host, adversarial live run                    | Blocked (external)          | runbook lists each fail-closed case                                |

Phase gate with `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test`: 186 files plus API and
contract suites, 1,820/1,820; lint, format, and config checks clean. The digest resolver completed Docker Hub's anonymous token flow during fixture creation and
resolved `nginxinc/nginx-unprivileged:1.27-alpine` to the pinned `oci-nginx` digest.

## 2026-10-18 Code review

A full-branch code review (`main...feat/multi-runtime-p4`) reported ten findings. Each was
verified against the code before any change; all ten were real. Eight base fixes each have
a test that failed before the fix (including a pre-upgrade project document with the field
genuinely absent). Changed-area suites after the fixes: 183 files plus API and contract
suites, 1,751/1,751; lint and format clean.

## 2026-10-18 P4 branch full suite

_Superseded 2026-10-20: #120 was retargeted to `main`, and CI and CodeQL ran on it from
then on._ At the time: CI and CodeQL ran only on pull requests to `main`, so stacked PR #120 had no automated
run. After rebasing onto the close-out commits, the full suite on `feat/multi-runtime-p4`
passed 2,118/2,118 with `DOTENV_CONFIG_PATH=/dev/null`; lint, format, and config checks
are clean. The P4 policy regexes for `RUN --mount` and parser directives were rewritten as
token parsing ahead of CodeQL, with linear-time regression tests.

## 2026-10-18 P4 review fixes

The two P4 review findings (zero-padded uid 0 passing as non-root, and `COPY --from` or
`RUN --mount from=` bypassing the registry rule) are fixed with failing-first tests. After
rebasing onto the reviewed base, the full suite on `feat/multi-runtime-p4` passed
2,134/2,134 with `DOTENV_CONFIG_PATH=/dev/null`; lint and format are clean.

## 2026-10-19 Second review

A deeper review reported fifteen findings. Fourteen were confirmed and fixed with
failing-first tests: seven on the base branch (rollback image identity, snapshot
repository, cleanup bookkeeping, legacy payload SHA, settings after a pilot is off, Tomcat
threads, and conventions) and seven on P4 (numeric non-root uid, inherited users,
`# escape`, build-argument base images, `localhost` registries, removal of rejected images,
and the port field). One was declined: the second context walk enforces containment to
the application root and is not redundant. Full suite on `feat/multi-runtime-p4`:
2,150/2,150 with `DOTENV_CONFIG_PATH=/dev/null`; lint and format clean.

## 2026-10-19 Third review

Ten findings, all confirmed and fixed with failing-first tests: seven on the base branch
(health-check form resetting settings, pre-snapshot rollbacks, streaming on maintenance and
custom-domain routes, local copies and identity after manifest deletion, GitHub errors read
as missing files, duplicate size accounting, naming) and four on P4 (owner-image fields in
the health form, the reset guard, local copies of prebuilt images, abandoned-sweep
bookkeeping). Full suite on `feat/multi-runtime-p4`: 2,162/2,162 with
`DOTENV_CONFIG_PATH=/dev/null`; lint and format clean.

## 2026-10-19 Fourth review

Ten findings, all confirmed and fixed with failing-first tests (four base, six P4). The two
most serious were P4 security gaps: an owner image without a saved credential was pulled
and scanned with the worker's own registry login, and owner references into the platform's
image repository were neither refused nor told apart from platform builds. Full suite on
`feat/multi-runtime-p4`: 2,173/2,173 with `DOTENV_CONFIG_PATH=/dev/null`; lint and format
clean.

## 2026-10-20 Fifth review

The fifth review's main finding was architectural: owner Dockerfile builds ran with the
worker's registry credentials, so the static policy was the effective boundary and could
be bypassed with quoted flags or `ONBUILD` triggers. Owner builds now hold no registry
credential and the builder never pushes. Nine findings were fixed with failing-first
tests; the shared BuildKit cache remains a documented residual risk for general
availability.

## 2026-10-20 Sixth review

Ten findings. Eight confirmed and fixed (five on the base branch, three on P4), each
behavior change with a failing-first test; one duplication finding declined; one
(GHCR rejecting OCI manifest deletion) cannot be confirmed without live GHCR and is now
a mandatory runbook probe before any pilot. Full suite on `feat/multi-runtime-p4`:
2,192/2,192 with `DOTENV_CONFIG_PATH=/dev/null`; lint and format clean.

## 2026-10-20 GHCR deletion fallback

`REGISTRY_DELETE_API=github-packages` is covered by tests against a fake GitHub Packages
API and an in-memory database: children before the index, a shared child kept, an
already-deleted index, a refused deletion, and the startup token probe. Real GHCR
behavior in either mode is unverified until runbook step 7 runs. Full suite on
`feat/multi-runtime-p4`: 2,200/2,200 with `DOTENV_CONFIG_PATH=/dev/null`; lint and
format clean.

## 2026-10-20 Local registry verification

Run on the development machine against a throwaway `registry:2` (deletion enabled,
bound to `127.0.0.1`) and a `docker-container` BuildKit builder, with ORAS 1.2.3
(release checksum verified). The worker's own `buildAndPushDockerImage` and
`deleteRegistryManifest` were called; only the registry host differed from GHCR.

- **Push:** the build exported an OCI layout with provenance and SBOM, and the ORAS push
  produced an image index whose digest matched the build metadata. The index listed
  the `linux/amd64` image and one attestation manifest; `readLayoutChildDigests` read
  the same two digests from the layout. The image pulled by digest, ran, and reported
  user `10001`.
- **Referrers fallback:** the attestation names the image manifest as its `subject`. With
  no Referrers API, ORAS wrote an extra tagged index, `sha256-<image digest>`. Deleting the
  attestation with ORAS left that tag in place, so cleanup now deletes it explicitly.
- **Cached rebuild:** rebuilding the same context reused the image manifest under a new
  index, and ORAS rewrote the fallback tag to the new attestation. This confirms the
  shared-child rule.
- **Cleanup:** deleting the first index while the second release still listed the shared
  image manifest removed only the old index and attestation, and the second image still
  pulled and ran. Deleting the second index then left the repository with no tags or
  manifests. A repeat deletion returned success.

Not covered: GHCR itself, the GitHub Packages API mode, the remote TLS builder, and
registry authentication. The test stack, builder, pulled images, and registry volume
were removed afterwards.

## 2026-10-20 Pre-merge smoke run, flags off

The #119 branch head (`18c5251`) ran as web services plus the real worker against a
throwaway MongoDB and Redis, the local Docker daemon, and code fetched from public
GitHub at exact commits. Every `MULTIRUNTIME_*` flag was unset, `NGINX_ENABLED=false`
with `ALLOW_UNROUTED_RELEASES=true`, and the worker used its own builder, port range
29000–29099, and scratch workspace. Production containers and networks on the shared
host were compared before and after: unchanged.

| Case                                                         | Result                                                                     |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `static`, `react-vite`, `vue-vite`, `express`, `node`        | HEALTHY, probe 200                                                         |
| `rollback-marker`: baseline, candidate, rollback to baseline | HEALTHY each; markers `baseline-v1`, `candidate-v2`, `baseline-v1`         |
| `build-failure` candidate (build command `npm run build`)    | `BUILD_FAILED`; baseline kept serving                                      |
| `health-failure` candidate                                   | `HEALTH_CHECK_FAILED` (HTTP 503); baseline kept serving                    |
| Project document without any of this branch's fields         | HEALTHY, probe 200                                                         |
| v1 job in the previous web's payload shape, no snapshot      | HEALTHY, probe 200 (public root-level Express app at `8b8dec1`)            |
| `next14-legacy`                                              | `BUILD_FAILED` on the default `legacy` template; HEALTHY on `optimized-v1` |

`next14-legacy` has no `public/` directory, and the `legacy` Next.js template copies
`/app/public`; only `optimized-v1` creates it. `main` has the same template, so this is
existing production behavior, not a regression from this branch. The per-owner
running-app quota (one by default) refused a second app for the same owner, as designed.

## 2026-10-21 Pre-merge smoke run for #120, flags off

The same isolated setup as the #119 run, on the #120 head (`2181331`), with every
`MULTIRUNTIME_*` flag unset. Production containers and networks were unchanged.

| Case                                                   | Result                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `static`, `express`                                    | HEALTHY, probe 200                                                       |
| `rollback-marker`: baseline, candidate, rollback       | HEALTHY each; markers `baseline-v1`, `candidate-v2`, `baseline-v1`       |
| `health-failure` candidate                             | `HEALTH_CHECK_FAILED` (HTTP 503); baseline kept serving                  |
| Project document without any new fields                | HEALTHY, probe 200                                                       |
| `dockerfile_v1` project deployed from the web service  | Refused: "The selected deployment mode is not enabled for this project." |
| `dockerfile_v1` job queued directly with a v2 snapshot | `BUILD_STRATEGY_DISABLED`, no build started                              |

## 2026-10-24 Builder control, Phase B (`feat/builder-control`)

All with `DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test` and Cloudflare variables blank; every
system boundary (systemd, BuildKit, registry, `/proc`, clock) was faked. Nothing was installed or
started on the host.

| Area                                                             | File                                           | Result |
| ---------------------------------------------------------------- | ---------------------------------------------- | ------ |
| Eligibility, admission boundaries, pressure, endpoints, settings | `tests/contracts/builder-control.test.js`      | 30/30  |
| State machine, authorization, leases, monitor, watchdog, idle    | `tests/worker/builder-controller.test.js`      | 37/37  |
| Resource readers, systemd wrapper, crash reconciliation          | `tests/worker/builder-host.test.js`            | 10/10  |
| Build-job gate, legacy path unchanged, cancellation              | `tests/worker/builder-gated-build.job.test.js` | 13/13  |
| S1 builder isolation check (with the updated existing tests)     | `tests/worker/build-args.test.js`              | 20/20  |
| Configuration validation                                         | `tests/config/builder-control-env.test.js`     | 9/9    |
| Web requests, settings ceiling, deployment gate, page            | `tests/admin/builder-control.test.js`          | 24/24  |

- Changed-area suites (worker, deployment, admin, config, contracts, UI, security, projects):
  1,757/1,757 with `--test-concurrency=3`. A first attempt at full concurrency failed with
  "Disk quota exceeded": `/tmp` is a RAM-backed 3.6 GB tmpfs, and 10 stale
  `mongo-mem-*` directories (1.7 GB) from earlier test runs had filled it. They were removed.
- Playwright: the admin matrix, now including `/admin/builder` with an axe scan, passed twice
  (35 s and 32 s) after its timeout was raised to 90 s; it had exceeded the 30 s default on this
  memory-constrained host.
- `npm run lint` and Prettier on the changed paths are clean.

## 2026-10-25 Builder control, Phase C: host install and runbook step 7

**Host install** (`infrastructure/builder/install-builder.sh --test-user henz`, run by the
owner): `uidmap` and `slirp4netns` installed; BuildKit v0.34.0 and ORAS 1.3.4 with pinned
checksums; the 30 GB store mounted; the unit installed `static` (it cannot start at boot).

**`verify-builder.sh`**: 33 of 34 checks passed. The one failure was the script's own boot
check, which read `static` as enabled; it was fixed (`5a5c4a3`). Passed:

- polkit, as `hellodeploy-worker`: start, stop and SIGKILL of the builder are allowed;
  restart, signals to other services, and requests from an unrelated user are refused;
- cgroup caps: `memory.max` 1536 MiB, `memory.swap.max` 0, `cpu.max` 2 cores, `pids.max` 512;
- as `hellodeploy-builder` with the firewall loaded: the Docker socket, `.env`, the nginx
  helper, Redis (6379), the web service (3100), cloud metadata and the LAN address are
  unreachable; `registry-1.docker.io:443` is reachable and `github.com:22` is refused;
- the firewall table is removed after both Stop and SIGKILL.

polkit evaluates the requesting process's own groups, so a user added to the control group
needs a new login, and the production worker needs its next restart, before Start works.

**Runbook step 7** on `ghcr.io/4hprojects/hellodeploy-builds`:

- the package is private (anonymous fetch: `unauthorized: authentication required`);
- `oras manifest delete` answers `unsupported: The operation is unsupported.`, and the
  manifest stays;
- `github-packages` mode through the worker's own `deleteRegistryManifest`: deletion
  succeeded, and a repeat deletion is a no-op;
- GitHub refuses to delete a package's last tagged version (HTTP 400), so a permanent
  `hellodeploy-anchor` version was pushed, and readiness now requires it;
- `verifyRegistryAccess` against real GHCR returns ready.

## 2026-10-25 Builder control, Phase C: live isolated tests

Setup:

- the real system builder unit and `ghcr.io/4hprojects/hellodeploy-builds`;
- a test worker started with `env -i` from a directory with no `.env`, with builder control on,
  a throwaway MongoDB (27999) and Redis (6999), `NGINX_ENABLED=false`,
  `ALLOW_UNROUTED_RELEASES=true`, ports 29000–29099, and on-disk scratch workspaces;
- the `next16-standalone-app` fixture cloned from public GitHub at `3984477`.

Production containers and networks were compared before and after: unchanged. The apps answered
200 (HelloEventHub 308) throughout.

**Inside a real build** (`buildctl` through the unit):

- blocked: Redis on 127.0.0.1, the slirp host gateway 10.0.2.2 (6379, 3100), the LAN address,
  169.254.169.254, `github.com:22`, and the Docker socket (not present);
- reachable: `registry.npmjs.org:443` and `dl-cdn.alpinelinux.org:443`;
- uid 0 inside the build is the user-namespace root, not host root.

| Case                                         | Result                                                                                                                                                                                  |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Builder stopped, deploy queued               | `BUILDER_OFFLINE` in about 2 s; nothing cloned                                                                                                                                          |
| Start through the control queue              | `READY`; polkit start, S1 check and GHCR readiness (with the anchor) passed                                                                                                             |
| Next.js 16 standalone, end to end            | `HEALTHY` in 3 min 44 s; digest-pinned GHCR index with image and attestation children; `sha256-<child>` fallback tag created; container non-root `node`, 256 MB, 200 on 127.0.0.1:29000 |
| Build memory                                 | unit peak 1,255 MiB (`memory.peak`); host available memory never below 2,375 MB; no OOM kill, no swap                                                                                   |
| Emergency Stop mid-build                     | `BUILD_CANCELLED` ("Stopped by an administrator"); unit killed; builder `STOPPED`; live release still 200                                                                               |
| Worker SIGKILL mid-build, restarted          | the deployment marked `WORKER_INTERRUPTED`; the running builder adopted as `READY`; no build processes left                                                                             |
| Health check fails after the image was built | `HEALTH_CHECK_FAILED`; the candidate container removed; live release still 200                                                                                                          |
| A build command holding 2 GB                 | the worker's monitor cancelled it after 16 s (`Memory pressure reached 8.05% (maximum 5%)`); host available memory never below 1,869 MB; builder stayed `READY`                         |
| Direct 2 GB build without the worker         | throttled at `MemoryHigh` (peak 1,395 MiB); systemd-oomd killed the builder unit at 66% pressure after 20 s; apps unaffected                                                            |
| Build timeout (90 s, `sleep 600`)            | `BUILD_FAILED` "timed out after 90s"; BuildKit cancelled the step (no `sleep` left); builder `READY`                                                                                    |
| GHCR refuses the push (no credentials)       | `BUILD_FAILED` "Image push exited with code 1"; live release still 200                                                                                                                  |
| Idle shutdown (5 min)                        | stopped 5 min after the last build ended; `builder.idle_stopped` audited                                                                                                                |
| Registry cleanup (github-packages)           | a failed release's index and unique attestation deleted; the image manifest it shared with the live release kept (shared-child rule); the live release still pullable                   |
| Host reboot at 20:47                         | the builder unit stayed stopped (it cannot start at boot); every app came back on its own                                                                                               |

Findings:

- `ProtectKernelLogs=yes` stopped every build step (`error mounting "proc" ... operation not
permitted`). It was removed (`a44aaef`); a build step now runs.
- A normal stop exits 1 (`buildkitd: got SIGTERM`), which left the unit `failed`. Fixed with
  `SuccessExitStatus=1`.
- The `registry-1.docker.io:443` probe in `verify-builder.sh` failed once although a build had
  just pulled through the same firewall. The probe now uses IPv4 with three tries.
- A cached rebuild makes ORAS rewrite the `sha256-<child>` fallback tag, and the previous
  fallback index becomes an untagged package version that cleanup never deletes. One such version
  was found and deleted by hand. Fixed the same day: after a deletion, cleanup also deletes any
  untagged index that no release record holds and whose every listed manifest is gone. Live
  check: two Next.js releases, the second a cached rebuild, left 8 versions (4 untagged,
  including the orphaned fallback index). Deleting the older release removed the orphan and left
  the newer release's image, attestation and fallback tag; it kept serving.
- The timeout and push-failure messages get the Next.js secrets hint appended, which is
  misleading. This is existing remote-path wording; it is listed as a follow-up.
- After cleanup, the package holds only `hellodeploy-anchor`.

## 2026-10-25 Builder control, Phase C: final reinstall

After the `SuccessExitStatus=1` and probe fixes, the owner reinstalled the unit and reran
`verify-builder.sh`: **all 36 checks passed**, including a rootless build step and HTTPS
egress. A normal Stop now leaves the unit `inactive` (`Result=success`), not `failed`.

## External evidence still required

No dedicated builder or private GHCR credentials are available in the current
workspace. Consequently no live remote build, push/pull, route, rollback, registry
deletion, network-isolation, interruption, or resource-exhaustion gate is claimed.
The reusable coordinator is ready, but its default run is preflight-only and no live
execution was attempted without those protected inputs.
