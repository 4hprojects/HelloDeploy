# Phase 9 — Selected-commit deployment path

- **Status:** Pending
- **Started:** —
- **Accomplished:** —
- **Commits:** —

## Goal

WORKLOG records the gap: deploy-latest and retry-current exist, but there is no way to deploy a chosen commit. Add an optional full-SHA input to the deploy flow; the worker already clones exact SHAs, so this is web-side only.

## Tasks (checklist)

- [ ] `createDeployment` accepts an optional `commitSha` override (40-hex validated)
- [ ] Deploy form gains an optional "Deploy a specific commit" input with inline error on malformed SHA (Phase 5 pattern)
- [ ] Tests: override accepted, malformed rejected, payload carries the override
- [ ] Live verification: POST with a chosen SHA → Deployment doc carries it
- [ ] WORKLOG.md updated (selected-commit + browser-evidence lines)

## Notes

## Verification
