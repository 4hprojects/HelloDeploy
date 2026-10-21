# Phase P0 — Code/Host Audit and Design Decisions

## Repository inspection tasks

1. Inspect current `apps/worker/src/deployment/dockerfile-generator.js`, `build.js`, `build-context.js`, deployment job handlers and pipeline, quota/retention logic, deployment model and migrations, env config validation, security helpers, tests and docs. Reconcile line-by-line with master plan; do not assume filenames are unchanged.
2. Trace repository cloning to context preparation to Dockerfile generation to image build to activation and rollback, documenting method names, arguments, status transitions and cleanup triggers.
3. Determine how lockfiles/package managers are detected and whether `npm ci` assumes npm. Note existing restrictions and incompatible build scripts. In particular, source-copy-before-install is intentional: HelloUniversity previously needed postinstall lifecycle support.
4. Verify how `.env*`, `node_modules`, `.git`, symlinks and other sensitive inputs are scrubbed. Existing code removes user `.dockerignore`; generated `.dockerignore` must not permit excluded secrets or smuggle dangerous files through patterns.
5. Verify Docker CLI and daemon access, builder type/BuildKit behavior, disk capacity, caches, CPU/RAM pressure, Ubuntu 26.04 support gate and host readiness. Prefer read-only commands:

```
git rev-parse HEAD
docker version
docker info
docker buildx version
docker system df -v
docker image ls --digests
free -h
df -h
```

Never print credentials and redact host identifiers in deliverable if appropriate. Execute only where authorized. 6. Inspect `docs/PRIORITIES.md` and live deployment gate; verify HelloUniversity has reached real build, health check and activation before treating end-to-end benchmarks as production evidence.

## Decision record to write before code

- Strategy `legacy` (existing default) and `optimized-v1` (opt-in initially).
- When to use one-stage vs multi-stage Node: classify scripts and required build outputs based on clear static evidence; ambiguous cases use legacy instead of guessing.
- Decide whether Debian slim compatibility profile is needed: use only with explicit validation; do not default-switch all workloads.
- BuildKit support detected by capability check; unsupported hosts transparently use established `docker build` path.
- Metrics collection method must avoid parsing arbitrary localized terminal output when Docker structured inspection is available.
- Caching scope and storage policy, including isolation expectations between users.
- Recovery plan for old images and running releases, including retention-aware exclusions.

## Required audit output

Table with: existing behavior, code location, identified risk, evidence, proposed change, testing requirement, priority. Separate _observed code_, _documentation claims_, and _live-host verified_ findings.

## Exit gate

P0 is complete only when the operator has reviewed audit findings and approved the opt-in plan. If Docker is unavailable on the pilot host, stop at code/tests and document missing runtime evidence.
