# Branch, Review, Merge, Release and Rollback Playbook

## Source control workflow

```
git fetch origin
git status --short
git switch main
git pull --ff-only origin main
git switch -c feat/multi-runtime-deployments
```

If working tree contains modifications or a branch exists, stop and record state, use a safe branch/rebase strategy rather than deleting/stashing without approval.

## Milestones

- Commit Phase 0 baseline/defects.
- Separate commits for framework detection, contracts, builders, tests, UI and docs; meaningful prefixes such as `feat(runtime): ...`, `test(runtime): ...`.
- Push branch to origin only after checking no secrets, generated images or build outputs included.
- Open draft PR against `main` with phase checklist, acceptance evidence, estimated resource cost, rollout flags, migration details and rollback.
- Ask for review at each completed phase; keep branch rebased/merged with latest `main` through safe, coordinated process.
- CI all green, security review complete, nonproduction deployment proven and user explicitly approves before marking PR ready for merge.

## Release policy

1. Verify latest commit, release candidate digest and environment drift.
2. Back up data and record tested restore/rollback procedure.
3. Confirm maintenance plan, resource headroom and no in-flight deployment conflict.
4. Merge reviewed PR to `main` only by authorized human (or explicit agent authorization).
5. Use documented `infrastructure/upgrade.sh` and verified immutable pull-based release workflow. Do not manually copy changed source into production or bypass release controls.
6. Run post-release smoke of old and newly enabled runtime in restricted pilot. Start feature flags OFF, enable per approved cohort.
7. Monitor queue errors, worker health, Docker resources, route health, 5xx, memory, disk and rollback retention.
8. If degradation occurs, disable relevant flag, revert release using tested procedure; if schema affected, apply preapproved reversible migration policy.

## Ready-to-merge checklist

- [ ] Scope defined, out-of-scope flagged.
- [ ] No skipped security test or unresolved P0/P1 regression.
- [ ] Compatibility + release tests passed.
- [ ] Human-reviewed attack-surface changes.
- [ ] Nonproduction acceptance evidence attached.
- [ ] Docs/support matrix/terms accurate.
- [ ] Rollback tested, backup confirmed.
- [ ] Resource and operating-cost assessment attached.
- [ ] CI and code review approved.
- [ ] Explicit owner approval for merge and production deployment.

## Emergency rollback

Prefer flag-off if functionality remains isolated and safe. If platform itself destabilizes, use existing documented immutable release/revert runbook. Never run a blind downgrade against migrated schema or delete live Docker images/volumes before confirming safe rollback snapshots.
