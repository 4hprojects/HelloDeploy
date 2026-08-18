# HelloDeploy Documentation Index

Updated: 2026-08-14

Use this index as the starting point for repository documentation. The top-level README stays concise; this file owns the detailed documentation map.

## User Documentation

- [User Guide](USER_GUIDE.md) - account setup, project setup, GitHub connection, deployments, rollback, custom domains, roles, and troubleshooting.
- [FAQ](FAQ.md) - common user, project-owner, GitHub, deployment, domain, limits, and support questions.

## Operations Documentation

- [Operations Runbooks](OPERATIONS_RUNBOOKS.md) - incident response, backup, restore, upgrade, rollback, uninstall, maintenance workflows, and the post-release non-root container smoke test.
- [Self-Hosted Install Guide](SELF_HOSTED_INSTALL.md) - supported Ubuntu versions, install modes, setup steps, required environment keys, and lifecycle commands.
- [Environment Reference](ENVIRONMENT.md) - every environment variable read by the web and worker processes, grouped by concern.
- [Product and Platform Architecture](PLATFORM_ARCHITECTURE.md) - canonical self-hosted product definition, single-host V1 topology, process boundaries, domains, deployment lifecycle, and deferred multi-node scope.

## Production Readiness and Status

- [Priorities](PRIORITIES.md) - quick-scan, actively-maintained punch list of what's next across every open track. Start here for current status.
- [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md) - authoritative monitor for current production-readiness execution, verification evidence, blockers, completion gates, and the current handoff state.
- [HelloDeploy and HelloUniversity Production Plan](HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md) - prioritized P0-P6 execution plan and live-cutover evidence log for completing the real deployment workflow and hosting HelloUniversity through HelloDeploy. The most current release-gate record.
- [Second-Site Deployment Checklist](SECOND_SITE_DEPLOYMENT_CHECKLIST.md) - narrow "is HelloDeploy ready to onboard a second real site right now" pre-flight checklist and live-pilot tracker.
- [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md) - the 8-phase release-blocking requirements checklist and final go/no-go gate. For current live status, see the Production Plan above.
- [Live Workflow Acceptance Checklist](LIVE_WORKFLOW_ACCEPTANCE.md) - Passed/Failed/Blocked/Not Run matrix for public, authenticated owner, and operator lifecycle validation. For current live status, see the Production Plan above.
- [Project Status Review](PROJECT_STATUS_REVIEW.md) - synthesized architecture, test/code-quality, and direction-alignment review with an estimated completion percentage.
- [Autonomous Work Loop](WORK_LOOP.md) - task-selection, continuation, evidence, failure-handling, autonomy, and stopping protocol for autonomous work.

## Session Audit Trail (2026-08-13)

Five focused audits run back-to-back across the platform's major surfaces, each with its own resolved backlog tracked in [Priorities](PRIORITIES.md).

- [Admin UX Audit](ADMIN_UX_AUDIT.md) - admin-side efficiency/intuitiveness audit (Track D, resolved).
- [Guest Experience Audit](GUEST_EXPERIENCE_AUDIT.md) - guest-facing landing/marketing audit (Track E, resolved).
- [System Analysis](SYSTEM_ANALYSIS.md) - platform-wide user-friendliness, functionality, and intuitivity audit (Track F, resolved).
- [Onboarding Handoff Audit](ONBOARDING_HANDOFF_AUDIT.md) - guest-to-user signup, email verification, and first-login handoff audit (Track G, resolved).
- [Security Review](SECURITY_REVIEW.md) - OWASP-style review of all code added or changed across the above audits plus Track G; came back clean both passes.

## Engineering Backlog

- [Improvements](IMPROVEMENTS.md) - the Round 1 and Round 2 code-quality/security review backlog and its resolution status.
- [UI/UX Improvement Backlog](UI_UX_IMPROVEMENT_BACKLOG.md) - usability, efficiency, mobile, confirmation, tooltip, form, and accessibility improvements, including accessibility verification evidence.
- [Project Settings Deferred Capability Evaluations](PROJECT_SETTINGS_DEFERRED_CAPABILITIES.md) - product, architecture, security, operations, evidence, and approval gates for settings capabilities that remain explicitly deferred.
- [Public Git Repository Connection Specification](PUBLIC_GIT_REPOSITORY_SPEC.md) - accepted two-path repository UX, source model, security boundaries, implementation contract, and acceptance criteria; implemented locally with live worker validation pending.

## Legal and Policy Documentation

- [Legal Policies](LEGAL_POLICIES.md) - acceptable use, privacy, retention, copyright, security, data-processing, and pilot policy coverage.
- [Release Policy](RELEASE_POLICY.md) - release and tagging process.

## Historical Snapshots (superseded)

Point-in-time reports retained in [`archive/`](archive/) for historical record only — not current status. See the active docs above instead.

- [Full Implementation Overview](archive/FULL_IMPLEMENTATION_OVERVIEW.md) - human-readable phase map, superseded by the Implementation Batch Tracker.
- [Full Project Review (2026-07-12)](archive/FULL_PROJECT_REVIEW_2026-07-12.md) - dated NO-GO assessment, superseded by the Project Status Review.
- [P9-P12 Maintenance Summary](archive/P9_P12_MAINTENANCE_SUMMARY.md) - implementation handoff notes for custom domains, admin operations, hardening/pilot, and self-hosted distribution, superseded by the Worklog.
- [Hardening and Pilot Report](archive/HARDENING_AND_PILOT_REPORT.md) - local measurements and pilot checklist from early July, superseded by the Live Workflow Acceptance Checklist.
- [Phase Task Tracker](archive/PHASE_TASK_TRACKER.md) - superseded phase-based tracker retained as historical implementation and validation evidence.
- [Project Settings UX Specification](archive/PROJECT_SETTINGS_UX_SPEC.md) - consolidated Project Settings page spec and delivery plan; all 4 phases shipped 2026-07-13, retained as a closed delivery record.
- [Worklog Archive — 2026-07](archive/WORKLOG_2026-07.md) - 100 of `WORKLOG.md`'s 117 entries (2026-07-02 through 2026-07-31), split off 2026-08-14 to keep the live file a manageable size.

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

- Current implementation and validation status is tracked in the [Implementation Batch Tracker](IMPLEMENTATION_BATCH_TRACKER.md); the [HelloDeploy and HelloUniversity Production Plan](HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md) is the most current release-gate evidence log.
- What to work on next — across every open track — is in [Priorities](PRIORITIES.md); that file is the single quick-scan source of truth, updated as priorities shift.
- Continuous autonomous work follows the [Autonomous Work Loop](WORK_LOOP.md); the batch tracker remains authoritative for status.
- Release requirements and strategy are defined by the [Deployment Readiness Roadmap](DEPLOYMENT_READINESS_ROADMAP.md), while detailed completion evidence is preserved in the [Worklog](../WORKLOG.md).
- UI/UX implementation and accessibility planning is tracked in [UI/UX Improvement Backlog](UI_UX_IMPROVEMENT_BACKLOG.md).
- Host-level recovery checks and the noncritical pilot deployment remain pending until run on the target host.
- P9-P12 implementation commits, the superseded phase tracker, and the completed Project Settings UX delivery record remain available for historical context only — see Historical Snapshots above.
