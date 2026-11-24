# Hello Motion

Status 2026-11-25: Phase 00 audit and cleanup done ([00_AUDIT_REPORT.md](00_AUDIT_REPORT.md)); Phase 03 next. Moved from `docs/todo/` on 2026-11-25. Tracked in
[Priorities](../PRIORITIES.md) under **Next**.

A shared, accessible motion language for the Hello apps. This repository covers HelloDeploy
only; HelloRun, HelloPera, HelloUniversity, HelloTasks and HelloEventHub live in their own
repositories and are out of scope here.

## Files

- [HELLO_MOTION_DESIGN_SYSTEM.md](HELLO_MOTION_DESIGN_SYSTEM.md): the specification (principles,
  tokens, component contracts, phases).
- [IMPLEMENTATION_PROMPT.md](IMPLEMENTATION_PROMPT.md): the agent brief. Start at Phase 00.
- [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md): per-component release checklist.

## Plan for HelloDeploy

| Phase | Scope                                                                                                                                               | State       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 00    | Audit: existing `prefers-reduced-motion` use, deployment status and SSE views, lists, tabs, menus. Output: `00_AUDIT_REPORT.md` here                | Done        |
| 01    | Foundation: tokens and reduced-motion handling (from #195; cleaned up 2026-11-25), plain CSS and JS built by `npm run assets:build`; no new package | Done        |
| 03    | HelloDeploy pilot: deployment status transitions from server events only, stable deployment list, actions menu, tabs; behind a flag                 | Not started |

Landing and dashboard visual changes need baselines from the CI runner; a red main CI stops
autodeploy.
