# HelloDeploy Documentation Index

Updated: 2026-07-02T00:01:30+08:00

Use this index as the starting point for repository documentation. The top-level README stays concise; this file owns the detailed documentation map.

## User Documentation

- [User Guide](USER_GUIDE.md) - account setup, project setup, GitHub connection, deployments, rollback, custom domains, roles, and troubleshooting.
- [FAQ](FAQ.md) - common user, project-owner, GitHub, deployment, domain, limits, and support questions.

## Operations Documentation

- [Operations Runbooks](OPERATIONS_RUNBOOKS.md) - incident response, backup, restore, upgrade, rollback, uninstall, and maintenance workflows.
- [Hardening and Pilot Report](HARDENING_AND_PILOT_REPORT.md) - local measurements, conservative operating thresholds, failure-recovery checklist, and pilot checklist.
- [Self-Hosted Install Guide](SELF_HOSTED_INSTALL.md) - supported Ubuntu versions, install modes, setup steps, required environment keys, and lifecycle commands.
- [Phase Task Tracker](PHASE_TASK_TRACKER.md) - active checklist for remaining implementation and target-host validation work.
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
- Remaining implementation and validation work is tracked in [Phase Task Tracker](PHASE_TASK_TRACKER.md).
- UI/UX implementation planning is tracked in [UI/UX Improvement Backlog](UI_UX_IMPROVEMENT_BACKLOG.md).
- UI/UX accessibility findings are recorded in [UI/UX Accessibility Pass](UI_UX_ACCESSIBILITY_PASS.md).
- Host-level P11 recovery checks and the noncritical pilot deployment remain pending until run on the target host.
- The implementation phase checklist uses explicit status labels for completed, partial, blocked, and deferred work.
