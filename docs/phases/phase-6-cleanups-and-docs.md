# Phase 6 — Small cleanups + docs batch

- **Status:** Pending
- **Started:** —
- **Accomplished:** —
- **Commits:** —

## Goal

The remaining S-effort items from IMPROVEMENTS.md, batched: small efficiency/robustness fixes plus the documentation gaps.

## Tasks (checklist)

### Code

- [ ] Port-allocator: atomic claim to close the check-then-use race (skip if already landed in Phase 4)
- [ ] Replace the flat 3 s `STARTUP_DELAY_MS` sleep with `inspectContainer` polling with backoff
- [ ] `Promise.all` independent sequential awaits (`project.controller.js` repository/deployment lookups, deployment.service lookup chains)
- [ ] Log the silently swallowed `catch {}` blocks (`domain.service.js`, `github.service.js`, `auth.controller.js`) at debug/warn level

### Docs

- [ ] `docs/ENVIRONMENT.md` — env-var reference table (name, required, default, used by web/worker)
- [ ] CLAUDE.md — short Architecture section (apps, packages, pipeline stages, key models)
- [ ] Fold anything still relevant from `WEB_APP_COMPREHENSIVE_ANALYSIS.md` + `TODAY_WEB_APP_REMEDIATION_TODO.md` into IMPROVEMENTS.md, then delete them
- [ ] FAQ freshness pass (cover deploy hooks, build filters, maintenance mode, notifications)
- [ ] Minimal CONTRIBUTING.md
- [ ] Update IMPROVEMENTS.md checkboxes

## Notes

## Verification
