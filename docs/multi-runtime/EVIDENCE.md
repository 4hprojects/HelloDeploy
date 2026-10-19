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

## 2026-10-18 Code review

A full-branch code review (`main...feat/multi-runtime-p4`) reported ten findings. Each was
verified against the code before any change; all ten were real. Eight base fixes each have
a test that failed before the fix (including a pre-upgrade project document with the field
genuinely absent). Changed-area suites after the fixes: 183 files plus API and contract
suites, 1,751/1,751; lint and format clean.

## 2026-10-17 P4 owner images (stacked branch)

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

## 2026-10-18 P4 branch full suite

CI and CodeQL run only on pull requests to `main`, so stacked PR #120 has no automated
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

## External evidence still required

No dedicated builder or private GHCR credentials are available in the current
workspace. Consequently no live remote build, push/pull, route, rollback, registry
deletion, network-isolation, interruption, or resource-exhaustion gate is claimed.
The reusable coordinator is ready, but its default run is preflight-only and no live
execution was attempted without those protected inputs.
