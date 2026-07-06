# Phase 11 — Deployment pipeline correctness

**Status:** Done
**Started:** 2026-07-06 18:17 PST · **Finished:** 2026-07-06 18:40 PST
**Source:** [IMPROVEMENTS.md § Round 2](../IMPROVEMENTS.md#round-2--analyzed-2026-07-06-commit-0adee42) — items W1, W3, W4, W5, W9, W7

Goal: no deployment can end up stuck, pointing at a deleted image, leaking a container, or falsely HEALTHY.

## Changes

### W1 — Retention can no longer delete an image a rollback still uses

- `apps/worker/src/deployment/retention.js`: new exported `isImageTagInUse(imageTag, excludeIds)` — true when any deployment outside the cleanup set still references the tag in a live status (QUEUED…HEALTHY). `cleanupOldReleases` now (a) skips the project's `activeDeploymentId` entirely (same guard `cleanup-releases.job.js` already had), and (b) only removes an image when no live record outside the cleanup set references it. A `removedTags` set dedupes shared tags within one run.
- `apps/worker/src/jobs/cleanup-releases.job.js`: same `isImageTagInUse` guard applied to both the HEALTHY-excess loop and the abandoned FAILED/CANCELLED loop (a FAILED rollback carries its source's imageTag — previously its "abandoned image" cleanup would have deleted the healthy source's image). Handler gained an injectable `deps` param matching the other jobs.

### W3 — Silent stuck-in-DEPLOYING paths now fail loudly

- `build-deployment.job.js`: `enqueueActivateRelease` throws when the queue singleton is unset instead of no-oping; the call site catches, logs a DEPLOY error event, marks the deployment `FAILED` (`ACTIVATION_ENQUEUE_FAILED`), and removes the built image (consistent with the failed-activation policy).
- `worker.js`: unknown job types now throw (BullMQ marks the job failed) instead of warn-and-complete.

### W4 — Retried activations clean up the previous attempt's container

- `pipeline.js`: before `startContainer`, the pipeline inspects the deterministic container name and stop/removes any leftover from a prior attempt (previously the retry died on a docker name conflict while the first container leaked).

### W5 — `resourceLimits` payload is live config

- `pipeline.js` accepts `resourceLimits` and applies `memoryMb`/`cpuCores`/`pidsLimit` with the old hardcoded values as defaults (`DEFAULT_PIDS_LIMIT` added); `activate-release.job.js` threads `job.data.resourceLimits` through; `container.js` `startContainer` takes `pidsLimit`; the build job now sends `{ memoryMb, cpuCores, pidsLimit }` sourced from the pipeline constants (was `cpuShares`, which nothing read — contracts typedef fixed to match).

### W9 — Port allocator probes the OS

- `port-allocator.js`: after the DB claim verifies, `probePortFree(port)` (loopback bind test, injectable) confirms the port is actually bindable; busy ports are excluded from subsequent scans and the claim retries. Closes the window where a non-HelloDeploy process (or a container from a crashed deploy) held a DB-free port.

### W7 — `NGINX_ENABLED=false` can't silently produce unreachable "HEALTHY" deploys

- `worker.js`: boot-time guard — in production with nginx disabled the worker refuses to start unless `NGINX_DISABLED_ACK=true` (documented in `docs/ENVIRONMENT.md`) acknowledges an external router. Chosen over a per-deploy failure so the misconfiguration surfaces immediately at deploy of the worker, not one deployment at a time. (Also placed at boot because the test harness loads the repo `.env`, which is production-shaped with nginx off — an in-pipeline guard would misfire there.)
- `pipeline.js`: when nginx is skipped (dev), a WARN deploy event now tells the viewer the app won't be reachable via its platform subdomain.

## Verification

- New tests (8): retention shared-image guard + active-deployment guard (`tests/worker/retention.test.js`), `ACTIVATION_ENQUEUE_FAILED` status + image removal + resource-limits payload (`tests/worker/build-deployment.job.test.js`), payload limits applied to `startContainer` + stale-container removal before start (`tests/worker/activate-release.job.test.js`), OS-busy port skipped (`tests/worker/port-allocator.test.js`).
- Existing `inspectContainer` stubs in the activate/rollback job tests were made state-aware (return `missing` until `startContainer` runs) to mirror real docker state, which the new stale-container pre-check queries.
- `npm run lint` clean; full `npm run test`: **573/573 pass** (was 565).
- Manual-check item (no docker socket in this harness, per Phase 8 precedent): live deploy → rollback → wait for retention → confirm the shared image survives (`docker images`), and worker boot refusal with `NODE_ENV=production NGINX_ENABLED=false`.
