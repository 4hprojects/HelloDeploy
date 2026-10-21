# Phase 0A: Repository Discovery and Baseline

## Objective

Prove actual support and constraints before altering implementation. The 2026-10-15 `docs/PRIORITIES.md` says real hosted projects are running, while per-runtime and rollback verification remains open. Treat documentation as potentially stale.

## Codex tasks

- `git status`, `git branch -vv`, check origin and default branch, record HEAD SHA, working tree, test health, host/environment differences. Do not overwrite user work.
- Inspect `apps/worker/src`, detector source, build/image generation, Docker execution, Nginx, deployment candidate/swap/rollback, job locks and cancellation.
- Inspect `apps/web` project creation/detection/settings routes and any API schemas, database schemas/migrations, audit events, queues, quota enforcement and relevant test suites.
- Search repo for `next`, `runtime`, `Dockerfile`, `compose`, `image`, `allowed`, `quota`, `port`, `privileged`, `user`, `cap_drop`, `secrets`, `mount` and link concrete code paths in findings.
- Inspect `docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`, `docs/PRIORITIES.md`, `docs/OPERATIONS_RUNBOOKS.md`, latest worklog. Mark observed vs documented vs unverified.
- Inspect CI, npm scripts, production upgrade method, backup/restore and isolation policy.
- Run current lint, formatting, tests and relevant smoke tests in a safe test environment; do not run production deploys.
- Write a dependency/compatibility matrix with per-runtime test fixtures and security constraints.
- Establish baseline resource metrics (CPU/RAM/disk/build duration) using safe representative fixtures. Respect the 8GB existing host and record any unknowns.

## Deliverable

`docs/multi-runtime/BASELINE_AUDIT.md`, including: date, commit, supported paths with evidence, risks, existing test failures, baseline performance, exact links and unresolved questions.

## Gate

No Phase 1 changes until baseline is recorded. If current production release chain is broken, prioritize restoration/verification of existing runtimes before adding new ones.
