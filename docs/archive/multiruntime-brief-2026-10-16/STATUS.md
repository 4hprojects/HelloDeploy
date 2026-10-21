# Multi-Runtime Status

> **Superseded 2026-10-17.** This package is the original brief only. Live status,
> decisions, and evidence are tracked in [docs/multi-runtime/STATUS.md](../../multi-runtime/STATUS.md)
> on `main` (the feature branches merged as #119 and #120). The table below is the historical starting point.

Planning only at authoring time (2026-10-16).

| Phase | Topic                        | State       | Gate                              |
| ----- | ---------------------------- | ----------- | --------------------------------- |
| P0A   | Baseline audit               | NOT_STARTED | Audit completed                   |
| P0B   | Existing runtime reliability | NOT_STARTED | Release/rollback verified         |
| P1    | Next.js                      | NOT_STARTED | SSR + static + regression         |
| P2    | Python + strategy interface  | NOT_STARTED | Three framework fixtures          |
| P3A   | PHP                          | NOT_STARTED | PHP + Laravel                     |
| P3B   | Java                         | NOT_STARTED | Maven + Gradle                    |
| P4A   | Dockerfile                   | NOT_STARTED | isolated build threat model       |
| P4B   | OCI registry                 | NOT_STARTED | pinned digest, auth + policy      |
| P5    | Restricted Compose + quotas  | NOT_STARTED | multi-service safety and rollback |
