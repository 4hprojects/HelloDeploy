# HelloDeploy Multi-Runtime Expansion: Codex Master Instructions

Status: PROPOSED / NOT IMPLEMENTED  
Baseline: public `4hprojects/hellodeploy`, inspect `main` at execution time  
Date prepared: 2026-10-16

## Mission

Extend the existing self-hosted HelloDeploy Docker deployment engine to support complete Next.js, Python, PHP, Java, Dockerfile builds, OCI registry images and eventually restricted Docker Compose, without breaking existing Static, React, Vue, Express, Node.js, and supported Next.js deployments.

## Absolute rules

1. Start by auditing source, tests, runbooks, deployments, and production readiness. Documentation is evidence of intent, not proof of runtime support.
2. Create a new feature branch from an up-to-date base. Suggested branch: `feat/multi-runtime-deployments`. Never commit straight to `main` and never deploy production from this branch by default.
3. Preserve existing project schemas and deployment behavior, release retention, healthy candidate activation, rollback, loopback-only routing, encrypted secrets, project limits, GitHub App permissions, audit logs, and web/worker privilege separation.
4. Do not grant Docker socket, privileged containers, host networking, host PID/IPC, host mounts, arbitrary device access, or dangerous capabilities to project containers.
5. Do not execute untrusted user Dockerfiles directly on the public Ubuntu host without an approved isolation threat model and enforceable builder boundary. Gate these features until independently verified.
6. Changes must be additive, backward compatible, migration-safe, documented, tested, and behind feature flags for risky new runtimes.
7. Never silently enable public arbitrary images, Compose, or hosted databases.
8. Keep all changes on feature branch, commit each finished phase with descriptive commits, and open/update a **draft PR**. Convert to ready for review only when the selected release scope and all gates pass. A merge needs human authorization.
9. Before every implementation phase, read `01_BASELINE_AND_DISCOVERY.md`, its phase file, `08_SECURITY_AND_ACCEPTANCE.md`, and `09_STATUS_AND_REPORTING.md`.
10. After every priority item and phase, update status, evidence, measured tokens, and change log before moving on. Stop when a blocking gate fails. Do not claim tests were executed if not run.

## Reading order

1. `01_BASELINE_AND_DISCOVERY.md`
2. `02_ARCHITECTURE_AND_CONTRACTS.md`
3. `03_PHASE_0_1_BASELINE_NEXTJS.md`
4. `04_PHASE_2_PYTHON.md`
5. `05_PHASE_3_PHP_JAVA.md`
6. `06_PHASE_4_DOCKERFILE_REGISTRY.md`
7. `07_PHASE_5_COMPOSE_RESOURCES.md`
8. `08_SECURITY_AND_ACCEPTANCE.md`
9. `09_STATUS_AND_REPORTING.md`
10. `10_BRANCH_RELEASE_AND_ROLLBACK.md`
11. `11_ESTIMATES_AND_DECISIONS.md`

## Existing repository landmarks (verify current revisions)

- `apps/web`: dashboard, HTTP/API, input validation and permissions.
- `apps/worker`: deployment jobs, builders, Docker lifecycle, health and routing.
- `packages/contracts`, `packages/database`, `packages/queue`, `packages/security`: shared boundaries.
- `infrastructure/`: installer, upgrade/recovery, systemd and Nginx helpers.
- `docs/PLATFORM_ARCHITECTURE.md`, `docs/PRIORITIES.md`, `docs/USER_GUIDE.md`, `docs/SECOND_SITE_DEPLOYMENT_CHECKLIST.md`.
- `hellodeploy-blueprint/`: product decisions and intended boundaries.

## Completion contract

Every phase produces: code + tests + docs + screenshots for UI changes when relevant + exact commands/results + risk assessment + rollback plan + status update + phase commit. No merge until user approval, CI checks, security tests and deployment rehearsals meet acceptance gates. Phase 4/5 can remain disabled and out of the first release PR.
