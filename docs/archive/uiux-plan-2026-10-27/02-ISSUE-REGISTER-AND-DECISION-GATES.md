# HelloDeploy UX Issue Register and Approval Gates

Date: 2026-10-27
Status: PRELIMINARY. No issue below has been visually verified in production.

## Evidence labels

- VERIFIED_SOURCE: code or documentation directly inspected.
- VERIFIED_FIXTURE: demonstrated in rendered deterministic fixture.
- VERIFIED_LOCAL: observed in a running nonproduction application.
- VERIFIED_PRODUCTION: observed on the current live application.
- UNVERIFIED: proposed issue needing visual or behavioral evidence.
- BLOCKED: required audit action cannot be executed safely or with available access.

## Preliminary candidates

| ID    | Candidate                                                                                         | Evidence now                                                         | Priority to investigate | Implementation gate                                                       |
| ----- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| UX-01 | Deployment page presents latest, no-cache, specific-commit and rollback controls in same workflow | VERIFIED_SOURCE: `apps/web/src/views/pages/projects/deployments.ejs` | P1                      | Prove actual visual/action confusion before regrouping                    |
| UX-02 | Project URL appears in header and can also appear in overview summary                             | VERIFIED_SOURCE: `apps/web/src/views/pages/projects/show.ejs`        | P2                      | Determine whether duplication harms or helps usability                    |
| UX-03 | Project page varies substantially by setup, approval, failure and healthy states                  | VERIFIED_SOURCE: project overview conditional sections               | P1                      | Capture each state and measure clarity of next action                     |
| UX-04 | Pilot limits not summarized in homepage hero/current homepage sections                            | VERIFIED_SOURCE: `apps/web/src/views/pages/index.ejs`                | P1                      | Verify final public copy and accurate pilot quotas before changing        |
| UX-05 | Homepage uses simplified four-step journey                                                        | VERIFIED_SOURCE: `apps/web/src/views/pages/index.ejs`                | P2                      | Verify whether detailed guide sufficiently explains approval/verification |
| UX-06 | Status view renders operational state and timestamp without explicit stale-data branch            | VERIFIED_SOURCE: `apps/web/src/views/pages/status.ejs`               | P1                      | Trace controller/service freshness first; no premature backend edits      |
| UX-07 | Admin overview has several operational sections                                                   | VERIFIED_SOURCE: `apps/web/src/views/pages/admin/index.ejs`          | P2                      | Run admin task walkthrough before restructuring                           |
| UX-08 | Sidebar combines global, project and admin scopes, already with active/setup badges               | VERIFIED_SOURCE: `apps/web/src/views/partials/sidebar.ejs`           | P2                      | Verify user confusion before changing navigation                          |
| UX-09 | Admin screen-reader regression after recent changes                                               | VERIFIED_SOURCE: `docs/PRIORITIES.md`                                | P1                      | Repeat Orca check and report exact defects, if any                        |
| UX-10 | Mobile interactions need broad verification                                                       | VERIFIED_SOURCE: browser tests cover some responsive widths          | P1                      | Run screenshots and keyboard/touch tests; do not presume failure          |

## Priority definitions

- P0: Blocks critical access, safe operation, or a required security boundary.
- P1: Material friction in onboarding, deployment, app status, or high-traffic public decisions.
- P2: Important clarity, accessibility or efficiency improvements without a critical blocker.
- P3: Enhancement that can be deferred with low user cost.

## Owner decisions required after audit

1. Approve or reject each confirmed change, with evidence attached.
2. Confirm which public pilot limits and runtimes are live at the target commit and on production.
3. Confirm whether to introduce progressive disclosure of advanced deployment actions.
4. Confirm acceptable shared component changes and required screenshot baselines.
5. Approve scoped implementation documents, feature branch, and regression criteria before code modifications.
6. Approve merge and release separately. Never infer release approval from approval to write docs.

## Existing regression safety requirements

- Keep all existing URLs, role checks, CSRF protections and API contracts unless specifically approved.
- No changes to deployment pipeline, workers, Docker, nginx, Redis, secrets, MongoDB schemas or builder activation in a UI-only task.
- Reuse the canonical status contract, EJS partials and CSS tokens.
- Keep rollback, retry, no-cache, exact-commit and approval flows operational.
- Record passing tests and new tests for any altered screen or interaction.

## Completion record template

| ID                  | Verification status                                  | Repro evidence    | Severity | Decision                                  | Scoped fix                                        | Test evidence                                                                              |
| ------------------- | ---------------------------------------------------- | ----------------- | -------- | ----------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| UX-01 / A-05        | VERIFIED_FIXTURE                                     | Phase 0B e01, e02 | P2       | Approved                                  | History first; Advanced `<details>`               | `advanced deployment controls stay collapsed below the history`                            |
| UX-02, UX-03 / A-06 | VERIFIED_FIXTURE                                     | e04               | P3       | Approved                                  | Removed header badge and duplicate address        | overview unit tests                                                                        |
| UX-03 / A-04        | VERIFIED_SOURCE + FIXTURE                            | e04               | P1       | Approved                                  | Live state kept during redeploy                   | `keeps a live release visible while an update deploys`; browser `keeps a live app visible` |
| UX-04 / A-03        | VERIFIED_PRODUCTION                                  | e07               | P1       | Approved (core only; paused section)      | Invitation-only pilot (paused) section            | `supported applications keep paused pilot runtimes out`                                    |
| UX-04 / A-07        | VERIFIED_PRODUCTION                                  | e06               | P3       | Approved                                  | Limits line from plan defaults                    | `homepage summarises the pilot limits`                                                     |
| UX-05               | Not confirmed                                        | e06, e11          | —        | No change                                 | —                                                 | —                                                                                          |
| UX-06 / F-06        | Refuted (stale); timezone missing                    | e14               | P3       | Auto                                      | Timezone labels + `<time>`                        | `status check time states its timezone`                                                    |
| UX-07               | Not confirmed                                        | e13               | —        | No change                                 | —                                                 | —                                                                                          |
| UX-08               | Not confirmed                                        | probe2            | P3       | Deferred (double aria-current)            | —                                                 | —                                                                                          |
| UX-09               | NOT VERIFIED (human Orca pass)                       | —                 | —        | Owner to run                              | —                                                 | —                                                                                          |
| UX-10 / F-01..F-04  | Mostly refuted; 3 overflows + hidden focus confirmed | results.json      | P1/P2    | Auto                                      | inert, wrapping, detail-list wrap, console column | sidebar, phone-viewport and admin-server tests                                             |
| A-01                | VERIFIED_SOURCE + FIXTURE                            | e01               | P1       | Approved ("Previous release")             | `release.RETAINED` presentation                   | `labels only the active release as live`                                                   |
| A-02                | VERIFIED_FIXTURE + PRODUCTION                        | axe               | P1       | Approved (owner regenerates CI baselines) | AA tokens; dark action fills                      | serious axe gate across spec                                                               |
| F-05                | VERIFIED_FIXTURE                                     | e15               | P3       | Auto                                      | Single verification message                       | `unverified sign-in explains verification once`                                            |
