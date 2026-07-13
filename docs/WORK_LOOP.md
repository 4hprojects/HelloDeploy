# HelloDeploy Autonomous Work Loop

Updated: 2026-07-14T06:49:21+08:00

This document defines how Codex continues HelloDeploy work across implementation tasks and sessions. It complements `AGENTS.md`: the agent instructions govern engineering behavior, while this loop governs task selection, continuation, evidence, and stopping.

## Sources of Truth

Use the following precedence when deciding what to do:

1. The user's current explicit request.
2. Repository-wide instructions in `AGENTS.md`.
3. Current execution status in `IMPLEMENTATION_BATCH_TRACKER.md`.
4. Acceptance and release gates in `DEPLOYMENT_READINESS_ROADMAP.md`.
5. Applicable blueprints, phase specifications, and operational documentation.
6. The behavior demonstrated by the implementation and tests.

The batch tracker owns status. The roadmap owns release requirements. `WORKLOG.md` owns detailed historical evidence. `FULL_IMPLEMENTATION_OVERVIEW.md` provides the human-readable phase map. This document owns the execution protocol and must not duplicate detailed status.

When documentation and implementation disagree, investigate the difference. Update stale documentation when it is in scope; never silently choose the more convenient interpretation.

## Start or Resume

At the beginning of a continuous work run:

1. Read `AGENTS.md`, `CLAUDE.md`, this document, the current section of the batch tracker, and the applicable specifications.
2. Inspect `git status --short`, the related implementation and tests, the available runtime and services, and the most recent recorded evidence.
3. Preserve the starting worktree. Treat pre-existing modifications and untracked files as user work unless the current task clearly owns them.
4. Select the next task using the rules below and state a short plan before editing.

Select work in this order:

1. Complete the user's explicit current task.
2. Otherwise, select the first incomplete, actionable task in the current batch whose dependencies are available.
3. If the current batch is externally blocked, select safe local prerequisite or risk-reduction work from a later batch only when it does not invalidate the documented sequence. Record the work under its owning batch.
4. Do not mark an externally blocked task complete using mocks, local substitutes, or documentation alone.

## Execution Loop

Repeat the following cycle while authorized work remains:

1. Convert the selected task into concrete acceptance criteria.
2. Inspect related code, tests, configuration, and documentation.
3. Implement the smallest coherent slice that satisfies the criteria and follows existing patterns.
4. Run focused checks after each major change.
5. Diagnose failures, correct implementation-related problems, and rerun the affected checks.
6. Run the broader verification required by `AGENTS.md` and the task's risk area.
7. Review the diff and worktree for accidental or unrelated changes.
8. Record status, evidence, limitations, and the exact next action.
9. Select the next actionable tracker item and continue without requesting routine confirmation.

Targeted success is not a stopping point when another safe, authorized tracker item remains. Never weaken tests, acceptance criteria, security controls, or validation merely to make a check pass.

## Failure and Blocker Handling

- Fix failures caused by the current implementation and rerun the affected checks.
- Confirm and report pre-existing failures. Do not expand into unrelated repairs unless they block the authorized work and the repair is safe and relevant.
- Isolate and rerun suspected flaky checks. Do not report them as passing until the result is reliable.
- For unavailable Docker, MongoDB, Redis, Nginx, GitHub, network, supported-host, or privileged checks, record the exact command, failure, missing dependency, and required environment.
- When one lane is externally blocked, scan the tracker for other safe local work before stopping.
- Never represent an unrun, skipped, mocked, or failing check as production evidence.

## Evidence Contract

After meaningful work:

- Update `IMPLEMENTATION_BATCH_TRACKER.md` with task state, concise evidence, blockers, and the next action when readiness status changed.
- Update `WORKLOG.md` with affected behavior, exact commands and results, test counts, and limitations when implementation or verification evidence was produced.
- Update the relevant specification or runbook when behavior, operator steps, or acceptance criteria changed.
- Mark a task or batch complete only when its full completion gate is satisfied.

Evidence must distinguish local checks, simulated integration checks, CI results, supported-host results, and production or pilot observations.

## Autonomy Boundaries

Continuous authorization covers safe repository-local inspection, editing, dependency installation from the existing lockfile, testing, formatting, validation, and documentation required by the selected task.

It does not authorize committing, pushing, opening pull requests, deploying, changing production systems, using or exposing secrets, modifying DNS or cloud resources, or performing destructive or privileged host operations unless the user explicitly requests them.

Codex may continue through multiple tasks during an active run, but it cannot start a new chat turn by itself after returning control to the user. This document makes the next run resumable without requiring the user to restate project context.

## Stop Conditions

Stop only when one of these conditions is true:

- All authorized actionable work is complete.
- Remaining progress requires credentials, external coordination, target-host access, an irreversible action, or a material product decision.
- Continuing would risk overwriting ambiguous pre-existing worktree changes.
- A genuine safety or requirements conflict cannot be resolved from repository context.

Before stopping, record the blocker, evidence already collected, and the exact input, environment, or command needed to resume.

## Current Handoff

As of 2026-07-14, the current Ubuntu 26.04 laptop remains the live HelloDeploy dashboard pilot and in-place productionization target. Reviewed release `v0.1.4` is published. The encrypted emergency pilot capture passed checksum verification after remount, temporary recovery-key decryption, the bounded archive inventory, and every internal checksum; both media were then closed cleanly. This is same-host retrieval evidence, not cross-host restore. PM2 still predates the reviewed release and must not be restarted yet: value-safe production validation fails because the GitHub App name is incomplete and the required local Nginx-helper policy is unavailable. The production worker synchronously validates that helper during startup, making the prior normalization-before-foundation order impossible. Host mutation remains stopped pending explicit approval to use the verified emergency capture as the recovery gate for prepare-only foundation installation, then separately activate and validate the helper with the deployment queue paused before Node.js 22 normalization. A final post-normalization backup remains required before traffic cutover or application deployment. The release remains **NO-GO for customer application hosting** until isolation, routing, secure cookies, real deployments, rollback, authenticated QA, and cross-host restoration pass directly.

Refresh this short handoff only when the overall execution boundary changes. Keep detailed task state and command evidence in the tracker and worklog.
