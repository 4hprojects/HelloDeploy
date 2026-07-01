# Phase Task Tracker

Updated: 2026-07-01T23:38:16+08:00

This is the active tracker for remaining HelloDeploy implementation and validation work. Update this file during every implementation pass before committing and pushing.

## Status Legend

- `Pending`: Not started.
- `In Progress`: Actively being worked on.
- `Done`: Implemented or validated, with evidence recorded.
- `Partial`: Some implementation or validation exists, but acceptance evidence is incomplete.
- `Blocked`: Requires external access, target-host service control, or another prerequisite.
- `Deferred`: Intentionally out of current scope.

## Update Rules

- Update `Status`, `Acceptance Evidence`, and `Updated` whenever a tracker item changes.
- Link to supporting docs, commits, test output summaries, or reports where applicable.
- Keep related documents aligned: [WORKLOG.md](../WORKLOG.md), [Documentation Index](README.md), [P9-P12 Maintenance Summary](P9_P12_MAINTENANCE_SUMMARY.md), [UI/UX Improvement Backlog](UI_UX_IMPROVEMENT_BACKLOG.md), and [Implementation Phases](../hellodeploy-blueprint/07_IMPLEMENTATION_PHASES.md).
- Do not mark host-level validation `Done` unless it was run against the target host or an equivalent explicitly documented environment.

## Phase 8: Deployment Experience and Rollback

| ID    | Status  | Task                                                                         | Acceptance Evidence                                                           | Updated                   |
| ----- | ------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------- |
| P8-01 | Pending | Verify deploy latest, selected commit, current commit, and no-cache options. | Browser or integration evidence for each option.                              | 2026-07-01T18:50:24+08:00 |
| P8-02 | Pending | Verify deployment timeline and stage display.                                | Deployment page shows validation, build, startup, health, and routing stages. | 2026-07-01T18:50:24+08:00 |
| P8-03 | Pending | Verify safe build and runtime log viewers.                                   | Logs render redacted output and do not expose secrets.                        | 2026-07-01T18:50:24+08:00 |
| P8-04 | Pending | Verify cancellation and manual retry flows.                                  | Cancel and retry actions work without corrupting deployment state.            | 2026-07-01T18:50:24+08:00 |
| P8-05 | Pending | Verify retained healthy release rollback.                                    | Rollback restores a retained healthy release without manual server commands.  | 2026-07-01T18:50:24+08:00 |
| P8-06 | Partial | Verify deployment notifications.                                             | Notification helper exists; delivery behavior needs end-to-end verification.  | 2026-07-01T18:50:24+08:00 |
| P8-07 | Pending | Verify live deployment progress behavior.                                    | Server-Sent Events or equivalent live progress behavior is proven in browser. | 2026-07-01T18:50:24+08:00 |

## Phase 9: Custom Domains

| ID    | Status  | Task                                      | Acceptance Evidence                                                                    | Updated                   |
| ----- | ------- | ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------- |
| P9-01 | Blocked | Verify HTTPS custom-domain behavior.      | Real target-host custom domain serves successfully over HTTPS.                         | 2026-07-01T18:50:24+08:00 |
| P9-02 | Blocked | Verify canonical-domain behavior.         | Canonical host behavior is documented and verified against the real ingress/TLS setup. | 2026-07-01T18:50:24+08:00 |
| P9-03 | Blocked | Verify route activation rollback on host. | Failed Nginx/TLS route activation leaves existing routes operational.                  | 2026-07-01T18:50:24+08:00 |

## Phase 10: Administration and Operations

| ID     | Status  | Task                                                     | Acceptance Evidence                                                                               | Updated                   |
| ------ | ------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| P10-01 | Partial | Verify inactivity reports and operational notifications. | Admin-facing report and notification delivery are proven without leaking secrets.                 | 2026-07-01T18:50:24+08:00 |
| P10-02 | Partial | Verify responsive admin layouts.                         | Admin sidebar, tables, cards, forms, and dashboards are checked across mobile and desktop widths. | 2026-07-01T18:50:24+08:00 |
| P10-03 | Partial | Verify light/dark theme persistence.                     | Theme selection survives reload and works across public, auth, dashboard, and admin pages.        | 2026-07-01T18:50:24+08:00 |
| P10-04 | Pending | Verify operational alert path.                           | Configured Super Admin receives expected operational alerts in a safe test.                       | 2026-07-01T18:50:24+08:00 |

## Phase 11: Hardening and Pilot

| ID     | Status  | Task                                                         | Acceptance Evidence                                                                                                     | Updated                   |
| ------ | ------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| P11-01 | Pending | Run HTTP sampling against `/health`.                         | `scripts/measure-capacity.js --url ...` output recorded in [Hardening and Pilot Report](HARDENING_AND_PILOT_REPORT.md). | 2026-07-01T18:50:24+08:00 |
| P11-02 | Pending | Run load, build concurrency, and resource-exhaustion checks. | Measurements and safe operating thresholds recorded in the hardening report.                                            | 2026-07-01T18:50:24+08:00 |
| P11-03 | Blocked | Test MongoDB failure recovery.                               | Web startup and `/health` behavior recorded after temporary MongoDB disruption.                                         | 2026-07-01T18:50:24+08:00 |
| P11-04 | Blocked | Test Redis failure recovery.                                 | Queue pause/restart/reconnect behavior recorded.                                                                        | 2026-07-01T18:50:24+08:00 |
| P11-05 | Blocked | Test Docker failure recovery.                                | Worker reports Docker failures safely during controlled disruption.                                                     | 2026-07-01T18:50:24+08:00 |
| P11-06 | Blocked | Test Nginx failure recovery.                                 | Invalid staging route is rejected or rolled back without breaking existing routes.                                      | 2026-07-01T18:50:24+08:00 |
| P11-07 | Blocked | Test worker restart behavior.                                | Queued job retry/recovery behavior recorded after worker restart.                                                       | 2026-07-01T18:50:24+08:00 |
| P11-08 | Blocked | Test Cloudflare Tunnel outage behavior.                      | Platform remains safe while public ingress is unavailable.                                                              | 2026-07-01T18:50:24+08:00 |
| P11-09 | Blocked | Complete noncritical pilot deployment.                       | Pilot checklist completed against a real noncritical repository on target host.                                         | 2026-07-01T18:50:24+08:00 |

## Phase 12: Distribution and Self-Hosted Edition

| ID     | Status  | Task                                                               | Acceptance Evidence                                                                 | Updated                   |
| ------ | ------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------- |
| P12-01 | Blocked | Validate clean target-host install.                                | Clean Ubuntu 22.04 or 24.04 machine installs using documented steps.                | 2026-07-01T18:50:24+08:00 |
| P12-02 | Blocked | Prove backup and restore on second machine.                        | Backup from one machine restores successfully on a second supported Ubuntu machine. | 2026-07-01T18:50:24+08:00 |
| P12-03 | Pending | Verify no original-server identifiers remain in install artifacts. | Install artifacts are reviewed and documented as portable.                          | 2026-07-01T18:50:24+08:00 |
| P12-04 | Pending | Verify upgrade and uninstall scripts on target host.               | Upgrade and uninstall workflow results are recorded in operations docs.             | 2026-07-01T18:50:24+08:00 |

## Cross-Cutting Maintenance

| ID   | Status  | Task                                         | Acceptance Evidence                                                                                                             | Updated                   |
| ---- | ------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| X-01 | Pending | Keep tracker updated during implementation.  | Each future implementation commit updates changed tracker rows.                                                                 | 2026-07-01T18:50:24+08:00 |
| X-02 | Pending | Keep documentation index aligned.            | New or moved markdown files are linked from [Documentation Index](README.md).                                                   | 2026-07-01T18:50:24+08:00 |
| X-03 | Pending | Keep implementation phase blueprint aligned. | Phase status changes are reflected in [Implementation Phases](../hellodeploy-blueprint/07_IMPLEMENTATION_PHASES.md).            | 2026-07-01T18:50:24+08:00 |
| X-04 | Pending | Keep worklog entries timestamped.            | Each implementation pass has started/completed timestamps in [WORKLOG.md](../WORKLOG.md).                                       | 2026-07-01T18:50:24+08:00 |
| X-05 | Done    | Keep UI/UX backlog aligned.                  | UX-01 through UX-08 implementations updated [UI/UX Improvement Backlog](UI_UX_IMPROVEMENT_BACKLOG.md) with status and evidence. | 2026-07-01T23:38:16+08:00 |
