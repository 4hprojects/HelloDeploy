# Improvement Phases Tracker

Phased execution of the remaining items in [IMPROVEMENTS.md](../IMPROVEMENTS.md), started 2026-07-03. Each phase has its own file with timestamps, working notes, and verification evidence. Update the status here whenever a phase file changes.

| Phase                                         | Title                                                      | Status  | Outcome                                                                                                                              |
| --------------------------------------------- | ---------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [1](phase-1-quota-page-fix.md)                | Fix broken admin quota page                                | Done    | Quota page renders again; wrong-depth EJS includes fixed                                                                             |
| [2](phase-2-non-root-containers.md)           | Non-root users in app containers                           | Done    | Static → nginx-unprivileged:8080; node runtimes → USER node; live docker run blocked in env                                          |
| [3](phase-3-worker-pipeline-tests.md)         | Worker pipeline test coverage                              | Done    | +56 tests: jobs, port-allocator, retention, services; in-memory Mongo harness                                                        |
| [4](phase-4-worker-pipeline-extraction.md)    | Worker pipeline extraction refactor                        | Done    | Shared runReleasePipeline; jobs -800/+83 lines; 40 pinned tests unmodified                                                           |
| [5](phase-5-ux-onboarding-and-form-errors.md) | UX: onboarding checklist + inline form errors              | Done    | Get-your-app-live checklist on overview; inline errors on build-config/filters/maintenance/environment                               |
| [6](phase-6-cleanups-and-docs.md)             | Small cleanups + docs batch                                | Done    | Port-claim race fixed, startup polling, parallel awaits, error logs; ENVIRONMENT.md, CLAUDE.md architecture, FAQ, CONTRIBUTING       |
| [7](phase-7-static-port-field.md)             | Static-runtime port field polish                           | Done    | Port field replaced with a fixed-port note for STATIC/REACT/VUE                                                                      |
| [8](phase-8-worklog-verifications.md)         | WORKLOG verifications (Resend, deploy options, smoke test) | Done    | Deploy-options evidence live; smoke-test doc; Resend send needs 1 manual command                                                     |
| [9](phase-9-selected-commit-deploys.md)       | Selected-commit deployment path                            | Done    | Deploy-a-specific-commit card + validated service override; verified live                                                            |
| [10](phase-10-sse-redis.md)                   | Multi-instance SSE state + Redis pub/sub                   | Done    | Redis stream caps + pub/sub log push; 10s sweep fallback; verified live                                                              |
| [11](phase-11-pipeline-correctness.md)        | Deployment pipeline correctness                            | Planned | W1 W3 W4 W5 W9 W7 — retention image guard, fail-fast enqueue, retry container cleanup, resource limits, port probe, nginx prod guard |
| [12](phase-12-boundary-validation.md)         | Boundary validation defense-in-depth                       | Planned | S6 W2 W8 S5 — job-payload validators, dockerfile re-validation, recursive symlink scrub, web validation gaps                         |
| [13](phase-13-docker-disk-hygiene.md)         | Docker disk & resource hygiene                             | Planned | W6 — delete-project full cleanup, dangling prune, log caps, workspace sweep; + delete/stop job tests                                 |
| [14](phase-14-secrets-key-rotation.md)        | Secrets key rotation + redaction depth                     | Planned | S1 P6 S3 — versioned keyring/HKDF, prod zero-key guard, value-pattern redaction                                                      |
| [15](phase-15-audit-and-admin-authz.md)       | Audit trail completeness + admin authorization             | Planned | W10 S2 S8 S4 — worker audit events, 90d TTL, nginx-restore alert, SUPER_ADMIN gating                                                 |
| [16](phase-16-efficiency-caching.md)          | Efficiency: caching, queries, shared config                | Planned | E1 E2 E4 E5 P3 — maintenance-mode cache, repo clone cache, query bounds, packages/config                                             |
| [17](phase-17-ci-coverage-tooling.md)         | CI security gates, coverage & repo hygiene                 | Planned | P4 S7 P1 P2 P5 — high-risk-surface tests, npm audit + coverage + CodeQL, pre-commit hooks, hygiene                                   |
| [18](phase-18-ux-round-2.md)                  | UX round 2                                                 | Planned | U1–U5 — unified nav, dashboard alerts, webhook-failure surfacing, list polling, a11y polish                                          |

Phases 11–18 come from the Round 2 review: [IMPROVEMENTS.md § Round 2 — 2026-07-06](../IMPROVEMENTS.md#round-2--analyzed-2026-07-06-commit-0adee42).

## Deferred (intentionally not scheduled)

- Content-hashed static asset filenames with long-lived immutable caching.
- E3 — SSE 10 s DB sweep alongside Redis pub/sub: intentional completeness fallback (DB is source of truth); acceptable cost at current scale.
