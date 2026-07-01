# UI/UX Improvement Backlog

Updated: 2026-07-01T23:44:58+08:00

This backlog tracks planned UI/UX improvements for HelloDeploy. The goal is to make the app more efficient, user-friendly, intuitive, consistent, and safer to operate without turning the product into a marketing-style interface.

## Purpose

- Improve routine user and administrator workflows.
- Reduce accidental destructive actions.
- Make technical states easier to understand.
- Improve mobile usability across project and admin pages.
- Keep interactive behavior accessible for keyboard, screen-reader, reduced-motion, and high-contrast users.

## Status Legend

- `Pending`: Not started.
- `In Progress`: Actively being worked on.
- `Done`: Implemented or validated, with evidence recorded.
- `Partial`: Some implementation or validation exists, but acceptance evidence is incomplete.
- `Blocked`: Requires external access, environment setup, or another prerequisite.
- `Deferred`: Intentionally out of current scope.

## Update Rules

- Update `Status`, `Acceptance Evidence`, and `Updated` whenever a backlog item changes.
- Add implementation notes or links to supporting commits, screenshots, tests, or reports where useful.
- Keep related documents aligned: [WORKLOG.md](../WORKLOG.md), [Documentation Index](README.md), and [Phase Task Tracker](PHASE_TASK_TRACKER.md).
- Do not mark browser-facing work `Done` without checking desktop and mobile behavior.

## Priority Roadmap

1. Custom confirmation modal.
2. Floating labels and form polish.
3. Helpful accessible tooltips.
4. Mobile sidebar and responsive tables.
5. Floating scroll-to-top button.
6. Deployment timeline clarity.
7. Guided empty states.
8. Theme and accessibility verification.

## Detailed Backlog

| ID    | Status  | Priority | Area                 | Improvement                                                          | Implementation Notes                                                                                                                                               | Acceptance Evidence                                                                                                                                                                     | Updated                   |
| ----- | ------- | -------- | -------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| UX-01 | Done    | P1       | Confirmation dialogs | Replace browser default confirmations with a custom modal dialog.    | Reuses existing `data-confirm` attributes for forms and links; modal traps focus, closes on Escape/backdrop/cancel, and restores focus.                            | Added shared confirmation modal, CSS, link/form handling, and `tests/ui/confirmation-modal.test.js`; verified with full checks.                                                         | 2026-07-01T20:38:24+08:00 |
| UX-02 | Done    | P1       | Mobile navigation    | Improve sidebar drawer behavior on mobile.                           | Added backdrop, Escape close, link close, focus trap, body scroll lock, inert main content, viewport sync, and clearer toggle state.                               | Added drawer markup/CSS/JS and `tests/ui/mobile-sidebar.test.js`; verified with full checks.                                                                                            | 2026-07-01T20:48:46+08:00 |
| UX-03 | Done    | P1       | Tooltips             | Add helpful accessible tooltips.                                     | Added shared `data-tooltip` behavior for mouse, keyboard focus, Escape close, scroll/resize repositioning, and status badge hints.                                 | Added tooltip CSS/JS, high-value control coverage, and `tests/ui/tooltips.test.js`; verified with focused/static checks.                                                                | 2026-07-01T22:58:46+08:00 |
| UX-04 | Done    | P1       | Forms                | Add floating labels for form controls.                               | Added scoped `form-field--floating` and `form-group--floating` patterns for text inputs, selects, textareas, password fields, hints, errors, and autofill.         | Applied to auth partials plus core project/admin forms and covered by `tests/ui/floating-labels.test.js`.                                                                               | 2026-07-01T23:08:24+08:00 |
| UX-05 | Done    | P2       | Navigation utility   | Add a floating scroll-to-top button.                                 | Added shared footer button that appears after scrolling, includes tooltip support, and uses instant scrolling when reduced motion is requested.                    | Added responsive CSS/JS behavior and `tests/ui/scroll-top.test.js`; verified with focused/static checks.                                                                                | 2026-07-01T23:19:41+08:00 |
| UX-06 | Done    | P2       | Responsive tables    | Improve admin and project tables on mobile.                          | Added shared responsive table wrappers and compact mobile row summaries using `data-label` values for admin and project operational tables.                        | Admin/project tables remain readable and actionable at mobile and desktop widths; covered by `tests/ui/responsive-tables.test.js`.                                                      | 2026-07-01T23:28:53+08:00 |
| UX-07 | Done    | P2       | Deployment clarity   | Add a clear deployment timeline and stage display.                   | Reworked deployment detail timeline to normalize status/event stages, show per-stage status, latest message, timestamps, and failed-stage context.                 | Users can identify the active or failed deployment stage without reading raw logs first; covered by `tests/ui/deployment-timeline.test.js`.                                             | 2026-07-01T23:33:20+08:00 |
| UX-08 | Done    | P2       | Empty states         | Upgrade empty states into guided next-step flows.                    | Added shared empty-state step/action patterns and guided paths for project creation, repository access, detection, secrets, domains, deployment, and admin queues. | Empty states show the next useful action without adding instructional clutter to normal screens; covered by `tests/ui/guided-empty-states.test.js`.                                     | 2026-07-01T23:38:16+08:00 |
| UX-09 | Done    | P2       | Destructive actions  | Standardize danger-zone and risky-action patterns.                   | Added per-action confirmation title, severity, accept label, pending copy, submitter disabling, and styled warning/success button variants.                        | Archive, suspend, delete, disconnect, rollback, queue, domain approval/rejection, and member actions use consistent safety patterns; covered by `tests/ui/destructive-actions.test.js`. | 2026-07-01T23:44:58+08:00 |
| UX-10 | Pending | P3       | Theme polish         | Verify and improve light/dark theme persistence.                     | Check public, auth, dashboard, project, and admin pages; improve toggle styling if needed.                                                                         | Theme survives reload and renders all core surfaces with readable contrast.                                                                                                             | 2026-07-01T20:30:11+08:00 |
| UX-11 | Pending | P3       | Icon consistency     | Replace symbolic navigation/action characters with consistent icons. | Prefer a single icon set for Dashboard, Projects, Deployments, Repository, Domains, Environment, Members, Audit Log, and Server.                                   | Icons are consistent, recognizable, and paired with accessible labels or text.                                                                                                          | 2026-07-01T20:30:11+08:00 |
| UX-12 | Pending | P3       | Efficiency           | Add loading and pending states for forms and action buttons.         | Prevent duplicate submissions and show clear state while a request is processing.                                                                                  | Risky and long-running actions cannot be accidentally submitted twice from normal UI use.                                                                                               | 2026-07-01T20:30:11+08:00 |
| UX-13 | Pending | P3       | Accessibility        | Run a focused accessibility pass after component updates.            | Verify keyboard flow, focus traps, ARIA labels, tooltip behavior, modal behavior, high contrast, and reduced motion.                                               | Accessibility findings are recorded and critical blockers are fixed before marking UI work complete.                                                                                    | 2026-07-01T20:30:11+08:00 |

## Implementation Notes

- Keep UI changes operational and task-focused. Avoid decorative layouts that slow repeated admin or project-owner workflows.
- Prefer shared components or partials for modal, tooltip, floating-label, and scroll-to-top behavior.
- Use clear state and action text. Avoid hidden behavior that depends only on color, icon shape, or hover.
- For confirmation dialogs, keep the dangerous action explicit and provide a safe cancel path by default.
- For floating labels, preserve browser autofill, existing validation, hints, error messages, and password visibility behavior.
- For tooltips, support keyboard focus and avoid using native `title` as the only help mechanism.
- For scroll-to-top, respect `prefers-reduced-motion` and avoid covering primary actions on small screens.

## Acceptance Criteria

- Each backlog item has acceptance evidence before it is marked `Done`.
- UI controls remain keyboard accessible.
- Text does not overlap, clip, or overflow at common mobile and desktop widths.
- Destructive actions use consistent confirmation behavior.
- Form and action submissions provide clear pending feedback where implementation touches request flow.
- Related docs and trackers are updated before each UI/UX implementation commit.
