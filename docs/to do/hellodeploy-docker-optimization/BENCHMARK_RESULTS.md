# Docker Optimization Benchmark and Fixture Results

Every number here comes from captured command output. Nothing is estimated. Timings
are **indicative only** unless a section says otherwise.

## P1 Fixture Validation (2026-10-10)

Operator-approved real-daemon builds of the uncommitted `optimized-v1` work (P1 exit
gate) plus the H1 memory-limit check. This is a compatibility check, not the P2
benchmark: one run per scenario, with a shared and partly warm cache.

### Environment

| Item           | Value                                                                                                                                                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Code           | HEAD `ea99993` plus uncommitted P1 changes (F1–F4, F6 fixes)                                                                                                                                                                                                 |
| Host           | Ubuntu 26.04 LTS, small single host. **Production-shared** (live user containers running); a few GiB of memory available during the run                                                                                                                      |
| Docker         | Engine and CLI 29.8.1; `docker build` → buildx 0.37.1; default builder `docker` driver, BuildKit v0.33.0                                                                                                                                                     |
| Base images    | `node:22-alpine`, `nginxinc/nginx-unprivileged:1.27-alpine`, resolved by BuildKit. They are not tagged in the image store, so digests were not captured                                                                                                      |
| Build path     | The real worker functions, called by a scratch driver in build-job order: `prepareBuildContext` → `resolveBuildProfile` → `writePlatformDockerignore` + `listRootEnvFiles` → `generateDockerfile` → `buildDockerImage` (`buildMemoryMb` 1024, timeout 600 s) |
| Fixture deps   | react/react-dom 19.3.0, vue 3.5.43, vite 7.3.7, next 15.5.27, express 5.3.0 (lockfiles from `npm install --package-lock-only`)                                                                                                                               |
| Fixture secret | Each fixture has a root `.env` containing `FIXTURE_SECRET=not-a-real-secret`                                                                                                                                                                                 |
| Isolation      | Tags and containers prefixed `hdfixture-`; test ports 127.0.0.1:29001–29031; containers `--memory 256m --rm`; builds run one at a time                                                                                                                       |

### Results

Legacy builds ran first, so the `optimized-v1` timings benefit from a warmer shared
cache (base layers, npm downloads). Don't read the timing column as a template
comparison. Size is the logical `docker image inspect .Size`; shared layers are not
unique disk usage.

| Fixture               | Requested    | Resolved profile                                                         | Build      | Wall time | Size (bytes) | Runtime uid | `GET /`          | Root `.env` in image or served    | `Dockerfile` in image or served |
| --------------------- | ------------ | ------------------------------------------------------------------------ | ---------- | --------- | ------------ | ----------- | ---------------- | --------------------------------- | ------------------------------- |
| static                | legacy       | legacy                                                                   | ok         | 6.3 s     | 73,674,900   | 101         | 200              | **served: `GET /.env` → 200**     | served: 200                     |
| static                | optimized-v1 | optimized-v1 (warned: `.env` excluded)                                   | ok         | 1.0 s     | 73,666,541   | 101         | 200              | `GET /.env` → 404                 | 404                             |
| express               | legacy       | legacy                                                                   | ok         | 5.5 s     | 248,790,247  | 1000        | 200 `express ok` | present in `/app`                 | present                         |
| express               | optimized-v1 | optimized-v1 (warned: `.env` excluded)                                   | ok         | 3.9 s     | 242,675,311  | 1000        | 200 `express ok` | absent                            | absent                          |
| express-postinstall   | legacy       | legacy                                                                   | ok         | 3.9 s     | 248,802,771  | 1000        | 200 `express ok` | present                           | present                         |
| express-postinstall   | optimized-v1 | **legacy** (reason: root postinstall lifecycle requires legacy ordering) | ok         | 0.8 s     | 248,802,777  | 1000        | 200 `express ok` | present (fallback = exact legacy) | present                         |
| react (Vite)          | legacy       | legacy                                                                   | ok         | 7.4 s     | 73,965,374   | 101         | 200              | `GET /.env` → 404 (not in `dist`) | not in `dist`                   |
| react (Vite)          | optimized-v1 | optimized-v1 (warned: `.env` excluded)                                   | ok         | 4.0 s     | 73,965,380   | 101         | 200              | 404                               | not in `dist`                   |
| vue (Vite)            | legacy       | legacy                                                                   | ok         | 6.5 s     | 73,761,775   | 101         | 200              | 404 (not in `dist`)               | not in `dist`                   |
| vue (Vite)            | optimized-v1 | optimized-v1 (warned: `.env` excluded)                                   | ok         | 3.3 s     | 73,761,781   | 101         | 200              | 404                               | not in `dist`                   |
| nextjs (no `public/`) | legacy       | legacy                                                                   | **FAILED** | 71.9 s    | —            | —           | —                | —                                 | —                               |
| nextjs (no `public/`) | optimized-v1 | optimized-v1 (warned: `.env` excluded)                                   | ok         | 55.5 s    | 311,063,136  | 1000        | 200 `nextjs ok`  | absent (standalone output)        | absent                          |

Notes:

- The `postinstall` side effect (`postinstall-ran.txt`) is present in both
  express-postinstall images, so the fallback preserves source-dependent lifecycle
  behavior on a real build.
- React and Vue produce **identical bundle hashes** under both templates
  (`index-Cbdbz-GG.js`, `index-CVUVSv0w.js`): no output change when `.env` holds no
  build-time variables.
- The legacy Next.js failure is the known pre-existing gap:
  `failed to compute cache key: "/app/public": not found`. `optimized-v1` fixes it with
  `RUN mkdir -p /app/public`.

### H1: build memory limit (`BUILD_MEMORY_MB`)

`buildDockerImage` with `buildMemoryMb: 256` and `noCache: true` built
`FROM node:22-alpine` + `RUN node -e "Buffer.alloc(768 MiB).fill(1)"`.

- Result: **build succeeded**; log line `#5 1.995 allocated 805306368`.
- No warning about `--memory` appeared in the build output.
- `docker buildx inspect default`: `docker` driver, BuildKit v0.33.0, no memory limit.

**Conclusion: H1 confirmed.** On this host, `--memory` passed by `build.js` is
accepted and silently ignored. Hosted user builds are not memory-capped and can
contend with production containers.

### Cleanup and host impact

| Check                       | Before                  | After                                                                                |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| Images (`docker system df`) | baseline                | Identical count and size to baseline (all 12 `hdfixture-*` tags removed, non-forced) |
| Build cache                 | baseline                | **+1.29 GB**, left in place; no prune                                                |
| Production containers       | recorded IDs and uptime | Same IDs; uptime continued uninterrupted                                             |

## H6 / H1 / F8 Fix Verification (2026-10-10)

Ran through the **real `handleBuildDeployment`** (in-memory MongoDB; only clone,
token, queue, notification and secret lookups stubbed) on the production-shared host.

| Check                             | Setup                                                                                                          | Result                                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H6: legacy STATIC exclusions      | `static` fixture with root `.env`, default template                                                            | Status `DEPLOYING`; WARN `Committed environment files are excluded from the image: .env`; `GET /` 200; `/.env`, `/Dockerfile`, `/.dockerignore` → **404**; uid 101 |
| H1: builder creation              | `ensureBuildBuilder({ name: 'hdfixture-builder', memoryMb: 512 })`, called twice                               | `{created:true}` then `{created:false}`; driver `docker-container`, BuildKit v0.33.1; container `Memory=536870912`, `MemorySwap=536870912`                         |
| H1: limit enforced                | `BUILD_BUILDER_NAME=hdfixture-builder BUILD_MEMORY_MB=512`; Node fixture whose `postinstall` allocates 768 MiB | Deployment **FAILED** `BUILD_FAILED`; `npm error signal SIGKILL`; `ResourceExhausted … cannot allocate memory` (13.3 s). The builder stayed running                |
| H1: normal build via builder      | `express` fixture, same settings                                                                               | Status `DEPLOYING` in 5.9 s; `#10 importing to docker`; image in the local store (249 MB) with `hellodeploy.*` labels; `GET /` → `express ok`; uid 1000            |
| F8: legacy Node `.env` visibility | same `express` run                                                                                             | WARN `Committed environment files are included in the image: .env. Move these values …`                                                                            |

Cleanup: `docker buildx rm hdfixture-builder` removed the builder container and its
state; both `hdfixture-*` images were removed; production containers were unchanged.
`moby/buildkit:buildx-stable-1` (365 MB) was pulled to run the builder and was kept,
because production needs the same image when `BUILD_BUILDER_NAME` is enabled.

## P2 Cache Benchmarks

Not started. Requires the cold/warm/source-change/lockfile-change methodology from
`04_VALIDATION_ROLLOUT.md` with at least three iterations, preferably on a host that is
not serving production (H3).
