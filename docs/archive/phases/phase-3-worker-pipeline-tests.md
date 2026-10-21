# Phase 3 — Worker pipeline test coverage

- **Status:** Done
- **Started:** 2026-07-03T20:50:00+08:00
- **Accomplished:** 2026-07-03T21:03:42+08:00
- **Commits:** (this commit)

## Goal

The worker job orchestration, port-allocator, and retention had no direct tests, and project.service / admin.service quota logic were untested. This coverage pins current behavior and unblocks the Phase 4 extraction refactor.

## Tasks (checklist)

- [x] `tests/worker/build-deployment.job.test.js` (9 tests): DEPLOYING transition + imageTag, activation enqueued, workspace cleanup, `noCache` passthrough (and default false), BUILD_FAILED → partial image removed, CLONE_FAILED → never builds, REPO_ACCESS_REVOKED, non-QUEUED skip
- [x] `tests/worker/activate-release.job.test.js` (12 tests): HEALTHY + container recorded, project pointer swap, nginx route activation, old-container stop, retention run, secrets + static-port rules into `startContainer`, PORT_ALLOCATION_FAILED, crash-on-startup, failed-activation image removal, NGINX_ROUTE_FAILED, existing HEALTHY release untouched on candidate failure, non-DEPLOYING skip
- [x] `tests/worker/rollback-release.job.test.js` (8 tests): HEALTHY, source image reuse, previous active → ROLLED_BACK + container stopped, project pointer, ROLLBACK_SOURCE_INVALID, source preserved on failed rollback, crashed candidate stopped, non-DEPLOYING skip
- [x] `tests/worker/port-allocator.test.js` (5 tests): first port, skips held ports, reuses terminal-status ports, fills gaps, full-range exhaustion (10k docs via insertMany)
- [x] `tests/worker/retention.test.js` (6 tests): no-op at limit, oldest-beyond-three removed, containers stopped, records cleared, continues past individual failures, ignores non-HEALTHY
- [x] `tests/projects/project-service.test.js` (8 tests): DRAFT + slug, OWNER membership, slug dedup, quota rejection at plan default, quota override honored, membership filtering, role included, rename keeps slug
- [x] `tests/admin/quota-service.test.js` (8 tests): consumption counts (non-archived projects, live-container HEALTHY apps, project members), unknown scope, override field allowlisting, negative rejection, invalid scope, upsert-not-duplicate

## Notes

- **Infrastructure:** `mongodb-memory-server` added as a root devDependency; `tests/helpers/worker-db.js` (start/stop/clear + `objectId()`) and `tests/helpers/worker-fixtures.js` (project/deployment/repository factories). Models run against a real in-memory MongoDB — only true system boundaries (docker, git, nginx, health-check HTTP, notifications, clock) are stubbed.
- **Seams added:** the three job handlers, `cleanupOldReleases`, all gained an optional `deps = defaultDeps` parameter — the same injection pattern `handlePushEvent` already used. Zero orchestration logic changed; the build job's lazy queue import moved into a named `enqueueActivateRelease` default dep. `startupDelayMs` is part of deps so tests don't sleep 3 s per activation.
- The activate test file sets `NGINX_ENABLED=true` before import to exercise route activation/failure paths.
- Fixture role bug found during writing: `DEVELOPER` isn't a `ProjectRole` (valid: OWNER/MAINTAINER/VIEWER).

## Verification

1. `npm test` → **546 tests, 546 pass** (was 490 before this phase; +56).
2. `npm run lint` clean.
3. First run downloads the mongod binary to the memory-server cache (~30 s one-time); subsequent full-suite runs ~2 min.
