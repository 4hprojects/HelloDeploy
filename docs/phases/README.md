# Improvement Phases Tracker

Phased execution of the remaining items in [IMPROVEMENTS.md](../IMPROVEMENTS.md), started 2026-07-03. Each phase has its own file with timestamps, working notes, and verification evidence. Update the status here whenever a phase file changes.

| Phase                                         | Title                                                      | Status      | Outcome                                                                                                                        |
| --------------------------------------------- | ---------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [1](phase-1-quota-page-fix.md)                | Fix broken admin quota page                                | Done        | Quota page renders again; wrong-depth EJS includes fixed                                                                       |
| [2](phase-2-non-root-containers.md)           | Non-root users in app containers                           | Done        | Static → nginx-unprivileged:8080; node runtimes → USER node; live docker run blocked in env                                    |
| [3](phase-3-worker-pipeline-tests.md)         | Worker pipeline test coverage                              | Done        | +56 tests: jobs, port-allocator, retention, services; in-memory Mongo harness                                                  |
| [4](phase-4-worker-pipeline-extraction.md)    | Worker pipeline extraction refactor                        | Done        | Shared runReleasePipeline; jobs -800/+83 lines; 40 pinned tests unmodified                                                     |
| [5](phase-5-ux-onboarding-and-form-errors.md) | UX: onboarding checklist + inline form errors              | Done        | Get-your-app-live checklist on overview; inline errors on build-config/filters/maintenance/environment                         |
| [6](phase-6-cleanups-and-docs.md)             | Small cleanups + docs batch                                | Done        | Port-claim race fixed, startup polling, parallel awaits, error logs; ENVIRONMENT.md, CLAUDE.md architecture, FAQ, CONTRIBUTING |
| [7](phase-7-static-port-field.md)             | Static-runtime port field polish                           | Done | Port field replaced with a fixed-port note for STATIC/REACT/VUE |
| [8](phase-8-worklog-verifications.md)         | WORKLOG verifications (Resend, deploy options, smoke test) | Done     | Deploy-options evidence live; smoke-test doc; Resend send needs 1 manual command                                                                                                                              |
| [9](phase-9-selected-commit-deploys.md)       | Selected-commit deployment path                            | Done     | Deploy-a-specific-commit card + validated service override; verified live                                                                                                                              |
| [10](phase-10-sse-redis.md)                   | Multi-instance SSE state + Redis pub/sub                   | Done     | Redis stream caps + pub/sub log push; 10s sweep fallback; verified live                                                                                                                              |

## Deferred (intentionally not scheduled)

- Content-hashed static asset filenames with long-lived immutable caching.
