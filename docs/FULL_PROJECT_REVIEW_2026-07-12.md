# HelloDeploy Full Project Review

**Review date:** 2026-07-12
**Reviewed revision:** `0f8f8f3` (`main`)
**Release assessment:** **NO-GO for production; strong application baseline, incomplete operational proof**

## Purpose and sources of truth

This review is a current engineering reference for deciding what to improve next. It covers the web application, deployment worker, shared packages, automated tests, CI, infrastructure scripts, operational documentation, and the active worktree.

Use these documents together:

- `docs/IMPLEMENTATION_BATCH_TRACKER.md` is the execution authority for production-readiness work.
- `docs/DEPLOYMENT_READINESS_ROADMAP.md` defines release gates and acceptance criteria.
- `docs/IMPROVEMENTS.md` preserves earlier code-review history; some unchecked entries are now stale and must be revalidated before implementation.
- This review records the current baseline, priorities, and recommended sequence.

## Executive assessment

HelloDeploy has a strong application-security and automated-testing foundation. Its most important risks are now operational: the supported local runtime is inconsistent, production configuration is incomplete, the web process lacks readiness and graceful shutdown, privileged routing and lifecycle scripts still need target-host proof, and no end-to-end Docker-backed release evidence has been recorded.

The project should not add substantial product scope until the green baseline and service-lifecycle batches are complete. The shortest safe path is to execute Batches 1–4 in order, then validate installation, real deployments, and recovery on clean hosts.

### Current strengths

- Clear npm-workspace boundaries across web, worker, and shared packages.
- Defense-in-depth for CSRF, sessions, passwords, token comparison, redaction, authorization, build contexts, non-root runtime containers, resource limits, and loopback port publishing.
- Deployment orchestration has focused tests for build, activation, rollback, retention, port allocation, SSE, and failure cleanup.
- CI uses Node.js 22, clean installation, linting, formatting, test, test-configuration validation, and production dependency audit.
- Operational intent is documented through ADRs, runbooks, release smoke tests, environment references, and a batch-oriented readiness tracker.

## Verified baseline

Commands were run from the repository root on 2026-07-12.

| Check                                         | Result  | Evidence / interpretation                                                                                                                                              |
| --------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                | Pass    | ESLint exited 0.                                                                                                                                                       |
| `npm run format:check`                        | Pass    | All matched files use Prettier formatting.                                                                                                                             |
| `npm test`                                    | Fail    | 600 passed, 1 failed, 0 skipped. The preflight test correctly rejects the local Node.js `20.20.2`; the project requires Node.js 22+.                                   |
| `npm audit --omit=dev --audit-level=moderate` | Pass    | No production dependency vulnerabilities reported.                                                                                                                     |
| `npm run config:check`                        | Fail    | `GITHUB_APP_NAME` is missing and `GITHUB_APP_PRIVATE_KEY_PATH` does not reference a readable file. This is configuration evidence, not an application test regression. |
| CI workflow review                            | Present | CI targets Node.js 22 and runs install, lint, format, test config validation, tests, and production audit.                                                             |

The full suite failure is caused by running the supported-runtime assertion under Node.js 20. It should be resolved by standardizing the development/runtime environment on Node.js 22, not by weakening the preflight test.

The configuration failures must remain visible until valid development or production-equivalent GitHub App settings are supplied. Secrets and private-key material must not be committed.

## Prioritized improvements

### P0 — Establish a trustworthy green baseline

1. Standardize Node.js 22 across developer setup, automation, preflight, CI, and production services. Add a repository runtime declaration such as `.nvmrc` or `.node-version` and document the chosen version-management path.
2. Run `npm ci` under Node.js 22 and confirm it leaves `package-lock.json` unchanged.
3. Rerun all quality gates and record the exact test totals and revision in the batch tracker or worklog.
4. Resolve the current worktree intentionally before producing a release. At review time it contains modified documentation plus untracked `AGENTS.md`, the implementation tracker, and this review.
5. Define the release branch/tag and immutable rollback-reference policy.

**Exit condition:** all local and CI checks pass on Node.js 22, dependency installation is reproducible, and a reviewed clean commit represents the release candidate.

### P0 — Complete production configuration safely

1. Supply and validate `GITHUB_APP_NAME` and a readable GitHub App private-key path outside source control.
2. Select one production routing mode and make `.env.example`, setup output, environment documentation, runtime validation, and systemd units agree.
3. Prove both web and worker processes fail before accepting work when required production configuration is invalid.
4. Keep validation output limited to key names and status; never print secret values or private-key contents.

**Exit condition:** web and worker start under their intended service identities with production-equivalent configuration, while invalid and partial configurations fail safely.

### P1 — Add readiness and bounded shutdown

The web server currently starts with `app.listen(...)` without retaining the server handle or registering `SIGTERM`/`SIGINT` handlers. `/health` is a liveness response and does not prove MongoDB, Redis, or queue readiness.

1. Preserve `/health` as lightweight liveness and add a separate readiness endpoint for critical dependencies.
2. Retain the HTTP server handle; stop accepting new connections on shutdown, drain active requests within a bound, then close MongoDB and Redis clients.
3. Make shutdown idempotent and handle repeated signals, close errors, startup failures, and timeout escalation without leaking configuration.
4. Harden the worker's existing shutdown path to the same idempotency and error-reporting standard.
5. Align systemd stop timeouts with the application drain deadline and add automated lifecycle tests.

**Exit condition:** readiness becomes unhealthy when a critical dependency is unavailable, and web/worker restarts do not abruptly terminate normal in-flight work.

### P1 — Prove privilege isolation and atomic routing

1. Validate route creation, replacement, removal, `nginx -t` rejection, reload failure, and rollback on a supported Ubuntu host.
2. Prove the web identity cannot access Docker or the privileged Nginx helper; restrict `.env` and GitHub private-key access to only the services that need them.
3. Ensure route writes are atomic and a bad candidate never replaces the last healthy route.
4. Add installer/preflight ownership and permission diagnostics where proof is currently manual.

**Exit condition:** route activation works through the constrained worker/helper path, invalid configuration preserves live traffic, and least-privilege assertions are reproducible.

### P1 — Make lifecycle and recovery reproducible

1. Install and upgrade immutable commits/tags with `npm ci`; reject unsafe dirty production checkouts.
2. Drain or safely stop active jobs before upgrades and automatically restore the exact prior revision when verification fails.
3. Define an encrypted off-host backup destination and include checksums plus a machine-readable manifest.
4. Restore application, database, routing state, secrets, and one representative deployed project on a second clean host.
5. Record measured recovery point and recovery time results.

**Exit condition:** clean install, upgrade, failed-upgrade rollback, backup, and cross-host restore have recorded evidence.

### P2 — Revalidate the remaining engineering backlog

Do not implement unchecked items from `docs/IMPROVEMENTS.md` blindly. The historical backlog already contains stale entries: CI now runs a production dependency audit, and dequeue-time job validators exist in `packages/contracts` and the worker dispatcher.

After P0/P1 work, perform a short evidence pass over each remaining item and close, rewrite, or promote it. Highest-value candidates still visible in current code/docs are:

- Master-key rotation and re-encryption support.
- Worker-side validation before Dockerfile templating, independent of web validation.
- Audit retention, bounded metadata, and worker audit coverage.
- Cleanup of project images, networks, inactive containers, abandoned workspaces, and bounded Docker logs.
- Direct tests for destructive worker jobs and GitHub App JWT generation.
- User-visible webhook-trigger failure status.
- Navigation consistency, dashboard attention signals, and live deployment-list updates.

Each promoted item should receive focused acceptance criteria and tests before implementation.

## Recommended execution order

1. **Batch 1:** switch the working environment to Node.js 22, establish a green reproducible baseline, and settle release/worktree policy.
2. **Batch 3 configuration tasks needed for startup:** complete GitHub App and routing configuration without committing secrets.
3. **Batch 4:** implement readiness and graceful shutdown with lifecycle tests.
4. **Batch 2:** complete and prove Nginx privilege isolation and atomic routing on a supported host.
5. **Batch 5:** harden install, upgrade, rollback, backup, and restore.
6. **Batches 6–7:** run real Docker-backed runtime, adversarial, pilot, outage, and recovery scenarios.
7. **Batch 8:** make the final release decision from recorded evidence.
8. Revalidate and schedule the remaining code-quality and UX backlog after the platform has a proven operational baseline.

## Review limitations

- This was a repository and local automated-check review, not a penetration test.
- No production secrets were requested or inspected.
- Docker-backed deployments, GitHub App integration, Nginx reloads, systemd behavior, external DNS/TLS, email delivery, backup restoration, and outage recovery were not executed in this environment.
- The active documentation changes predated this review and were preserved without modification.
