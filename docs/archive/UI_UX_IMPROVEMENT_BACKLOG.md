# UI/UX Improvement Backlog

Updated: 2026-08-14

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
- Keep related documents aligned: [WORKLOG.md](../WORKLOG.md), [Documentation Index](README.md), and [Phase Task Tracker](archive/PHASE_TASK_TRACKER.md) (archived, historical reference).
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

**UX-01 through UX-13 are all `Done`** (shipped 2026-07-01/02): custom
confirmation modal, mobile sidebar drawer, accessible tooltips, floating
form labels, floating scroll-to-top button, responsive admin/project
tables, deployment timeline clarity, guided empty states, standardized
destructive-action confirmations, light/dark theme persistence, consistent
icon system, and form/action pending states — each with dedicated
`tests/ui/*.test.js` coverage. UX-13's accessibility-pass findings are
folded in below rather than kept in a separate file. One item remains open:

| ID    | Status  | Priority | Area                  | Improvement                                                        | Implementation Notes                                                                                                                                                                                               | Acceptance Evidence                                                                                                                                                                          | Updated                   |
| ----- | ------- | -------- | --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| UX-14 | Partial | P1       | Repository connection | Allow an Owner to connect a public GitHub repository by HTTPS URL. | Public URL inspection, branch choice, source persistence, detection, exact-commit clone, mode enforcement, feedback, and focused tests are implemented; GitHub App remains required for private/automatic sources. | Real Docker-backed deployment, responsive assistive-technology QA, and live operator evidence remain blocked by the inactive worker plane; tracks with `docs/PUBLIC_GIT_REPOSITORY_SPEC.md`. | 2026-07-14T14:41:55+08:00 |

## UX-13 Evidence: Accessibility Pass Findings

Folded in from the former standalone `UI_UX_ACCESSIBILITY_PASS.md`
(2026-07-01), a focused accessibility pass completed after the UX-01
through UX-12 component updates.

**Scope:** keyboard flow for header controls, sidebar drawer, modal
dialog, tooltips, and form submissions; accessible names and ARIA state
for icon-only controls, status badges, pending forms, and confirmation
dialogs; focus visibility, focus restoration, reduced-motion behavior, and
light/dark theme support; static coverage for the updated shared UI
contracts.

| Area                   | Status   | Notes                                                                                                                                      |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Header controls        | Fixed    | Menu and theme icon buttons now explicitly use `type="button"` and keep accessible labels/state.                                           |
| Confirmation modal     | Verified | Dialog uses `role="dialog"`, `aria-modal`, labelled/described content, Escape/backdrop/cancel behavior, focus trap, and focus restoration. |
| Tooltips               | Verified | Shared tooltip popover uses `role="tooltip"`, keyboard focus support, Escape close, and dark-theme styling.                                |
| Mobile sidebar         | Verified | Drawer uses `aria-expanded`, viewport sync, focus trap, Escape/backdrop/link close, body scroll lock, and `inert` main content while open. |
| Pending forms          | Verified | Forms mark `aria-busy`, prevent duplicate submissions, disable submit buttons, and preserve action-specific pending labels.                |
| Status badges          | Fixed    | Badges now expose an accessible label that combines visible status text with tooltip context.                                              |
| Icon-only/visual icons | Fixed    | Shared SVG icons are decorative by default; icon-only controls keep text alternatives through `aria-label` or adjacent text.               |
| Reduced motion         | Verified | Global reduced-motion token and scroll-to-top reduced-motion behavior are present.                                                         |

**Verification:** `tests/ui/accessibility-pass.test.js`, plus existing
related coverage (confirmation modal, mobile sidebar, tooltips,
scroll-to-top, theme persistence, icon consistency, form pending states).

**Residual risk:** this pass is static and component-focused. A
browser-based assistive-technology pass should still be run during final
pilot validation — still open as of 2026-08-14, not superseded by
anything since.

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
