# Claude Code Kickoff Prompt — HelloDeploy Admin Operations Dashboard

You are working in the **HelloDeploy repository**, not HelloRun. Implement the approved Admin Operations Dashboard according to the Markdown package in `docs/implementation/admin-operations-dashboard/` (if the files were copied elsewhere, locate this package and establish its actual path first).

Read, in order:

1. `README.md`
2. `00_MASTER_PLAN.md`
3. `01_EXISTING_SYSTEM_AUDIT.md`
4. Every remaining numbered specification (`02` through `11`), including phase gates, security, testing and rollout requirements.

**First task: Phase 0 source-level audit only.** Inspect the actual current `main` code, architecture, admin overview route/controller/EJS, observability package, worker/Docker boundaries, queue/BullMQ, SSE, database schema, quotas, administrative settings, CSS/JS assets, tests, and production runbooks. Record the current full commit SHA and evidence-based findings in `PHASE_0_AUDIT_REPORT.md`. Reconcile the package's assumptions against actual code. Do not create features, migrations or change infrastructure during this audit.

After the audit, implement Phases 1–6 sequentially **when the audit finds no unresolved architecture or security blockers**. You have authority to analyze alternatives, select the safest maintainable implementation, reuse existing modules, make routine engineering decisions, write and run tests, update progress notes, and advance from one phase to the next as its gate passes. Do not stop for routine implementation choices. Do not invent test results or claim production checks were performed without access.

Non-negotiable requirements:

- Preserve existing route `/admin`, styling and RBAC; maximize desktop width at 1366/1600/1920/2560, use compact responsive KPIs/tables/charts, collapsible sidebar, and support mobile and dark mode.
- Hybrid live monitoring: shared bounded metrics collection, cached 15-second default resource updates, service/history appropriate intervals, SSE for incident/deployment transitions, no whole-page refresh, reconnection, fallback, hidden-tab behavior and stale timestamps.
- Separate host total, actual usage, configured project limits, and policy headroom. Differentiate running containers from healthy applications, active incident from historical failure counts, local health from public reachability, and Unknown from Healthy.
- Add admin settings at an appropriate consistent route, targeting `/admin/overview/settings`; personal preferences versus audited, permission-controlled global policies; configurable intervals, alerts and historical retention with safe limits.
- Keep web unprivileged. NEVER grant the public web process Docker socket, sudo, host shell or Nginx helper privileges. Collect and publish only sanitized snapshots from an authorized existing boundary.
- No mandatory Prometheus/Grafana or heavyweight service unless measured evidence and explicit owner approval justify it. Respect current Node/runtime, assets budget, existing CI and documentation.
- No enabling remote builder or multi-runtime pilot flags, no destructive dashboard controls, no automatic quota changes, no unrelated rewrites.

At the end of **each phase**, record `IMPLEMENTATION_PROGRESS.md` including changed files, design decisions, tests run and exact results, screenshots/metrics when applicable, security and performance impacts, remaining risks and next phase. Fix failures before advancing. Use existing release gates, backup/rollback and production health checks. You may deploy to production **only if** existing workflow permits it, all required CI/checks and verified backup/rollback prerequisites pass, and no protected approval boundary is crossed. If verification/access is unavailable, leave production untouched and report the blocker.

Require explicit owner approval before broadening host privileges, altering deployment topology or security policy, enabling experimental builder/pilot features, performing destructive schema/data changes, or bypassing a failed production gate. Never guess such approval.

Start now with Phase 0 and write its audit report. Then continue autonomously within these boundaries, one verified phase at a time.
