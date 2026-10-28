# HelloDeploy UI/UX and Public Content Improvement Roadmap

Date: 2026-10-27
Status: Complete. Phases 0A-7 merged as PR #153 (`eca5302`), deployed to production 2026-10-27; owner Orca pass (UX-09) passed 2026-10-28. Open: UX-08 deferred (P3), owner signed-in production check.
Repository: 4hprojects/HelloDeploy

## Goal

Improve clarity, navigation, onboarding, deployment management, administrative usability, and public content without rebuilding an already functioning platform.

## Ground rules

- This document is a plan, not permission to alter production.
- Preserve Express 4, server-rendered EJS, MongoDB, Redis, BullMQ and the current worker pipeline.
- Reuse `docs/UI_DESIGN_SYSTEM.md`, `apps/web/public/css/{tokens,components,layout}.css`, current view partials, and `@hellodeploy/contracts` status presentation.
- Respect `CLAUDE.md`, `AGENTS.md`, `docs/PRIORITIES.md`, and existing test conventions.
- Do not automatically merge, deploy, enable experimental runtimes, change builder settings, adjust database schemas, or mutate infrastructure.
- Treat existing automated test code as coverage, not proof tests passed. Gather actual results.
- Treat source-level concerns as hypotheses until validated visually or behaviorally.
- Make no implementation changes during the audit stage.

## Existing architecture, verified in repository

- npm workspaces with `apps/web`, `apps/worker`, and `packages/*`.
- Express/EJS server-rendered frontend with shared header, sidebar, status badge and form partials.
- Existing application dashboard, project overview, deployment list/details, domain, environment, activity, and admin views.
- Playwright and axe browser test suite in `tests/browser/`, including responsive and role-specific paths.
- Existing design system in `docs/UI_DESIGN_SYSTEM.md`.
- Builder admin interface already exists. Latest `docs/PRIORITIES.md` reports an on-demand pilot in observation, not permission to expand or activate other runtime pilots.

## Phase gates and order

| Phase | Work                                      | Priority | Gate                                                        |
| ----- | ----------------------------------------- | -------- | ----------------------------------------------------------- |
| 0A    | Source audit and code inventory           | P0       | Initial inspection completed; refresh against target commit |
| 0B    | Rendered visual and workflow verification | P0       | Must complete before code changes                           |
| 1     | Navigation and shared UI refinements      | P1       | Specific problems validated and scoped                      |
| 2     | Dashboard and onboarding refinements      | P1       | State-specific screenshots reviewed                         |
| 3     | Deployment experience refinements         | P1       | Deploy and rollback behavior preserved                      |
| 4     | Public content and docs                   | P1       | Claims verified against production feature gates            |
| 5     | Admin/configuration refinements           | P2       | Permissions and safety interactions reviewed                |
| 6     | Accessibility, SEO, performance           | P2       | Baseline and follow-up measurements recorded                |
| 7     | Regression and controlled release         | P1       | Human approval for merge and production rollout             |

## Progress (2026-10-27)

| Phase | Status                                                                                                                                                            | Commit    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0A    | Done (refreshed at `dc33b71`)                                                                                                                                     | —         |
| 0B    | Done. Report: https://claude.ai/artifact/TSB2jc97DDwnxEg6STXQo7                                                                                                   | —         |
| 1     | Done: sidebar `inert` (F-01), modal focus test (F-07a)                                                                                                            | `1fedbee` |
| 2     | Done: live-while-deploying (A-04), overview de-dup (A-06)                                                                                                         | `4f903b1` |
| 3     | Done: Previous release label (A-01), Advanced section (A-05), alert wrap (F-02), console column (F-04)                                                            | `4f903b1` |
| 4     | Done: paused pilot section (A-03), homepage limits (A-07), timezone labels (F-06)                                                                                 | `ea7baa6` |
| 5     | Done: admin Server wrap (F-03), single verification message (F-05)                                                                                                | `ea7baa6` |
| 6     | Done: WCAG AA contrast tokens (A-02), serious axe gate (F-07b)                                                                                                    | `4e0db49` |
| 7     | Done. Follow-ups `da41a88`, `95d0f1b`, `b0a552d`; CI-runner baselines committed. Pushed to origin. Open: draft PR (needs owner), Orca pass, merge/deploy approval | `58c7548` |

## Next immediate action (superseded by Progress above)

Run `01-VISUAL-AND-WORKFLOW-AUDIT.md` in audit-only mode. Do not generate implementation patches during this run. Capture evidence and fill `02-ISSUE-REGISTER-AND-DECISION-GATES.md`.

## Candidate priorities, not confirmed defects

1. Evaluate the density and hierarchy of deployment actions, especially latest commit, no-cache, exact commit and rollback.
2. Evaluate whether project overview duplicates address/status information or hides the next action.
3. Verify public pilot limits and capability descriptions against active flags.
4. Review service status freshness handling.
5. Verify recently changed admin screens using Orca and keyboard testing.
6. Review admin approval and activity table discoverability, filtering and mobile behavior.

## Token budget (aggregate, not context window)

- Phase 0B remaining audit: 38K–77K tokens estimate.
- Full subsequent phased implementation: preliminary 380K–850K total aggregate tokens, subject to Phase 0B refinement.
- Track per-task approximate input/output tokens rather than treating estimates as measurement.

## Acceptance criteria for Phase 0B

- Recorded target branch and commit SHA.
- Screenshot matrix for public, account, project, deployment and admin workflows at 390, 768 and 1440 CSS pixels, plus targeted 320px and 200% zoom.
- Actual Playwright, axe and related checks run with command, result and failure logs.
- Distinguish fixture observations from production observations.
- Each confirmed issue includes evidence, steps, expected vs actual, risk and proposed fix.
- Any unavailable page or untestable state marked NOT VERIFIED rather than passed.
- No code edits, GitHub writes, server reconfiguration or deploys.
