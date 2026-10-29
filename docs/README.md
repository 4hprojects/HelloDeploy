# HelloDeploy Documentation Index

Updated: 2026-10-21

Start here. The top-level [README](../README.md) stays short; this file maps every current
document. Status and "what's next" live in exactly one place: [Priorities](PRIORITIES.md).

## Start here

- [Priorities](PRIORITIES.md) - the single current list of what to work on, and where things stand.
- [Multi-Runtime Deployments](multi-runtime/README.md) - overview of the newest initiative: what
  was built, how it shipped, and the gates before users can use it.

## For users

- [User Guide](USER_GUIDE.md) - accounts, projects, GitHub connection, the canonical list of
  supported applications, deployments, rollback, custom domains, roles, and troubleshooting.
- [FAQ](FAQ.md) - common user, project, GitHub, deployment, domain, limits, and pilot questions.
- [Legal Policies](LEGAL_POLICIES.md) - acceptable use, privacy, retention, copyright, security,
  and data-processing policies.

## For operators

- [Operations Runbooks](OPERATIONS_RUNBOOKS.md) - incidents, backup, restore, upgrade, automatic
  deploys, rollback, multi-runtime pilot controls, and uninstall.
- [Self-Hosted Install Guide](SELF_HOSTED_INSTALL.md) - supported Ubuntu versions, install modes,
  setup steps, required environment, and lifecycle commands.
- [Environment Reference](ENVIRONMENT.md) - every environment variable read by the web and
  worker, including the pilot flags.
- [Release Policy](RELEASE_POLICY.md) - automatic CI-gated deploys and manual tagged releases.

## For developers

- [Product and Platform Architecture](PLATFORM_ARCHITECTURE.md) - product definition, single-host
  topology, process boundaries, the optional build tier, and deferred scope.
- [Screen-Reader Check](SCREEN_READER_CHECK.md) - a guided 15–20 minute manual check with Orca;
  repeat after large UI changes.
- [UI Design System](UI_DESIGN_SYSTEM.md) - canonical CSS and EJS patterns for the dashboard.
- [Project Settings Deferred Capabilities](PROJECT_SETTINGS_DEFERRED_CAPABILITIES.md) - settings
  capabilities that stay deferred, and the gates that would unlock them.
- [Autonomous Work Loop](WORK_LOOP.md) - task selection, evidence, and stopping protocol for
  coding agents.

## Initiatives

- [Multi-runtime](multi-runtime/README.md) - Next.js modes, Python, PHP, Java, owner Dockerfiles
  and prebuilt images; merged with every pilot off. Status in
  [multi-runtime/STATUS.md](multi-runtime/STATUS.md).
- [Docker optimization](docker-optimization/README.md) - opt-in `optimized-v1` image templates
  (P0–P1 done); cache, metrics, retention, and rollout phases not started.
- [Learning Hub](learning-hub/00_MASTER_PLAN.md) - public `/blog` with Markdown tutorials, views,
  sharing, and fail-closed guest comments. Status in
  [learning-hub/13_PHASE_TRACKER.md](learning-hub/13_PHASE_TRACKER.md).

## Design notes

- [Custom Domains via Cloudflare for SaaS](design/CUSTOM_DOMAINS_CLOUDFLARE_FOR_SAAS.md)
- [Restricted Compose proposal (P5)](multi-runtime/P5_COMPOSE_ADR.md)

## Archive

Earlier trackers, resolved audits, finished phase specs, and planning briefs are kept for
history in [archive/](archive/README.md). Nothing there is current status.

## Blueprint and ADRs

- [Master Blueprint Index](../hellodeploy-blueprint/00_MASTER_INDEX.md)
- [Implementation Phases](../hellodeploy-blueprint/07_IMPLEMENTATION_PHASES.md)
- [Testing and Acceptance](../hellodeploy-blueprint/08_TESTING_AND_ACCEPTANCE.md)
- [Decisions and Deferred Work](../hellodeploy-blueprint/11_DECISIONS_AND_DEFERRED_WORK.md)
- [Infrastructure Notes](../infrastructure/README.md)
- ADRs: [001 Framework](../infrastructure/decisions/ADR-001-framework.md),
  [002 Database](../infrastructure/decisions/ADR-002-database.md),
  [003 Queue](../infrastructure/decisions/ADR-003-queue.md),
  [004 Authentication](../infrastructure/decisions/ADR-004-auth.md),
  [005 Encryption](../infrastructure/decisions/ADR-005-encryption.md),
  [006 Public Git Repository Sources](../infrastructure/decisions/ADR-006-public-git-sources.md)
  (accepted).

Detailed dated evidence is in the [Worklog](../WORKLOG.md).
