# HelloDeploy User-App Docker Optimization — Master Implementation Plan

Status: Proposal, not authorized for production rollout
Target repository: https://github.com/4hprojects/HelloDeploy (main)
Date: 2026-10-09

## Mission

Improve the Docker images HelloDeploy builds for _hosted user projects_. Do not containerize or replace the HelloDeploy web dashboard, worker, systemd services, ingress, MongoDB, Redis, or production release procedure. Preserve all project deployment/approval/security contracts.

## Source-of-truth and verified baseline

Reviewed on public GitHub main:

- `apps/worker/src/deployment/dockerfile-generator.js`: Node 22 Alpine, unprivileged Nginx 1.27 Alpine, React/Vue two-stage builds, Next.js three-stage builds, Express/Node.js single-stage with source copied before `npm ci --prefer-offline --omit=dev`; sanitized directives and allowed public build args.
- `apps/worker/src/deployment/build.js`: `spawn('docker', ['build',...])`, memory limit, default network, no-cache option, image tags, streamed logs, dangling-image pruning.
- `apps/worker/src/deployment/build-context.js`: removes user Dockerfiles and docker-compose and `.dockerignore`, scrubs escaping symlinks, enforces 500 MB source size.
- `apps/worker/src/deployment/pipeline.js`: activation, health checks, routing and rollback protections.
- `tests/deployment/dockerfile-generator.test.js`: runtime and security checks, intentional copy-before-npm-ci test for Node lifecycle compatibility.
- `docs/PRIORITIES.md`, `docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`: real Docker production deploy remains a tracked qualification gate; do not infer successful live hosting from unit tests or a reachable dashboard.

## Explicit non-goals

- No overhaul of hosting topology, Docker socket access, user Dockerfiles/Compose, Kubernetes, PHP/Python support, custom arbitrary build commands beyond current policy, or database hosting.
- No automatic migration of active images, no forced Alpine-to-slim switch, no privileged builds, no production experiments without release approval.
- No promise of specific percentage reductions. Smaller images do not necessarily reduce RAM or aggregate on-disk size due to layer sharing.

## Implementation order and stop gates

1. **P0 Read-only audit and baseline:** validate actual Git HEAD, host prerequisites, tests, host Docker daemon and its version, build constraints, current image and cache footprint. Get operator sign-off before installing/upgrading anything. If real deploy pipeline is blocked, do not call results production-validated.
2. **P1 Template correctness:** add opt-in, backward-compatible template selection and safe build-context optimization. Retain original Node/Express template as `legacy` until optimized alternatives pass lifecycle cases. Do not change the default for active projects yet.
3. **P2 Cache evaluation:** benchmark existing layer cache and opt-in BuildKit cache mounts. Set disk bounds and ensure no cross-tenant secret or mutable artifact leakage. Only enable if demonstrably helpful.
4. **P3 Observability:** record image size and timings in safe optional fields; expose build results without reporting inaccurate physical disk savings. Preserve image ID/tag and existing status transitions.
5. **P4 Lifecycle cleanup:** bounded retention-aware cleanup only for unreferenced images/cache, with dry-run, locking, labels and rollback exclusions.
6. **P5 Canary and rollout:** test supported runtimes and key regressions, then run on a staging/pilot project, opt-in release, monitor, expand cautiously. Rollback via feature flag/template choice; healthy deployments must remain untouched.

## Deliverables

- Code diffs concentrated in worker deployment generator, build adapter, build context, policy/metrics helpers and corresponding tests.
- Benchmarks and documented evidence using same source commit, machine and build conditions.
- Metrics for user and admin, optional UI later, no dashboard UI changes required to ship initial backend changes.
- Updated deployment docs and an operational runbook.

## Mandatory engineering checks

```
npm ci
npm run lint
npm run format:check
npm test
npm audit --omit=dev --audit-level=moderate
```

Plus real Docker build/test runs on controlled host. Capture actual exit codes; never claim a test passed without executing it.

## Minimum acceptance criteria

- Existing runtime behavior preserved for Static, React, Vue, Express, generic Node.js, supported Next.js.
- No regression for `postinstall`, `prepare`, optional dependencies, native packages, output-directory settings, custom commands or Node production builds requiring source during install.
- No secrets in image history/build logs, no user-controlled Dockerfile execution, no privilege escalation, no public host networking, non-root runtime.
- Failure never replaces active release or invalidates retained rollback image.
- Metric fields optional/backward-compatible, errors in telemetry cannot fail deployments.
- Deployment performance compared by cold vs warm builds, median over repeated runs; size compared from Docker image inspect, disk usage from Docker system df with explicit shared-layer caveat.

## Instructions to coding agents

Read `01_CODE_AUDIT_AND_DECISIONS.md` through `04_VALIDATION_ROLLOUT.md` before editing. Start by confirming actual code and writing a gap report. Make small reviewable PRs and do not skip production prerequisites. Ask for explicit permission before host mutation, Docker prune, release cutover or live deploy.
