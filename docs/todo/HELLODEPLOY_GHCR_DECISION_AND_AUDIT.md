# HelloDeploy GHCR and Multi-Runtime Decision and Implementation Audit

Date: 2026-10-22
Status: Owner direction for Claude Code, subject to repository verification
Repository: https://github.com/4hprojects/HelloDeploy

## 1. Product decision

HelloDeploy remains **Node.js-first, not Node.js-only**. Keep the existing multi-runtime architecture for Next.js, Python, PHP, Java, owner Dockerfiles, and prebuilt OCI images. Retain the BuildKit-to-GHCR image pipeline as the intended path for new runtime pilots. Do not replace it with a Node.js-only architecture or rebuild completed features.

The owner does not currently want to pay for another VPS. This cost constraint does **not** authorize weakening isolation or enabling untrusted builds on the production host. Existing production applications and the legacy deployment path must remain functional.

## 2. Evidence observed on GitHub (documentation, not independent runtime verification)

Checked the `main` branch of `4hprojects/HelloDeploy` on October 22, 2026.

- `docs/multi-runtime/README.md` states that P0–P3 runtime strategies and P4 owner-image support are merged, deployed, and off by default behind feature flags and project allowlists.
- `docs/PRIORITIES.md` records a successful existing-app deploy and rollback test and says the build host is deferred by the owner decision of October 22.
- `docs/PLATFORM_ARCHITECTURE.md` describes remote rootless BuildKit, private GHCR, digest-pinned images, and the existing single production execution host.
- The documentation says the build host and private GHCR repository are not yet provisioned, so new runtime pilots cannot be enabled.

These claims must be independently reconciled with code, configuration, current branch, CI tests, and actual infrastructure. Never mark a capability operational from a documentation claim alone.

## 3. Claude Code task: Audit first, do not implement immediately

1. Check `git status`, current branch, upstream tracking, and latest commits. Do not discard local modifications.
2. Read `README.md`, `docs/PRIORITIES.md`, `docs/multi-runtime/README.md`, `docs/multi-runtime/STATUS.md`, `docs/multi-runtime/DECISIONS.md`, `docs/multi-runtime/THREAT_MODEL.md`, `docs/multi-runtime/BUILDKIT_GHCR_RUNBOOK.md`, `docs/multi-runtime/EVIDENCE.md`, and related architectural documentation.
3. Trace code paths for runtime detection, build strategies, BuildKit transport, OCI export, ORAS registry push, GHCR auth, digest pinning, deployment, image verification, cleanup, rollback, flags, allowlists, and failure behavior.
4. Inspect tests and CI definitions and run non-disruptive checks available in the local environment. Do not run production-affecting acceptance cases without explicit authorization.
5. Inspect `.env.example` and safe non-secret configuration names. Never print or commit tokens, credentials, private registry passwords, production environment values, or secrets.
6. Evaluate expected CPU, RAM, disk, build concurrency, kernel isolation, and consequences for the currently constrained production host. Check actual system metrics if host access is available. Do not assume that previous hardware measurements remain current.
7. Confirm the actual state of the builder, registry, packages, credentials, acceptance tests, and pilot flags using available authorized evidence. If there is no access, mark them **Not verified**, not **Missing** or **Completed**.

## 4. Output: implementation audit matrix

Provide a table with these columns:

| Component | Code state | Automated tests | Live infrastructure | Production availability | Evidence (file/line, test, command) | Gap or blocker |
|---|---|---|---|---|---|---|

Include at minimum:
- Existing Node.js/Express/React/Vue/static deployments
- Next.js standard, standalone, static modes
- Python Flask/FastAPI/Django
- PHP plain/Laravel
- Java Spring Boot Maven/Gradle
- Owner Dockerfiles
- Prebuilt OCI image pulls
- Remote rootless BuildKit and mTLS
- OCI image export and ORAS upload
- GHCR authentication, storage, deletion probe and retention
- Immutable digests, attestation/referrer handling and rollback
- Runtime container inspection and Trivy scanning
- Feature flags and project allowlists
- Acceptance harness, fixture coverage, live end-to-end results
- Restricted Docker Compose ADR (design only)

Use explicit classifications: `Implemented and verified`, `Implemented but unverified`, `Partially implemented`, `Designed only`, `Blocked by infrastructure`, `Not implemented`, or `Not applicable`.

## 5. Cost-aware options analysis

Compare these alternatives without making a configuration change:

A. **Keep all new-runtime pilots disabled**, use existing production runtime support, and retain ready code until hardware is available. This is the safe baseline.

B. **Ephemeral local VM for controlled generated-template tests only** if real memory headroom, swap, CPU, and service isolation support it. A same-host VM does not eliminate resource contention. Never run arbitrary owner Dockerfiles here; set strict resource limits and concurrency of one.

C. **Separate workstation or existing second computer** as dedicated build host, if available, with mTLS, strict network access, rootless builds, and no access to production MongoDB, Redis, secrets, Docker socket, or filesystem.

D. **Dedicated separate VPS** for production-quality isolation when funds permit. Do not assume the owner has approved recurring expenditure.

Evaluate any CI-hosted image-building alternative separately, including trust and secret boundaries, cost, provenance and whether it changes the planned architecture.

Rank options by security, additional monthly cost, required hardware, maintenance, and time to safe acceptance testing. Do not claim free equals risk-free.

## 6. Non-negotiable safety gates

- No new-runtime feature flag or project allowlist turned on without authorization and passing acceptance evidence.
- No arbitrary untrusted Dockerfile builds on the current production host or a VM sharing it.
- No production database use for destructive acceptance testing.
- No exposing GHCR tokens, mTLS keys, application secrets, or private registry credentials in logs or docs.
- No downgrade from rootless isolated remote builds simply to make a demo work.
- No destructive changes to production applications, routing, deployed containers, or retained rollback images.
- No direct commit to `main`; propose a dedicated branch and PR for approved changes.
- Leave Docker Compose at design stage until the required P4 safety gates pass.

## 7. Deliverables and work sequence

### Phase A: Read-only reconnaissance (start immediately)
- Report repository HEAD, branch, worktree condition and relevant PR/commit identifiers.
- Produce the audit matrix with concrete evidence.
- Identify discrepancies between current documentation and implementation.
- Separate existing features from missing infrastructure and untested functionality.

### Phase B: Recommendation (no code changes)
- Recommend the safest no-additional-VPS route for the near term.
- Provide a prioritized list of essential work, optional work, and deliberately deferred work.
- Specify measurable test gates and minimum host resource requirements.
- Estimate number of Claude Code sessions and approximate effort, with uncertainty clearly indicated.

### Phase C: Implementation only after owner approval
- Perform only the approved, lowest-risk tasks.
- Use a feature branch, tests, evidence log, and PR for review.
- Update `docs/PRIORITIES.md` and `docs/multi-runtime/STATUS.md` to reflect measured reality, not assumed completion.
- Stop at infrastructure, security, or authorization blockers and report the exact next action required.

## 8. Suggested prompt to Claude Code

Read `HELLODEPLOY_GHCR_DECISION_AND_AUDIT.md` and execute **Phase A and Phase B only**. Before writing code, audit the current repository and compare it against the existing docs. Our decision is to keep GHCR and multi-runtime support, with Node.js first in production; no new VPS expenditure for now. Identify what is implemented, tested, configured, actually operating, and blocked. Do not enable pilots, change production settings, add secrets, or deploy anything. Return the evidence matrix, conflicts, no-cost options, and an approval-ready action plan. Wait for explicit approval before Phase C.
