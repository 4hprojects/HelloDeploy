# P5 — Benchmarks, Tests, Release Gates and Rollback

## Benchmark methodology

For each supported runtime, choose representative fixtures at pinned SHA, one plain app and one complex lifecycle fixture where relevant. Record `git SHA`, image base digest, Docker/BuildKit version, memory and CPU limits, cache state and machine specs.

Scenarios: cold build with deliberate clean benchmark cache; warm same-commit build; one source-only change; one lockfile change. Run >=3 iterations per scenario where feasible, report median and range. Collect build duration, image logical size, final container startup/health time, build cache and disk footprint, memory peaks when possible, failure modes. Cold cache removal must only target approved isolated benchmark resources, never shared production cache.

Do not optimize solely for image size: cold build speed, compatibility, actual disk consumption and security are coequal criteria. No universal reduction target. Establish per-runtime go/no-go threshold after baseline.

## Automated checks

```
npm ci
npm run lint
npm run format:check
npm test
npm audit --omit=dev --audit-level=moderate
```

Add unit tests for generator outputs and edge cases; integration tests building images with actual Docker in isolated/staging environment; smoke tests container startup/health/Nginx activation and rollback. Confirm cancellation and timeout semantics.

## Canary release order

1. Merge opt-in code only with feature flag disabled.
2. Run local/staging fixtures and compare benchmark report with baseline.
3. Resolve existing platform P3 host/deployment readiness blockers per `docs/PRIORITIES.md` (clone, immutable release, Docker, Nginx, health checks). Never combine major platform recovery with template optimization.
4. Get operator authorization for one eligible pilot project; preserve old healthy release image and existing routing until candidate passes checks.
5. Confirm canary build/activate/rollback and logs, measure 24–48h observations only if scheduling/operator process supports this; no unsupervised waiting promised.
6. Expand opt-in to supported projects, progressively enable automatic template selection once compatibility is established.

## Rollback

- Immediate: turn feature flag off for subsequent builds; use previous `legacy` templates.
- Current healthy container and Nginx route remain unchanged on build failures.
- If optimized candidate is unhealthy, revert via existing stored healthy release, avoiding image deletion.
- Never force-rebuild rollback image during incident; rollback must work with retained images.
- Revert schema/UI independently if telemetry causes regressions; optional fields make rollback safe.

## Evidence and deliverables for Codex/Claude Code

- `AUDIT_REPORT.md`: confirmed files, gaps, risks, decisions, machine/host caveats.
- `BENCHMARK_RESULTS.md`: numbers with commands, run conditions and before/after table, no fabricated metrics.
- Per-phase PR with tests and security considerations.
- `OPERATOR_RUNBOOK.md`: feature flag, readiness checks, cleanup and rollback procedures.
- Updated architecture/user docs and explicit acceptance checklist.

## Definition of done

- All intended supported apps work under optimized-v1 without falling below baseline reliability.
- Real Docker system integration validated, not just mocked tests.
- Performance and size changes empirically documented.
- No secret or isolation regressions.
- No active or retained release lost during cleanup.
- Default rollout requires explicit owner approval after evidence review.
