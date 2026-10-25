# Multi-Runtime Status

Updated 2026-10-24. All pilot code is merged and deployed; every pilot flag remains off in production.
Builder control (an on-demand builder administrators start and stop) is on a branch, not merged.
The overview is in [README.md](README.md).

| Gate                   | State                | Evidence / blocker                                                                                                                                                                                                                                                                                                     |
| ---------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0A baseline           | Repository-complete  | Baseline, readiness isolation, threat model, and runbook are recorded here                                                                                                                                                                                                                                             |
| P0B contracts          | Repository-complete  | Strategy/application-root contracts, snapshots, environment fencing, v1/v2 jobs, digest activation, remote executor, digest-aware retention, nonproduction database registration, and image platform checks implemented                                                                                                |
| P0B live migration     | Blocked externally   | Dedicated rootless BuildKit host and private GHCR credentials were not supplied in this workspace                                                                                                                                                                                                                      |
| P1 Next.js code        | Repository-complete  | Detection/confirmation UI, three templates, route policy, flags, tests, docs; 2026-10-17 close-out audit fixed binding, telemetry, and failure warnings                                                                                                                                                                |
| Acceptance harness     | Repository-complete  | Tracked fixture matrix, preflight-first coordinator, disruptive opt-ins, redacted evidence schema, and operator runbook implemented                                                                                                                                                                                    |
| P2 Python code         | Repository-complete  | Flask/FastAPI/Django strategies, detection, images, UI, flags, fixtures, docs; default-off and allowlisted                                                                                                                                                                                                             |
| P3A PHP code           | Repository-complete  | Plain PHP and Laravel strategies, detection, Apache images, UI, flags, fixtures, docs; default-off and allowlisted.                                                                                                                                                                                                    |
| P3B Java code          | Repository-complete  | Spring Boot Maven and Gradle strategies, detection, Temurin images, UI, flags, verified-wrapper fixtures, docs; default-off and allowlisted                                                                                                                                                                            |
| P4 owner images code   | Merged, pilots off   | Dockerfile and prebuilt-image pilots, policy, scanning, credentials, fixtures, docs; merged with both flags off by owner decision (2026-10-21); the flags stay off until security review and live gates pass                                                                                                           |
| Builder control        | Phase C passed live  | Builder installed (stopped, cannot start at boot); live isolated tests passed every case in the design's section 8 (`EVIDENCE.md`, 2026-10-25); code on `feat/builder-control` (#142, not merged); Phase D activation awaits owner approval and the fixes listed in the [design](BUILDER_CONTROL_DESIGN.md) section 12 |
| P5 restricted Compose  | Blocked (entry gate) | Requires live-proven P4 controls and measured headroom; design in [P5_COMPOSE_ADR.md](P5_COMPOSE_ADR.md)                                                                                                                                                                                                               |
| P1–P3B live acceptance | Blocked externally   | Requires the nonproduction builder, registry, allowlisted projects, and real fixture matrix                                                                                                                                                                                                                            |
| Production rollout     | Deployed, pilots off | #119 and #120 merged and autodeployed with every flag off; enabling any pilot is not yet authorized                                                                                                                                                                                                                    |

Local automated results belong in `EVIDENCE.md`. No external or supported-host gate is
considered passed by mocks or unit tests. Six full-branch code reviews and a local
registry run (2026-10-20, `EVIDENCE.md`) are complete; CI and CodeQL pass on #119 and #120.

## Production readiness

#119 and #120 are merged and running in production with every pilot flag off. Enabling a
pilot is a separate, later step.

Merge and release (done unless marked):

- [x] Pre-merge smoke runs with flags off: #119 on 2026-10-20 and #120 on 2026-10-21
      (`EVIDENCE.md`). Legacy fixtures, rollback, failure cases, a project document from
      before this work, a v1 job from the previous web, and owner-image refusal all behaved
      as expected.
- [x] #119 merged 2026-10-20 (`9572051`); #120 merged 2026-10-21 (`e54f99b`) by owner
      decision, with its flags off.
- [x] Releases: autodeploy ran `upgrade.sh` for each merge with a backup first; installer
      verification passed and the dashboard and live apps answered 200.
- [x] The pending `.env.example` change was committed unread in #121 (`f3576cd`) at the
      owner's request; its diff still needs a human look.
- [x] Server check (2026-10-21): no `MULTIRUNTIME_*` flag is set in `/opt/hellodeploy/.env`,
      and `config:check` reports the web and worker configurations valid for production.
- [x] Deploy and roll back one existing production project on the new code: HelloEventHub,
      2026-10-22 (deploys at 00:13 and 00:34, rollback at 07:28, all healthy).

Before enabling a P0–P3 pilot (paused by owner decision on 2026-10-22 until a build host exists):

- [ ] Rootless BuildKit host with mTLS, cgroup limits, and builder egress limited to the
      package hosts; ORAS on the worker; private GHCR repository and token.
- [ ] Runbook step 7: choose `REGISTRY_DELETE_API` from a live GHCR deletion probe and
      confirm the referrers fallback tag is removed.
- [ ] Full nonproduction acceptance run, disruptive cases included, with build time and
      memory recorded per framework.
- [ ] One allowlisted project per flag, `WORKER_CONCURRENCY=1`.

Before turning on the P4 owner-image pilots: a security review of the owner-image threat
model, Trivy installed, every fail-closed case run live, and Docker Hub anonymous pull
limits measured. Before general availability: a builder per tenant or per build, and
runtime egress filtering. P5 stays behind its entry gate in `P5_COMPOSE_ADR.md`.
