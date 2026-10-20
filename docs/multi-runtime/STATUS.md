# Multi-Runtime Status

Updated 2026-10-20. Production flags remain off.

| Gate                   | State                            | Evidence / blocker                                                                                                                                                                                                      |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0A baseline           | Repository-complete              | Baseline, readiness isolation, threat model, and runbook are recorded here                                                                                                                                              |
| P0B contracts          | Repository-complete              | Strategy/application-root contracts, snapshots, environment fencing, v1/v2 jobs, digest activation, remote executor, digest-aware retention, nonproduction database registration, and image platform checks implemented |
| P0B live migration     | Blocked externally               | Dedicated rootless BuildKit host and private GHCR credentials were not supplied in this workspace                                                                                                                       |
| P1 Next.js code        | Repository-complete              | Detection/confirmation UI, three templates, route policy, flags, tests, docs; 2026-10-17 close-out audit fixed binding, telemetry, and failure warnings                                                                 |
| Acceptance harness     | Repository-complete              | Tracked fixture matrix, preflight-first coordinator, disruptive opt-ins, redacted evidence schema, and operator runbook implemented                                                                                     |
| P2 Python code         | Repository-complete              | Flask/FastAPI/Django strategies, detection, images, UI, flags, fixtures, docs; default-off and allowlisted                                                                                                              |
| P3A PHP code           | Repository-complete              | Plain PHP and Laravel strategies, detection, Apache images, UI, flags, fixtures, docs; default-off and allowlisted.                                                                                                     |
| P3B Java code          | Repository-complete              | Spring Boot Maven and Gradle strategies, detection, Temurin images, UI, flags, verified-wrapper fixtures, docs; default-off and allowlisted                                                                             |
| P4 owner images code   | Repository-complete (stacked PR) | Dockerfile and prebuilt-image pilots, policy, scanning, credentials, fixtures, docs; not mergeable until security review and live gates pass                                                                            |
| P5 restricted Compose  | Blocked (entry gate)             | Requires live-proven P4 controls and measured headroom; design in `P5_COMPOSE_ADR.md`                                                                                                                                   |
| P1–P3B live acceptance | Blocked externally               | Requires the nonproduction builder, registry, allowlisted projects, and real fixture matrix                                                                                                                             |
| Production rollout     | Not authorized                   | No merge, deploy, or production flag change performed                                                                                                                                                                   |

Local automated results belong in `EVIDENCE.md`. No external or supported-host gate is
considered passed by mocks or unit tests. Six full-branch code reviews and a local
registry run (2026-10-20, `EVIDENCE.md`) are complete; CI and CodeQL pass on #119 and #120.

## Production readiness

#119 is merged and running in production with every pilot flag off. Enabling a pilot
is a separate, later step.

Merging #119:

- [x] Pre-merge smoke run with flags off (2026-10-20, `EVIDENCE.md`): legacy fixtures,
      rollback, failure cases, a project document from before this branch, and a v1
      job from the previous web all behaved as expected.
- [ ] Resolve the uncommitted `.env.example` change.
- [x] Owner review and merge decision: #119 merged 2026-10-20 (`9572051`).
- [x] Release: autodeploy ran `upgrade.sh` for `9572051` at 23:06 PST on 2026-10-20 with a
      backup first; installer verification passed and the dashboard and live apps
      answered 200.
- [ ] Deploy and roll back one existing production project on the new code.
- [ ] Confirm every `MULTIRUNTIME_*` flag is unset on the server and run `config:check`.

Before enabling a P0–P3 pilot:

- [ ] Rootless BuildKit host with mTLS, cgroup limits, and builder egress limited to the
      package hosts; ORAS on the worker; private GHCR repository and token.
- [ ] Runbook step 7: choose `REGISTRY_DELETE_API` from a live GHCR deletion probe and
      confirm the referrers fallback tag is removed.
- [ ] Full nonproduction acceptance run, disruptive cases included, with build time and
      memory recorded per framework.
- [ ] One allowlisted project per flag, `WORKER_CONCURRENCY=1`.

Before the P4 owner-image pilot (#120): security review of the owner-image threat
model, Trivy installed, every fail-closed case run live, and Docker Hub anonymous pull
limits measured. Before general availability: a builder per tenant or per build, and
runtime egress filtering. P5 stays behind its entry gate in `P5_COMPOSE_ADR.md`.
