# Improvement Phases Tracker

Phased execution of the remaining items in [IMPROVEMENTS.md](../IMPROVEMENTS.md), started 2026-07-03. Each phase has its own file with timestamps, working notes, and verification evidence. Update the status here whenever a phase file changes.

| Phase                                         | Title                                         | Status      | Outcome                                                                                     |
| --------------------------------------------- | --------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------- |
| [1](phase-1-quota-page-fix.md)                | Fix broken admin quota page                   | Done        | Quota page renders again; wrong-depth EJS includes fixed                                    |
| [2](phase-2-non-root-containers.md)           | Non-root users in app containers              | Done        | Static → nginx-unprivileged:8080; node runtimes → USER node; live docker run blocked in env |
| [3](phase-3-worker-pipeline-tests.md)         | Worker pipeline test coverage                 | Done        | +56 tests: jobs, port-allocator, retention, services; in-memory Mongo harness               |
| [4](phase-4-worker-pipeline-extraction.md)    | Worker pipeline extraction refactor           | In Progress | —                                                                                           |
| [5](phase-5-ux-onboarding-and-form-errors.md) | UX: onboarding checklist + inline form errors | Pending     | —                                                                                           |
| [6](phase-6-cleanups-and-docs.md)             | Small cleanups + docs batch                   | Pending     | —                                                                                           |

## Deferred (intentionally not scheduled)

- Multi-instance SSE state + Redis pub/sub for deployment logs — revisit when running more than one web replica.
- WORKLOG.md open QA verifications (notification delivery, selected-commit deploys, browser evidence) — separate QA session.
- Content-hashed static asset filenames with long-lived immutable caching.
