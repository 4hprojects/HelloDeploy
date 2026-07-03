# Phase 4 — Worker pipeline extraction refactor

- **Status:** Pending
- **Started:** —
- **Accomplished:** —
- **Commits:** —

## Goal

`activate-release.job.js` and `rollback-release.job.js` duplicate ~80% of the deploy pipeline (port-alloc → network → secrets → start → startup delay → health-check → nginx → container-swap), plus identical `logEvent`/`updateStatus` helpers also present in `build-deployment.job.js`. Behavior-preserving extraction; Phase 3 tests must stay green unmodified.

## Tasks (checklist)

- [ ] Extract shared pipeline into `apps/worker/src/deployment/pipeline.js`
- [ ] Extract shared `logEvent`/`updateStatus` helpers + constants for the three jobs
- [ ] Extract `findActiveDeployment(projectId)` + shared active-statuses constant to replace the triplicated block in `deployment.service.js` (~lines 162/316/427)
- [ ] Full test suite green, Phase 3 tests unmodified
- [ ] Update IMPROVEMENTS.md checkboxes (pipeline dedup + one-active-deployment items)

## Notes

## Verification
