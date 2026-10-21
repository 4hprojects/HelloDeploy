# HelloDeploy Docker Optimization Implementation Pack

Status 2026-10-21: P0 and P1 are complete and in production (`optimized-v1` is opt-in per
project); P2–P5 are not started. Current state is in
[IMPLEMENTATION_TRACKER.md](IMPLEMENTATION_TRACKER.md#current-status).

## Sources of truth and deliverables

- `00_MASTER_IMPLEMENTATION_PLAN.md` is the requirements, boundaries, and acceptance-gate source of truth.
- `IMPLEMENTATION_TRACKER.md` is the execution plan and current progress monitor. Update it after every meaningful implementation or verification step.
- `AUDIT_REPORT.md` contains the P0 repository gap report, proposed decisions, and the remaining live-host evidence gate.
- `BENCHMARK_RESULTS.md` records controlled before/after build and storage evidence from P2 and P5.
- `OPERATOR_RUNBOOK.md` documents feature flags, readiness checks, cleanup, canary operation, and rollback.

Read the implementation specifications in order:

1. `00_MASTER_IMPLEMENTATION_PLAN.md`: purpose, boundaries, phased work and acceptance gates.
2. `IMPLEMENTATION_TRACKER.md`: current phase, blockers, decisions, evidence, and next action.
3. `01_CODE_AUDIT_AND_DECISIONS.md`: mandatory first step, confirm code and host state.
4. `02_BUILD_TEMPLATES_AND_CACHE.md`: guarded Dockerfile changes and BuildKit experiments.
5. `03_METRICS_RETENTION_AND_UI.md`: trustworthy build measurements and rollback-safe storage management.
6. `04_VALIDATION_ROLLOUT.md`: fixtures, benchmarks, release/rollback gates.

Coding agent startup instruction:

> Work in `4hprojects/HelloDeploy`. Read all files in this pack and inspect the current repository HEAD. Begin with P0 read-only audit and gap report. Do not change production host, alter images, run prune, or start deployment without explicit authorization. Do not overwrite existing Docker architecture or host the HelloDeploy dashboard inside Docker. Produce one reviewable phase at a time.

Prepared 2026-10-09 after inspecting public repository main. Repository may change, so verify current head before implementing.
