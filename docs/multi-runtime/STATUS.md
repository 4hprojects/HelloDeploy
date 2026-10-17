# Multi-Runtime Status

Updated 2026-10-17. Production flags remain off.

| Gate                   | State               | Evidence / blocker                                                                                                                                                                                                      |
| ---------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0A baseline           | Repository-complete | Baseline, readiness isolation, threat model, and runbook are recorded here                                                                                                                                              |
| P0B contracts          | Repository-complete | Strategy/application-root contracts, snapshots, environment fencing, v1/v2 jobs, digest activation, remote executor, digest-aware retention, nonproduction database registration, and image platform checks implemented |
| P0B live migration     | Blocked externally  | Dedicated rootless BuildKit host and private GHCR credentials were not supplied in this workspace                                                                                                                       |
| P1 Next.js code        | Repository-complete | Detection/confirmation UI, three templates, route policy, flags, tests, docs; 2026-10-17 close-out audit fixed binding, telemetry, and failure warnings                                                                 |
| Acceptance harness     | Repository-complete | Tracked fixture matrix, preflight-first coordinator, disruptive opt-ins, redacted evidence schema, and operator runbook implemented                                                                                     |
| P2 Python code         | Repository-complete | Flask/FastAPI/Django strategies, detection, images, UI, flags, fixtures, docs; default-off and allowlisted                                                                                                              |
| P3A PHP code           | Repository-complete | Plain PHP and Laravel strategies, detection, Apache images, UI, flags, fixtures, docs; default-off and allowlisted.                                                                                                     |
| P3B Java code          | Repository-complete | Spring Boot Maven and Gradle strategies, detection, Temurin images, UI, flags, verified-wrapper fixtures, docs; default-off and allowlisted                                                                             |
| P1–P3B live acceptance | Blocked externally  | Requires the nonproduction builder, registry, allowlisted projects, and real fixture matrix                                                                                                                             |
| Production rollout     | Not authorized      | No merge, deploy, or production flag change performed                                                                                                                                                                   |

Local automated results belong in `EVIDENCE.md`. No external or supported-host gate is
considered passed by mocks or unit tests.
