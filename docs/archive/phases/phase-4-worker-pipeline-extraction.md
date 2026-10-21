# Phase 4 — Worker pipeline extraction refactor

- **Status:** Done
- **Started:** 2026-07-03T21:04:00+08:00
- **Accomplished:** 2026-07-03T21:11:11+08:00
- **Commits:** (this commit)

## Goal

`activate-release.job.js` and `rollback-release.job.js` duplicated ~80% of the deploy pipeline, plus `logEvent`/`updateStatus` helpers also copied in `build-deployment.job.js`. Behavior-preserving extraction, pinned by the Phase 3 tests.

## Tasks (checklist)

- [x] `apps/worker/src/deployment/pipeline.js` — shared `runReleasePipeline()` (port-alloc → network → secrets → start → startup/crash check → health check → nginx route → old-container swap → HEALTHY + project pointer), plus shared `logEvent`, `updateStatus`, `resolveAppPort`, and the resource/startup constants
- [x] Both jobs reduced to thin handlers: guards + job-specific wiring. Job diff: **-800 / +83 lines** across the four touched source files
- [x] Real behavioral differences expressed as six explicit `opts` knobs instead of duplicated code: `removeImageOnFailure` (activate only — rollback shares the source image), `failOnInvalidSubdomain` (activate fails, rollback skips nginx), `persistSubdomain`, `markPreviousRolledBack`, `recordImageTagOnStart`, `logLabel`
- [x] `build-deployment.job.js` now imports the shared `logEvent`/`updateStatus`
- [x] `deployment.service.js`: triplicated one-in-flight-deployment check extracted to `findInFlightDeployment(projectId)` + `IN_FLIGHT_STATUSES`
- [x] Phase 3 job/pipeline tests pass **unmodified** (40/40) — they pinned behavior across the refactor
- [x] IMPROVEMENTS.md checkboxes updated

## Notes

- Two pre-existing source-text tests asserted implementation _location_ (regexes over job-file source): `deployment-notification.test.js` and `log-viewer-safety.test.js`. Updated to point at pipeline.js where the notification call and redaction helper now live — the behavioral guarantees they encode (fire-and-forget notify, redacted log storage) are unchanged.
- Minor user-visible log wording unified: rollback deploy-log events now use the same phrasing as activation for startup-crash and health-check messages (differences were cosmetic).
- The port-allocator check-then-use race is unchanged by this refactor — still tracked in Phase 6.

## Verification

1. `node --test 'tests/worker/*.test.js'` → 40/40 pass with zero modifications to those files.
2. Full suite `npm test` → **546 tests, 0 failures**; `npm run lint` clean.
