# Docker Optimization Operator Runbook

For the operator of a HelloDeploy worker host. All settings below go in the worker's
environment file and take effect when `hellodeploy-worker` restarts. Nothing here
changes running containers; settings apply to **future builds** only.

## What ships enabled by default

| Behavior                                                                                                                          | Default state                                                             |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| STATIC builds exclude `.env*`, `.git`, `node_modules`, logs, caches, coverage, `Dockerfile` and `.dockerignore` from the web root | **On** (security fix H6). Redeploy existing static projects to pick it up |
| Detection rejects projects without `package-lock.json`, and Yarn/pnpm projects                                                    | **On** (F7)                                                               |
| Build-log warnings about committed root `.env*` files (excluded, or included for legacy Node images)                              | **On**                                                                    |
| `optimized-v1` user-image template                                                                                                | **Off** (`USER_IMAGE_TEMPLATE_VERSION=legacy`, empty allowlist)           |
| Enforced build memory limit (dedicated builder)                                                                                   | **Off** until `BUILD_BUILDER_NAME` is set (recommended, see below)        |

## Enforce the build memory limit (recommended)

Under BuildKit, the default for `docker build`, the per-build `--memory` flag is
silently ignored. Without a dedicated builder, a user build can use all host memory
and starve live apps (finding H1, confirmed 2026-10-10).

1. Set `BUILD_BUILDER_NAME=hellodeploy-builder` (and `BUILD_MEMORY_MB`, default
   `1024`). The limit covers the whole builder, so all concurrent builds share it.
2. Restart the worker: `sudo systemctl restart hellodeploy-worker`.
3. Check the worker log for `memory-limited build builder ready`, then verify:
   ```bash
   sudo -u hellodeploy-worker HOME=/var/lib/hellodeploy docker buildx inspect hellodeploy-builder
   docker inspect buildx_buildkit_hellodeploy-builder0 --format '{{.HostConfig.Memory}}'
   ```
4. Expect the **first build of each project to be cold**: the builder has its own
   cache, separate from the 18 GB default cache. Each build also spends a few seconds
   loading the image into Docker (`importing to docker`).
5. Size `BUILD_MEMORY_MB` for your largest app's build. A build that exceeds it fails
   with `ResourceExhausted … cannot allocate memory`; the live release is untouched.

**Changing the limit:** set the new `BUILD_MEMORY_MB`, then remove the builder
(`sudo -u hellodeploy-worker HOME=/var/lib/hellodeploy docker buildx rm hellodeploy-builder`)
and restart the worker, which recreates it. Do this when no build is running.

**Rollback:** unset `BUILD_BUILDER_NAME` and restart the worker. Builds return to the
default builder (no memory enforcement). Optionally remove the builder as above.

## Canary the optimized-v1 template

1. Pick one project with a healthy current release. Add its project ObjectId to
   `USER_IMAGE_OPTIMIZED_PROJECT_IDS` (comma-separated, max 100). Restart the worker.
2. Deploy it. The VALIDATE log shows `Generated optimized-v1 Dockerfile`, or
   `Using legacy image template: <reason>` when it falls back.
3. If the candidate fails to build or fails its health check, the current release keeps
   serving. Remove the ID and redeploy, or roll back to the retained release.
4. Change `USER_IMAGE_TEMPLATE_VERSION` to `optimized-v1` only after canaries pass,
   with owner approval.

## Cleanup rules

- Never run `docker system prune -a --volumes` or a manual `docker builder prune` on
  the production host without an approved, bounded policy (H2 is open).
- Never delete `hellodeploy-*` images by hand. Retention protects rollback targets
  through database records.
