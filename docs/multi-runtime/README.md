# Multi-Runtime Deployments

Updated 2026-10-21. This is the overview of the multi-runtime initiative: what was built, how it
shipped, where it stands, and what has to happen before users can use it. Day-to-day gate
status is in [STATUS.md](STATUS.md).

## In one paragraph

HelloDeploy used to build only Static, React, Vue, Express, Node.js and one Next.js layout. It
can now also build three Next.js modes, Python (Flask, FastAPI, Django), PHP (plain and
Laravel), Java (Spring Boot on Maven or Gradle), an owner's own Dockerfile, and a prebuilt
container image. All of it is merged and running in production with **every pilot flag off**:
until an operator sets a flag and a project allowlist, users see no change. Turning a pilot on
needs a dedicated build server and private registry that do not exist yet.

## What was built

| Phase | Adds                                                                                                                                                                                             | Pilot flag                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| P0    | Versioned build strategies, immutable deployment snapshots, application roots, remote BuildKit executor, digest-pinned releases and rollback, registry retention, nonproduction database fencing | — (foundation)                                          |
| P1    | Next.js standard, standalone and static-export modes, with detection and a confirmation step                                                                                                     | `MULTIRUNTIME_NEXT_V1_*`                                |
| P2    | Python: Flask, FastAPI and Django on gunicorn/uvicorn as uid 10001, versions 3.12/3.13                                                                                                           | `MULTIRUNTIME_PYTHON_V1_*`                              |
| P3A   | PHP: plain PHP and Laravel on Apache, Composer lockfile required, version from `composer.json`                                                                                                   | `MULTIRUNTIME_PHP_V1_*`                                 |
| P3B   | Java: Spring Boot built with the project's Maven or Gradle wrapper on Java 17, 21 or 25                                                                                                          | `MULTIRUNTIME_JAVA_V1_*`                                |
| P4    | Owner Dockerfiles and prebuilt OCI images (docker.io, ghcr.io), with encrypted registry credentials                                                                                              | `MULTIRUNTIME_DOCKERFILE_V1_*`, `MULTIRUNTIME_OCI_V1_*` |
| P5    | Restricted Compose — **design only**, see [P5_COMPOSE_ADR.md](P5_COMPOSE_ADR.md)                                                                                                                 | none                                                    |

Each flag pairs `_ENABLED` with a `_PROJECT_IDS` allowlist; both are documented in
[ENVIRONMENT.md](../ENVIRONMENT.md). The user-facing description of every runtime is in the
[User Guide](../USER_GUIDE.md).

### Safety design

- **Isolated builds.** New strategies build only on a remote rootless BuildKit host, never on
  the production Docker daemon. The builder exports an OCI layout to the worker, which pushes the
  exact digest to a private GHCR repository with ORAS; the builder holds no push credential.
- **Owner Dockerfiles run with no registry login**, so `ONBUILD` triggers or quoted flags can
  only pull public images. A static policy rejects custom frontends, host networking, secret,
  SSH and cache mounts, volumes and unapproved base images early with clear errors.
- **Every owner image is checked at pull time**: a numeric non-root user, no declared volumes, a
  size cap, the host's platform, and a Trivy scan that fails closed on fixable critical CVEs.
- **Releases are pinned by digest**, and rollback reuses the exact earlier image. Registry
  cleanup deletes an image together with its attestation manifests and the referrers fallback
  tag, keeps any manifest another retained release still uses, and can delete through the
  GitHub Packages API when GHCR refuses the OCI call.
- **Pilots fail closed.** The web service refuses a deploy for a strategy whose flag is off, and
  the worker refuses the job again even if it was queued directly.

The threats and controls are in [THREAT_MODEL.md](THREAT_MODEL.md); every design choice and the
alternatives rejected are in [DECISIONS.md](DECISIONS.md).

### Tooling

- **Fixtures**: 29 pinned test applications in `tests/fixtures/multi-runtime/`, one per runtime
  plus failure, rollback, isolation, resource and secret-redaction cases.
- **Acceptance harness**: `npm run acceptance:multi-runtime` (`scripts/run-multi-runtime-acceptance.js`).
  It is read-only by default and refuses production databases; disruptive cases are opt-in.
- **Operator runbook**: [BUILDKIT_GHCR_RUNBOOK.md](BUILDKIT_GHCR_RUNBOOK.md) covers provisioning,
  the GHCR deletion probe, acceptance and the pilot stop procedure.

## How it shipped

| PR   | Contents                                                       | In production         |
| ---- | -------------------------------------------------------------- | --------------------- |
| #119 | P0–P3 (Next.js, Python, PHP, Java)                             | 2026-10-20, `9572051` |
| #120 | P4 owner Dockerfiles and prebuilt images                       | 2026-10-21, `e54f99b` |
| #121 | Pending `.env.example` update (committed unread, needs review) | 2026-10-21, `f3576cd` |
| #122 | Production pilot-flag and configuration check recorded         | 2026-10-21, `a5f7425` |
| #123 | Lighthouse lab budgets judged on a median of three runs        | 2026-10-21, `060c37d` |

Before merging:

- **Six full-branch code reviews** found 64 real issues, each confirmed against the code and
  fixed with a test that failed first. The most serious: deploys of existing projects would
  have failed on a missing field, and owner Dockerfile builds could use the platform's registry
  login.
- **A local registry run** pushed and deleted real images, which found and fixed a referrers-tag
  leak that would have left one tagged index per build.
- **Two flags-off smoke runs** used the real worker against throwaway databases: legacy apps,
  rollback, build and health failures, a project from before the change, a job queued by the
  previous release, and owner-image refusal.
- **After each release**, the installer checks passed, the dashboard and live apps answered 200,
  and the server confirmed no pilot flag is set.

Results are in [EVIDENCE.md](EVIDENCE.md); the per-change history is in [CHANGELOG.md](CHANGELOG.md).

## What has to happen next

In order; also listed in [PRIORITIES.md](../PRIORITIES.md):

1. Deploy and roll back one real project on the new code (the last post-merge check).
2. Provision the nonproduction BuildKit host and private GHCR repository.
3. Run runbook step 7 to choose the registry deletion mode on real GHCR.
4. Run the full acceptance harness, including the disruptive cases.
5. Enable one allowlisted project per runtime.
6. For the owner-image pilots: a security review, Trivy, and the live fail-closed cases.
7. Before general availability of owner images: per-tenant or per-build builders and runtime
   egress filtering.
8. P5: answer the open questions in the ADR, then build it only after P4 is proven live.

## Files in this folder

| File                                                                                                                                 | Use                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [STATUS.md](STATUS.md)                                                                                                               | Gate tracker and production-readiness checklist              |
| [CHANGELOG.md](CHANGELOG.md)                                                                                                         | What changed, by date                                        |
| [DECISIONS.md](DECISIONS.md)                                                                                                         | Dated decisions and rejected alternatives                    |
| [EVIDENCE.md](EVIDENCE.md)                                                                                                           | Test, review and smoke-run results                           |
| [THREAT_MODEL.md](THREAT_MODEL.md)                                                                                                   | Threats, controls and residual risks                         |
| [BUILDKIT_GHCR_RUNBOOK.md](BUILDKIT_GHCR_RUNBOOK.md)                                                                                 | Operator setup, acceptance and stop procedure                |
| [P5_COMPOSE_ADR.md](P5_COMPOSE_ADR.md)                                                                                               | Proposed restricted-Compose design                           |
| [acceptance-config.example.json](acceptance-config.example.json), [acceptance-evidence.schema.json](acceptance-evidence.schema.json) | Harness input template and output schema                     |
| [evidence/](evidence/README.md)                                                                                                      | Point-in-time records, including the starting baseline audit |

The original planning brief is archived at
[archive/multiruntime-brief-2026-10-16](../archive/multiruntime-brief-2026-10-16/00_START_HERE.md);
references such as "brief file 09" point there.
