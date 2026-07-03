# Phase 3 — Worker pipeline test coverage

- **Status:** Pending
- **Started:** —
- **Accomplished:** —
- **Commits:** —

## Goal

The worker job orchestration (`build-deployment.job.js`, `activate-release.job.js`, `rollback-release.job.js`), `port-allocator.js`, and `retention.js` have no direct tests, and `project.service.js` CRUD / `admin.service.js` quota consumption are untested. This coverage pins current behavior and is the prerequisite for the Phase 4 extraction refactor.

## Tasks (checklist)

- [ ] Tests for build-deployment job: success path order, build failure → image cleanup + status, noCache passthrough
- [ ] Tests for activate-release job: happy path sequence, health-check failure → image removed + rollback state, nginx failure path
- [ ] Tests for rollback-release job: reuses source image (no image removal), status transitions
- [ ] Tests for port-allocator: allocation, exhaustion, collision behavior (document the known race)
- [ ] Tests for retention/cleanup: trims only excess HEALTHY releases
- [ ] Tests for project.service CRUD and admin.service quota consumption
- [ ] Mock only at system boundaries (docker exec/spawn, nginx, fs, clock) per testing rules; deps-injection pattern used throughout the repo

## Notes

## Verification
