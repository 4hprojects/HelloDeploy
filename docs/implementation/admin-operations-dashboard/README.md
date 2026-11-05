# HelloDeploy Admin Operations Dashboard — Implementation Package

Version 1.0 | Prepared 2026-11-05

## Start here

1. Read `00_MASTER_PLAN.md`.
2. Perform `01_EXISTING_SYSTEM_AUDIT.md` before any feature changes.
3. Read every remaining spec, resolve disagreements against current source and existing production architecture.
4. Use `08_IMPLEMENTATION_PHASES_AND_GATES.md` for sequencing and phase reporting.
5. Apply `09_TESTING_ACCEPTANCE_MATRIX.md` and `10_PRODUCTION_ROLLOUT_AND_OPERATIONS.md` for release gates.

## Contents

| File                                    | Purpose                                          |
| --------------------------------------- | ------------------------------------------------ |
| 00_MASTER_PLAN.md                       | Scope, decisions, constraints                    |
| 01_EXISTING_SYSTEM_AUDIT.md             | Mandatory read-only code audit                   |
| 02_UI_UX_DESKTOP_SPECIFICATION.md       | Desktop-first density, breakpoints, visual tests |
| 03_METRICS_AND_DATA_CONTRACTS.md        | Metric definitions, provenance, accuracy         |
| 04_LIVE_MONITORING_ARCHITECTURE.md      | Collector/cache/SSE/polling behavior             |
| 05_ADMIN_SETTINGS_CONFIGURATION.md      | Personal/global settings and validation          |
| 06_APPLICATION_DEPLOYMENT_SERVICES.md   | Health, queue, workers, activity                 |
| 07_ALERTS_HISTORY_AND_CAPACITY.md       | Incident lifecycle, retention, capacity          |
| 08_IMPLEMENTATION_PHASES_AND_GATES.md   | Phases and autonomy boundaries                   |
| 09_TESTING_ACCEPTANCE_MATRIX.md         | Tests and measurable criteria                    |
| 10_PRODUCTION_ROLLOUT_AND_OPERATIONS.md | Production safety and rollback                   |
| 11_SOURCES_AND_ASSUMPTIONS.md           | Verified references and unresolved assumptions   |

## Deliverables generated in repository by Claude Code

`PHASE_0_AUDIT_REPORT.md`, `IMPLEMENTATION_PROGRESS.md`, phase PRs/commits, screenshot evidence, benchmark results, updated operations docs and final implementation report. This archive itself contains no implementation code and does not authorize a production deploy without passing existing gates.

## Usage

Place these Markdown files under `docs/implementation/admin-operations-dashboard/` in the **HelloDeploy repository**, then paste the separate `CLAUDE_CODE_IMPLEMENTATION_PROMPT.md` to Claude Code from the repository root. Do not confuse with the HelloRun repository.
