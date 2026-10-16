# Multi-Runtime Status

Updated 2026-10-16. Production flags remain off.

| Gate               | State               | Evidence / blocker                                                                                                                                          |
| ------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0A baseline       | Repository-complete | Baseline, readiness isolation, threat model, and runbook are recorded here                                                                                  |
| P0B contracts      | Repository-complete | Strategy/application-root contracts, snapshots, environment fencing, v1/v2 jobs, digest activation, remote executor, and digest-aware retention implemented |
| P0B live migration | Blocked externally  | Dedicated rootless BuildKit host and private GHCR credentials were not supplied in this workspace                                                           |
| P1 Next.js code    | Repository-complete | Detection/confirmation UI, standard/standalone/export templates, route policy, flags, tests, and docs implemented                                           |
| Acceptance harness | Repository-complete | Tracked fixture matrix, preflight-first coordinator, disruptive opt-ins, redacted evidence schema, and operator runbook implemented                         |
| P1 live acceptance | Blocked externally  | Requires the nonproduction builder, registry, allowlisted projects, and real fixture matrix                                                                 |
| Production rollout | Not authorized      | No merge, deploy, or production flag change performed                                                                                                       |

Local automated results belong in `EVIDENCE.md`. No external or supported-host gate is
considered passed by mocks or unit tests.
