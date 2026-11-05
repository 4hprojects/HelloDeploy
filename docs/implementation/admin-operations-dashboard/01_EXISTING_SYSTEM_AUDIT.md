# Phase 0 — Mandatory Existing System Audit

## Stop rule

No feature, migration, UI, collector, privilege, infrastructure or production changes during Phase 0. Produce an audit report and update downstream plans for discovered differences. After audit, proceed through phases only if architecture is compatible and gates are satisfied.

## Inspect with evidence (path, symbol, line range, behavior)

1. `apps/web` admin `/admin` route, controller, EJS view, layout, permissions, sidebar, public assets, JS/CSS budgets.
2. `packages/observability` or equivalent: existing metrics schema, collectors, tracing, health, event handling.
3. Existing host metrics and source of displayed memory percentage; Linux available vs used semantics.
4. `apps/worker`: Docker access, stats, container ownership labels and release classification, locks, health and route helpers.
5. `packages/queue` and BullMQ: queue counts, job states, progress/status events, failed-job retention and retry semantics.
6. MongoDB schema: users, projects, deployments, audit, project quotas; indexes, existing dashboard settings and history.
7. Current SSE deployment-log implementation: auth, ownership, heartbeat, disconnect, proxy buffering, multiple browser tabs.
8. Service readiness and health paths, systemd, Nginx, Redis, MongoDB, tunnel, build-service flags and remote builder pilot.
9. Backup/rollback runbooks, deploy timer, CI gates, Node engine, feature flags, current `docs/PRIORITIES.md`.
10. Existing tests and accessibility/performance tooling. Determine what can be reused without dependencies.

## Classification

For each proposed feature mark: Existing and reusable / Extend / Missing / Unsafe or unavailable / Out of scope. Include actual code owner, data source, collection cost, privileges needed, fallback, test plan.

## Decisions to resolve

- Can the already privileged worker safely emit sanitized metrics snapshots without impacting deploy throughput, or is a restricted collector warranted?
- Where to store shared latest snapshots and aggregate history with bounded writes?
- Does current SSE architecture permit admin-scoped event stream reuse without leaking project logs or duplicating connections?
- Are per-project CPU/memory limits enforceable and correctly attributable to active releases?
- Which service checks reflect actual functioning rather than mere TCP connectivity?
- What data from backup/CI/release verification is authoritative?
- Are 15s updates safe on the current host?

## Required audit artifact

Create `PHASE_0_AUDIT_REPORT.md` in the repository's implementation folder with:

- current commit SHA, architecture diagram, precise code map
- reuse table and missing pieces
- RBAC/privilege and data-leak analysis
- schema and migration implications
- resource impact estimate and initial baseline
- recommended changes to each phase with reasons
- risks, open assumptions, explicit approved/blocked decisions
- test commands and rollout prerequisites

Do not invent evidence. If access to live host is unavailable, mark runtime verification pending and continue only with safe code/static planning.
