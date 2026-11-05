# Implementation Phases and Gates

## Process

Use one reviewable PR/commit group per phase where practical; commit tested changes with clear messages. Maintain a living `IMPLEMENTATION_PROGRESS.md` with phase, files touched, commands, results, risks, next step. Do not auto-disable security gates or activate pilots to make tests pass.

### Phase 0 Audit [mandatory]

Read `01_EXISTING_SYSTEM_AUDIT.md`, record current SHA and source evidence, write `PHASE_0_AUDIT_REPORT.md`; reconcile architecture and update phase plan. **No feature code in Phase 0.** Gate: no unresolved privilege/schema ambiguity affecting Phase 1.

### Phase 1 UI and settings foundation

Build full-width responsive `/admin` hierarchy, compact KPI components, existing-data adapters, page-specific CSS/JS, personal settings and admin settings UI skeleton with real validated persistence where safe. Keep values genuine, placeholders explicitly unavailable. Gate: desktop screenshots, a11y and no regressions.

### Phase 2 trusted metrics

Implement bounded host/container collection via authorized boundary, sanitized shared snapshots, cached API, browser polling, freshness states, tests. Gate: source/units validated against host references; no Docker access in web; measured baseline overhead.

### Phase 3 operation integrations

Connect app health, queue counts/stages/events, platform services and builder, admin activity, event stream/reconnect/fallback. Gate: prove lifecycle correctness, failure testing and permissions.

### Phase 4 history and alerts

Add retention/downsampling and incident lifecycle, configurable alert rules, policy validation, maintenance notification muting, audit changes. Gate: bounded storage, data gap handling, dedupe and recovery tests.

### Phase 5 capacity and attention

Resource allocations versus usage, safe reserves, ranking and actionable attention panel, backup/release evidence when verified. Gate: no misleading estimates or unintended quota changes.

### Phase 6 rollout validation

Full lint/format/tests/browser/accessibility/assets checks, load profiling, documentation, migration/recovery proof, approved CI-gated release, production smoke and rollback evidence. Gate: no production deployment if health or rollback readiness is uncertain.

## Phase report template

- SHA and branch, summary, files added/modified, data/schema changes
- explicit requirement/acceptance evidence
- commands executed and results, screenshots, metrics overhead
- security and compatibility impact
- outstanding issues and decisions taken
- next phase and rollback points

## Autonomous execution policy

Claude Code may select safe implementation details, refactor for reuse, and run tests without user micro-approvals. It may work through successive phases after their gates pass. **Stop for explicit owner approval** before changing privileges, hosting architecture, security policy, production feature flags, deleting records, unreviewed destructive migrations, or deploying when backup/rollback prerequisites cannot be verified. No fake confirmations and no claim that inaccessible infrastructure was checked.
