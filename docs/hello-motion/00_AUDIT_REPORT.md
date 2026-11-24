# Hello Motion — Phase 00 Audit (HelloDeploy)

Date: 2026-11-25. Scope: this repository only. HelloRun, HelloPera, HelloUniversity, HelloTasks
and HelloEventHub live in other repositories and were not audited here.

## Summary

HelloDeploy already has a motion layer, added in #195 (`ecd607b`). Its tokens match the spec,
and it covers most of MOT-02, MOT-04 and MOT-06. The pilot therefore fills gaps in that layer
instead of adding a new package. Two gaps matter:

1. **Housekeeping**: two copies of the reduced-motion rule, a legacy transition token off the
   motion scale, and a JavaScript duration hard-coded to match a CSS token. Fixed in the same PR
   as this report.
2. **Truthful live status (spec P0)**: on the deployment page, the header badge changes only when
   a run ends. While a run is in progress the page shows no Queued → Building → Deploying
   progress, even though the server knows it. Fixed in Phase 03 (#244).

## What exists

| Area                 | Where                                                                                       | Notes                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Tokens               | `apps/web/public/css/tokens.css` (`--motion-fast/normal/slow`, `--ease-*`)                  | Same values as spec §4 (120/220/280 ms, standard and emphasis easing)                                   |
| Reduced motion (CSS) | `tokens.css` global rule; local rules in `admin-shell.css`, `legal.css`, `learning-hub.css` | Global rule shortens every animation and transition, and stops infinite loops after one run             |
| Reduced motion (JS)  | `app.js` (scroll-to-top, `removeWithMotion`, settings scroll)                               | Each checks `matchMedia('(prefers-reduced-motion: reduce)')`                                            |
| Press feedback       | `components.css` motion section (`.button`, theme/menu/password toggles)                    | MOT-02 scale 0.97 on `:active`                                                                          |
| Validation           | `partials/form-field.ejs`, `.form-input--error` error ring, `.form-error` rise              | MOT-04: `aria-invalid`, `aria-describedby`, `role="alert"`; one ring, no repeated shake                 |
| Lists                | `initDeploymentListPolling`, `initDashboardPolling`, `removeWithMotion`                     | MOT-06: stable rows by deployment id, focus kept, `motion-updated` highlight, `aria-live` announcements |
| Deployment status    | `partials/status-badge.ejs`, `.status-badge` colour transition, pulse on active             | Badge text always comes from server state (`statusPresentation`)                                        |
| Disclosures, modals  | `<details>` rise-in; confirm and page modals fade/pop                                       | Native semantics; focus handled by existing modal code                                                  |
| Browser tests        | `tests/browser/ui-ux.spec.js` (axe in every spec, reduced-motion suite)                     | Three visual baselines (landing, dashboard, deployment failure) come from the CI runner                 |

## Gaps and decisions

| Spec item                                          | Decision                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate reduced-motion rule                      | Fixed: one global rule in `tokens.css`, which now also sets `scroll-behavior: auto`                                                                                                   |
| `--transition-fast` (150 ms ease)                  | Fixed: now `var(--motion-fast) var(--ease-standard)`, so the 32 hover and focus transitions use the motion scale. Unused `--transition-normal` removed                                |
| `LEAVE_MS = 220` in `app.js`                       | Fixed: read from `--motion-normal`, with 220 ms as fallback                                                                                                                           |
| Live status on the deployment page (P0)            | Done in #244: the log stream sends a `progress` event on each non-terminal status change; the page updates the badge and announces it. Success still shows only on the terminal event |
| MOT-01 switch, MOT-03 menu, MOT-05 tabs            | Not built. HelloDeploy has no switches, custom menus or tabs, and adding widgets only to animate them is out of scope                                                                 |
| Spec §4: avoid a universal reduced-motion selector | Kept on purpose. It is the safe default, it is already tested, and functional indicators (spinners, pulse) still show their state in text                                             |
| Feature flag (spec §9)                             | Not used. Each change is small and additive; reverting the PR is the rollback                                                                                                         |
| Shared package (spec §6)                           | Not created. Plain CSS and JS through `npm run assets:build`, as the spec allows                                                                                                      |

## Risks

- Hover transitions are now 120 ms with the standard curve instead of 150 ms `ease`. The change is
  too small to show in screenshots, but the CI visual baselines are the check.
- A red main CI stops autodeploy. Baselines must be regenerated on the CI runner, never locally.

## Next

Phase 03 shipped in #244: the worker publishes `progress` on non-terminal transitions,
`sseDeploymentLogs` forwards it through `createProgressSender` (skips repeats and terminal
statuses), and `initDeploymentLiveLogs` updates the badge and the live indicator. Nothing else is
planned for HelloDeploy. Reopen only for a new UI pattern (tabs, menus, switches) that the product
actually needs.
