# P9-P12 Maintenance Summary

Updated: 2026-07-01T18:39:27+08:00

This summary records the completed P9-P12 implementation work for future maintenance, audits, and handoffs. Operational validations that require target-host service control are tracked separately below.

## Completed Priorities

| Priority | Focus                                  | Commit    |
| -------- | -------------------------------------- | --------- |
| P9       | Custom domain activation hardening     | `44b047b` |
| P10      | Administration and operations controls | `b1348ee` |
| P11      | Hardening and pilot measurements       | `36853d1` |
| P12      | Self-hosted distribution planning      | `9794aed` |

## P9 Custom Domains

- Admin approval now records approval and queues route activation without marking a domain active early.
- The worker marks a custom domain `ACTIVE` only after Nginx route activation succeeds while Nginx is enabled.
- Custom-domain Nginx route filenames now use stable hash-based slugs.
- Activation failures leave domains non-active and bubble worker errors for retry/failure handling.
- Added focused tests for DNS verification, activation success, activation failure, and unapproved activation attempts.

## P10 Administration And Operations

- Added database-backed maintenance mode.
- Added Super Admin maintenance controls on `/admin/server`.
- Maintenance mode blocks non-Super-Admin mutating requests while allowing safe read-only requests and maintenance control paths.
- Added filtered audit CSV export and audit logging for export activity.
- Hardened quota override parsing and validation.
- Updated quota views to show stored quota fields and user/project consumption context.
- Added cleanup safeguards so active project deployments are not removed by release cleanup.
- Added operations runbooks for incident response, backup, restore, upgrade, rollback, and uninstall workflows.

Reference:

- [`docs/OPERATIONS_RUNBOOKS.md`](OPERATIONS_RUNBOOKS.md)

## P11 Hardening And Pilot

- Added `scripts/measure-capacity.js` for non-destructive host snapshots and optional local HTTP sampling.
- Captured local host capacity data:
  - 8 CPU cores
  - 31% memory used
  - 5% workspace filesystem used
  - 894.1 GB free on the workspace filesystem
- Added a hardening and pilot report with conservative thresholds, recovery-check status, and a noncritical pilot checklist.
- Documented host-level recovery checks that still require service control on the target host.

Reference:

- [`docs/HARDENING_AND_PILOT_REPORT.md`](HARDENING_AND_PILOT_REPORT.md)
- [`scripts/measure-capacity.js`](../scripts/measure-capacity.js)

## P12 Self-Hosted Edition

- Added `scripts/self-hosted-checklist.js` for non-mutating install planning.
- Documented self-hosted modes:
  - Local-only
  - Public IP
  - Cloudflare Tunnel
- Documented supported Ubuntu versions: 22.04 and 24.04.
- Documented required environment keys and clean install steps.
- Confirmed the project license is MIT.

Reference:

- [`docs/SELF_HOSTED_INSTALL.md`](SELF_HOSTED_INSTALL.md)
- [`scripts/self-hosted-checklist.js`](../scripts/self-hosted-checklist.js)
- [`LICENSE`](../LICENSE)

## Verification

Each completed priority was verified with:

```sh
npm run format
npm run lint
npm run format:check
npm test
```

Final full-suite result after P12:

- 385 tests
- 0 failures

## Current Maintenance Notes

- `main` was pushed after each priority.
- The working tree was clean and aligned with `origin/main` immediately after P12. Later documentation-maintenance edits are tracked in the current working tree until committed.
- Host-level recovery checks for MongoDB, Redis, Docker, Nginx, worker restart, and Cloudflare Tunnel remain environment-dependent and should be executed on the target host before public pilot.
- The noncritical pilot deployment checklist in `docs/HARDENING_AND_PILOT_REPORT.md` is still the next operational validation step.

## Known Remaining Work

- P9: HTTPS and canonical-domain behavior still need target-host verification with the real ingress/TLS setup.
- P10: Operational notification delivery and final responsive UI polish should be verified in the browser before wider pilot use.
- P11: HTTP sampling, build/resource-exhaustion checks, service failure-recovery checks, and the noncritical pilot deployment remain pending on the target host.
- P12: Backup and restore should be proven on a second supported Ubuntu machine before production use.
