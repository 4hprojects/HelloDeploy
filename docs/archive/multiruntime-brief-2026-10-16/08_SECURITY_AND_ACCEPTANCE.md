# Security Gates, Quality Bar, and Acceptance Matrix

## Mandatory universal tests

- Regression: existing Static, React, Vue, Express, Node, existing Next unchanged.
- Build: exact commit, reproducibility where supported, cancelled/failed worker cleanup, concurrent deployments and project lock.
- Security: authz owner/maintainer, tenant isolation, secrets redacted from logs, deny runtime `--privileged`, daemon socket, host net, host filesystem mounts, unrestricted capabilities and port mappings.
- Runtime: non-root where possible, `no-new-privileges`, cap drop, seccomp/AppArmor, cgroup CPU/RAM/PID caps, network and filesystem controls, resource exhaustion tests.
- Release: health probe success before atomic cutover, healthy previous release preserved on candidate failure, rollback, Nginx route consistency and clean restart recovery.
- Data: schema defaults for existing projects, migration forward/back, no lost config or secrets.
- Operational: disk pressure, queue retries, stale artifacts, maximum log lines, alerts, controlled cleanup, backup/restore.
- UX: beginner path usable, advanced settings optional, errors actionable, a11y and mobile layout.
- Docs: docs reflect actual behavior and label deferred features; never advertise 'supported' before live acceptance passes.

## Phase-specific fixture matrix

| Runtime                       | Fixture                              | Essential verification                           |
| ----------------------------- | ------------------------------------ | ------------------------------------------------ |
| Static/React/Vue/Express/Node | Existing minimal fixtures            | Regression / routes / rollback                   |
| Next.js                       | SSR, standalone, static export       | routes, assets, API, cache expectations          |
| Flask                         | minimal WSGI                         | response and readiness                           |
| FastAPI                       | ASGI                                 | entrypoint and port                              |
| Django                        | static + external-db optional        | hosts/static/settings                            |
| PHP                           | plain PHP                            | web server executes `.php`                       |
| Laravel                       | minimal app                          | public root, storage, env                        |
| Java                          | Maven/Gradle Spring Boot             | artifact, health, memory                         |
| Dockerfile                    | benign custom image                  | isolated build & constrained runtime             |
| OCI                           | pinned digest from approved registry | digest stability, auth controls                  |
| Compose                       | public API + private Redis           | service health, networking, release set rollback |

## Evidence grading

1. Unit test: code behavior only.
2. Integration test: worker with temporary Docker engine / isolated runner.
3. Live nonproduction fixture: real host, routing, logs, rollback, quotas and secrets.
4. Controlled production pilot: authorized, backup and restoration path tested.
   Only claim production support after grade 4 signoff.

## Blockers

Any ability to escape build/run isolation, reach host Docker daemon, leak secrets, bypass resource quotas, expose internal services, or displace a healthy release on a failed deploy is a P0 blocker. Stop, document and remediate before continuing.
