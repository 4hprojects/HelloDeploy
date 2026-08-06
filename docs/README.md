# HelloDeploy Documentation Index

Updated: 2026-08-06T12:57:27+08:00

Use this index as the starting point for repository documentation. The top-level README stays concise; this file owns the detailed documentation map.

## User Documentation

- [User Guide](USER_GUIDE.md) - account setup, project setup, GitHub connection, deployments, rollback, custom domains, roles, and troubleshooting.
- [FAQ](FAQ.md) - common user, project-owner, GitHub, deployment, domain, limits, and support questions.

## Operations Documentation

- [Operations Runbooks](OPERATIONS_RUNBOOKS.md) - incident response, backup, restore, upgrade, rollback, uninstall, and maintenance workflows.
- [Self-Hosted Install Guide](SELF_HOSTED_INSTALL.md) - supported Ubuntu versions, install modes, setup steps, required environment keys, and lifecycle commands.
- [Product and Platform Architecture](PLATFORM_ARCHITECTURE.md) - canonical self-hosted product definition, single-host V1 topology, process boundaries, domains, deployment lifecycle, and deferred multi-node scope.
- [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md) - authoritative monitor for current production-readiness execution, verification evidence, blockers, and completion gates.
- [HelloDeploy and HelloRun Production Plan](HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md) - prioritized P0-P6 execution plan for completing the real deployment workflow and hosting HelloRun through HelloDeploy.
- [Priorities](PRIORITIES.md) - quick-scan punch list of what's next, across both the production-cutover track and the code-quality/security backlog.
- [Project Status Review](PROJECT_STATUS_REVIEW.md) - synthesized architecture, test/code-quality, and direction-alignment review with an estimated completion percentage.
- [Autonomous Work Loop](WORK_LOOP.md) - task-selection, continuation, evidence, failure-handling, autonomy, and stopping protocol for Codex work.
- [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md) - release requirements, sequencing strategy, and the final production go/no-go gate.
- [UI/UX Improvement Backlog](UI_UX_IMPROVEMENT_BACKLOG.md) - planned usability, efficiency, mobile, confirmation, tooltip, form, and accessibility improvements.
- [UI/UX Accessibility Pass](UI_UX_ACCESSIBILITY_PASS.md) - focused accessibility findings and verification after shared UI component updates.
- [Project Settings UX Specification](PROJECT_SETTINGS_UX_SPEC.md) - sanitized reference analysis and phased specification for consolidating existing project settings without claiming unsupported platform capabilities.
- [Project Settings Deferred Capability Evaluations](PROJECT_SETTINGS_DEFERRED_CAPABILITIES.md) - product, architecture, security, operations, evidence, and approval gates for settings capabilities that remain explicitly deferred.
- [Public Git Repository Connection Specification](PUBLIC_GIT_REPOSITORY_SPEC.md) - accepted two-path repository UX, source model, security boundaries, implementation contract, and acceptance criteria; implemented locally with live worker validation pending.
- [Live Workflow Acceptance Checklist](LIVE_WORKFLOW_ACCEPTANCE.md) - authoritative Passed/Failed/Blocked/Not Run matrix for public, authenticated owner, and operator lifecycle validation.

## Historical Snapshots (superseded)

Point-in-time reports retained for historical record only — not current status. See
the active docs above instead.

- [Full Implementation Overview](FULL_IMPLEMENTATION_OVERVIEW.md) - human-readable phase map, superseded by the Implementation Batch Tracker.
- [Full Project Review (2026-07-12)](FULL_PROJECT_REVIEW_2026-07-12.md) - dated NO-GO assessment, superseded by the Project Status Review.
- [P9-P12 Maintenance Summary](P9_P12_MAINTENANCE_SUMMARY.md) - implementation handoff notes for custom domains, admin operations, hardening/pilot, and self-hosted distribution, superseded by the Worklog.
- [Hardening and Pilot Report](HARDENING_AND_PILOT_REPORT.md) - local measurements and pilot checklist from early July, superseded by the Live Workflow Acceptance Checklist.
- [Phase Task Tracker](PHASE_TASK_TRACKER.md) - superseded phase-based tracker retained as historical implementation and validation evidence.

## Legal and Policy Documentation

- [Legal Policies](LEGAL_POLICIES.md) - acceptable use, privacy, retention, copyright, security, data-processing, and pilot policy coverage.

## Blueprint and Specification

- [Master Blueprint Index](../hellodeploy-blueprint/00_MASTER_INDEX.md)
- [Implementation Phases](../hellodeploy-blueprint/07_IMPLEMENTATION_PHASES.md)
- [Testing and Acceptance](../hellodeploy-blueprint/08_TESTING_AND_ACCEPTANCE.md)
- [Decisions and Deferred Work](../hellodeploy-blueprint/11_DECISIONS_AND_DEFERRED_WORK.md)

## Infrastructure and ADRs

- [Infrastructure Notes](../infrastructure/README.md)
- [ADR-001 Framework](../infrastructure/decisions/ADR-001-framework.md)
- [ADR-002 Database](../infrastructure/decisions/ADR-002-database.md)
- [ADR-003 Queue](../infrastructure/decisions/ADR-003-queue.md)
- [ADR-004 Authentication](../infrastructure/decisions/ADR-004-auth.md)
- [ADR-005 Encryption](../infrastructure/decisions/ADR-005-encryption.md)
- [ADR-006 Public Git Repository Sources](../infrastructure/decisions/ADR-006-public-git-sources.md) - proposed; requires explicit approval before implementation.

## Current Maintenance Notes

- Current implementation and validation status is tracked in the [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md).
- The [HelloDeploy and HelloRun Production Plan](HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md) translates that status into the goal-specific sequence for the controlled HelloRun pilot.
- What to work on next — across both the production-cutover track and the code-quality/security backlog — is in [Priorities](PRIORITIES.md).
- Continuous Codex work follows the [Autonomous Work Loop](WORK_LOOP.md); the tracker remains authoritative for status.
- Release requirements and strategy are defined by the [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md), while detailed completion evidence is preserved in the [Worklog](../WORKLOG.md).
- UI/UX implementation planning is tracked in [UI/UX Improvement Backlog](UI_UX_IMPROVEMENT_BACKLOG.md).
- UI/UX accessibility findings are recorded in [UI/UX Accessibility Pass](UI_UX_ACCESSIBILITY_PASS.md).
- Host-level recovery checks and the noncritical pilot deployment remain pending until run on the target host.
- P9-P12 implementation commits and the superseded phase tracker remain available for historical context only — see Historical Snapshots above.
