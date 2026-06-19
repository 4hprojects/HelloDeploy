# Claude Implementation Guide

## Objective

Implement HelloDeploy incrementally according to this blueprint without silently changing product scope or security assumptions.

## Required Reading Order

Before editing code, read:

1. `00_MASTER_INDEX.md`
2. `01_PRODUCT_SCOPE.md`
3. `02_SYSTEM_ARCHITECTURE.md`
4. `03_ROLES_AND_PERMISSIONS.md`
5. `04_WORKFLOWS.md`
6. `05_DATA_MODEL_AND_API.md`
7. `06_SECURITY_AND_OPERATIONS.md`
8. The active phase in `07_IMPLEMENTATION_PHASES.md`
9. Relevant tests in `08_TESTING_AND_ACCEPTANCE.md`
10. `11_DECISIONS_AND_DEFERRED_WORK.md`
11. `12_DEVELOPMENT_STACK.md`
12. `13_UI_UX_THEME_AND_BRAND.md`
13. `14_AUTHENTICATION_STANDARD.md`

## Implementation Protocol

For each task:

1. State the active phase and task.
2. Inspect existing code and uncommitted changes.
3. Identify affected components, contracts, data, tests, and documentation.
4. Present assumptions only when the blueprint is silent.
5. Implement the smallest complete vertical slice.
6. Add or update tests.
7. Run targeted validation, then broader checks proportional to risk.
8. Update task checkboxes only after acceptance criteria pass.
9. Record architectural decisions or deviations.
10. Report changed files, verification performed, and remaining risks.

## Prohibited Shortcuts

- Do not give the web process Docker socket access.
- Do not execute user-provided shell strings.
- Do not concatenate untrusted values into commands or Nginx configuration.
- Do not store plaintext environment secrets.
- Do not log tokens, database URLs, passwords, or private keys.
- Do not trust browser-supplied roles or ownership.
- Do not bypass the queue for deployments.
- Do not mutate existing PM2 or Nginx routes without a separately approved migration task.
- Do not implement deferred runtimes or database hosting in V1.
- Do not introduce TypeScript unless the project owner explicitly changes the approved stack.
- Do not introduce React, Vite, or Next.js for the HelloDeploy interface unless explicitly approved. Use Express and EJS.
- Do not mark a phase complete because the happy path works.

## Command Execution Rules

- Use argument arrays or reviewed libraries instead of shell interpolation.
- Apply timeouts and output limits.
- Validate all identifiers against strict formats.
- Create unique temporary directories with restricted permissions.
- Ensure cleanup runs on success, failure, cancellation, and process restart.

## Database Rules

- Define schemas and indexes alongside repository code.
- Validate every write.
- Use explicit status-transition functions.
- Use transactions where supported and materially useful.
- Never return internal encrypted payloads through API serializers.

## API Rules

- Authenticate and authorize at the handler boundary.
- Recheck authorization inside sensitive services.
- Use versioned request schemas.
- Return stable error codes.
- Add audit events for privileged mutations.
- Add idempotency protections to deployment actions.

## UI Rules

- Explain configuration in plain language.
- Separate status from available actions.
- Confirm destructive actions.
- Never imply that an external database is hosted by HelloDeploy.
- Clearly show whether deployment mode is manual, automatic, or approval-required.
- Display effective quotas and the source of any override.
- Sanitize logs before rendering.
- Use EJS, standard CSS, and small browser JavaScript modules.
- Use the documented design tokens rather than one-off colors and spacing.
- Use deployment orange and baby blue only in their assigned semantic roles.
- Reserve green for successful and healthy states.
- Include an icon and readable label for every status.
- Use the placeholder brand mark until approved final assets are supplied.
- Do not change asset filenames or public paths without updating all templates, email references, manifest entries, and tests.

## Definition of Done for a Task

- Requirement implemented
- Permissions enforced server-side
- Input validated
- Failure behavior handled
- Security impact reviewed
- Tests added and passing
- Documentation updated
- No unrelated changes introduced

## Phase Handoff Template

```markdown
## Phase Handoff

- Phase:
- Completed tasks:
- Acceptance criteria results:
- Tests executed:
- Security checks:
- Data migrations or indexes:
- Configuration changes:
- Known limitations:
- Next approved task:
```

## Clarification Rule

Stop and request a decision when a proposed change would:

- Broaden V1 runtime support
- Add database hosting
- Change default quotas
- Weaken a security boundary
- Modify existing production routes
- Introduce billing
- Add multi-server behavior
- Change role authority
- Create an external side effect not covered by the active phase
