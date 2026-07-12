# HelloDeploy Agent Instructions

## Project context

HelloDeploy is a Node.js monorepo using npm workspaces. It provides a self-hosted application deployment platform through the Express/EJS web application in `apps/web`, the BullMQ deployment worker in `apps/worker`, and shared packages under `packages`.

Before editing:

1. Read `CLAUDE.md` for the current architecture, repository conventions, and command reference.
2. Read `docs/WORK_LOOP.md` and the current section of `docs/IMPLEMENTATION_BATCH_TRACKER.md` when continuing production-readiness or multi-task work.
3. Read the relevant documents in `hellodeploy-blueprint/` and any applicable specification in `docs/phases/`.
4. Inspect the related implementation and tests. Do not infer existing behavior from documentation alone.

## Continuous work loop

When the user asks to continue, work continuously, or proceed without routine confirmation, follow `docs/WORK_LOOP.md`.

- Select the next safe, actionable task from the authoritative implementation tracker after completing the current task.
- Continue through inspect, implement, verify, diff review, and evidence recording while authorized local work remains.
- Do not stop merely because one targeted check passed or one tracker item is complete.
- If the current lane requires external access, scan for safe local prerequisite or risk-reduction work before stopping.
- Do not use mocks or local substitutes to claim an external, supported-host, CI, pilot, or production gate is complete.
- Respect the autonomy boundaries and stop conditions in `docs/WORK_LOOP.md`.

## Required workflow

For every implementation task:

1. Establish the acceptance criteria and inspect the starting worktree so pre-existing user changes are preserved.
2. Present a short implementation plan before making changes.
3. Make the smallest coherent change that satisfies the requested behavior and follows existing project patterns.
4. Run relevant targeted tests after each major change.
5. Inspect failures and correct problems caused by the implementation, then rerun the affected checks.
6. Run the complete verification appropriate to the change scope.
7. Review the final diff and worktree status for accidental or unrelated changes.
8. Record tracker and worklog evidence when the task belongs to the readiness plan, then report completed work, checks actually run, and any unresolved limitations or environmental blockers.
9. When continuous work is authorized, select the next actionable task and repeat until a documented stop condition is reached.

## Verification commands

- Lint: `npm run lint`
- Formatting check: `npm run format:check`
- Full test suite: `npm test`
- Watch tests: `npm run test:watch`
- Configuration validation: `npm run config:check`

Run relevant targeted tests during implementation. Before completing broad implementation work, run linting, the formatting check, and the full test suite. Run configuration validation when configuration or environment handling changes.

When changes affect security, installation, infrastructure, or deployment-worker behavior, run the applicable focused tests under `tests/security/`, `tests/installer/`, `tests/nginx/`, `tests/operations/`, or `tests/worker/` in addition to the general verification appropriate to the task.

Some integration checks may require Docker, MongoDB, Redis, nginx, GitHub access, network access, or host privileges. If a required dependency is unavailable, report the exact command, failure, and environmental limitation. Never describe an unrun, skipped, or failing check as passing.

## Engineering rules

- Follow the existing npm-workspace structure and established controller, service, model, queue, and worker patterns.
- Reuse existing components and packages before adding new abstractions or dependencies.
- Do not introduce a new framework or materially change the architecture without approval.
- Preserve backward compatibility unless the task explicitly authorizes a breaking change.
- Keep secrets, credentials, tokens, private keys, and unredacted sensitive values out of source files, logs, fixtures, and reports.
- Preserve pre-existing worktree changes. Do not overwrite, reformat, remove, or claim ownership of unrelated user edits.
- Do not modify unrelated files merely to make the final diff appear clean.
- Do not claim a requirement or check passed unless it was verified.

## Completion conditions

Stop only when:

- The requested acceptance criteria are satisfied.
- Relevant runnable checks pass, including the broader verification required by the change scope.
- The final diff has been reviewed and contains no accidental or unrelated changes introduced by the task.
- Any unavailable checks, remaining limitations, or exact blockers are documented clearly.

For a continuous work run, also apply the stop conditions in `docs/WORK_LOOP.md`; completion of a single task does not end the run while safe authorized work remains.

Layered `AGENTS.md` files may be added in the future when a subsystem has stable requirements that differ from these repository-wide instructions. Do not add them speculatively.
