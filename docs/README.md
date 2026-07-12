# HelloDeploy Documentation Index

Updated: 2026-07-12T05:29:27+08:00

Use this index as the starting point for repository documentation. The top-level README stays concise; this file owns the detailed documentation map.

## User Documentation

- [User Guide](USER_GUIDE.md) - account setup, project setup, GitHub connection, deployments, rollback, custom domains, roles, and troubleshooting.
- [FAQ](FAQ.md) - common user, project-owner, GitHub, deployment, domain, limits, and support questions.

## Operations Documentation

- [Operations Runbooks](OPERATIONS_RUNBOOKS.md) - incident response, backup, restore, upgrade, rollback, uninstall, and maintenance workflows.
- [Hardening and Pilot Report](HARDENING_AND_PILOT_REPORT.md) - local measurements, conservative operating thresholds, failure-recovery checklist, and pilot checklist.
- [Self-Hosted Install Guide](SELF_HOSTED_INSTALL.md) - supported Ubuntu versions, install modes, setup steps, required environment keys, and lifecycle commands.
- [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md) - authoritative monitor for current production-readiness execution, verification evidence, blockers, and completion gates.
- [Autonomous Work Loop](WORK_LOOP.md) - task-selection, continuation, evidence, failure-handling, autonomy, and stopping protocol for Codex work.
- [Full Implementation Overview](FULL_IMPLEMENTATION_OVERVIEW.md) - human-readable phase map for the complete production-readiness program.
- [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md) - release requirements, sequencing strategy, and the final production go/no-go gate.
- [Phase Task Tracker](PHASE_TASK_TRACKER.md) - superseded phase-based tracker retained as historical implementation and validation evidence.
- [UI/UX Improvement Backlog](UI_UX_IMPROVEMENT_BACKLOG.md) - planned usability, efficiency, mobile, confirmation, tooltip, form, and accessibility improvements.
- [UI/UX Accessibility Pass](UI_UX_ACCESSIBILITY_PASS.md) - focused accessibility findings and verification after shared UI component updates.
- [P9-P12 Maintenance Summary](P9_P12_MAINTENANCE_SUMMARY.md) - implementation handoff notes for custom domains, admin operations, hardening/pilot, and self-hosted distribution.

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

## Current Maintenance Notes

- P9-P12 implementation commits are recorded in [P9-P12 Maintenance Summary](P9_P12_MAINTENANCE_SUMMARY.md).
- Current implementation and validation status is tracked in the [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md).
- Continuous Codex work follows the [Autonomous Work Loop](WORK_LOOP.md); the tracker remains authoritative for status.
- Release requirements and strategy are defined by the [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md), while detailed completion evidence is preserved in the [Worklog](../WORKLOG.md).
- UI/UX implementation planning is tracked in [UI/UX Improvement Backlog](UI_UX_IMPROVEMENT_BACKLOG.md).
- UI/UX accessibility findings are recorded in [UI/UX Accessibility Pass](UI_UX_ACCESSIBILITY_PASS.md).
- Host-level recovery checks and the noncritical pilot deployment remain pending until run on the target host.
- The superseded phase tracker remains available for historical context only.
