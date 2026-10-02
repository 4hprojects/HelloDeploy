# Phase 7: Design System, Accessibility, and Responsive UX

## Objective

Turn existing CSS tokens and reusable patterns into an explicit product design system with measurable accessibility rules.

## Existing Foundation

Current design tokens include:

- brand and semantic colors
- status colors
- light/dark surfaces
- typography scale
- spacing scale
- radius
- shadows
- focus ring
- sidebar/header dimensions
- motion preferences

This is a strong starting point.

## Component Inventory

Create or document canonical components:

Navigation:
- header
- sidebar
- mobile drawer
- breadcrumbs

Actions:
- primary button
- secondary button
- ghost button
- danger button
- icon button
- button group

Feedback:
- alert
- flash
- status badge
- progress state
- empty state
- loading state
- skeleton only if needed

Forms:
- input
- textarea
- select
- checkbox
- radio
- field help
- field error
- form summary error

Data:
- table
- responsive table/card
- definition list
- stat card

Overlays:
- modal
- confirm dialog
- menu

Deployment:
- deployment status
- deployment timeline
- log viewer
- readiness finding

## Button Hierarchy

Each view should normally have one primary action.

Secondary actions use secondary/ghost styles.

Danger is reserved for destructive behavior.

Do not use color alone to distinguish destructive actions.

## Focus

WCAG-oriented requirements:

- visible focus for all interactive elements
- focused component must not be completely hidden by sticky UI
- focus indicator should be clearly distinguishable
- modal focus is trapped while open
- focus returns to triggering control after close

Recommended CSS:

- maintain a visible outline
- avoid removing browser outline without replacement
- verify dark and light contrast

## Target Size

Interactive controls should meet at least the WCAG 2.2 minimum target-size requirement or valid spacing exceptions.

Practical product target:

- 40 to 44px minimum height for main buttons and form controls on touch interfaces
- icon-only actions need adequate hit area even if the icon is small

## Contrast

Audit:

- muted text
- status badges
- disabled buttons
- links in dark mode
- orange selected navigation
- form-error borders
- warning backgrounds

Do not assume design-token naming means contrast compliance.

Measure actual combinations.

## Status Design

Every status must have:

- text label
- semantic color
- optional icon

Never:
green dot only
red border only
animated spinner without label

## Typography

Avoid too many 12px elements for operational information.

Recommended:

- base text 16px
- supporting text 14px
- 12px only for low-priority metadata

Critical error/help copy should not be 12px.

## Forms

Every field needs:

- visible label
- hint only when useful
- error linked with `aria-describedby`
- error text explaining resolution

Placeholder is not a label.

## Error Summary

For multi-field forms, consider a page-level summary:

"Please fix 3 fields."

Each item links to the field.

Keep inline field errors.

## Responsive Breakpoints

Design around content behavior rather than device names.

Recommended test widths:

- 320
- 360
- 390
- 768
- 1024
- 1280
- 1440

## Mobile Navigation

Verify:

- menu button has accessible name
- `aria-expanded`
- drawer is keyboard reachable
- backdrop closes drawer
- Escape closes drawer
- body scroll behavior is controlled
- focus returns to menu button

## Dense Tables

Decision rule:

If more than four meaningful columns remain on mobile, convert to cards or prioritize/hide secondary metadata.

Core tasks must not depend on horizontal scrolling.

## Modals

Requirements:

- labeled title
- described consequence
- Escape behavior
- Cancel
- confirm label names action
- loading/pending state
- no double-submit

Example:
"Archive Project"
not
"Confirm"

## Loading States

Use precise language:

"Checking DNS..."
"Starting deployment..."
"Loading deployments..."

Avoid generic "Please wait."

Disable repeated submit while action is pending.

## Empty States

Every empty state should explain:

- why it is empty
- what the user can do
- primary action

Differentiate:
- truly no data
- filtered zero results
- failed load

## Dark Mode

Audit every status and interaction state separately.

Dark mode must not be treated as automatic token inversion.

Check:
- success
- error
- warning
- pending
- code blocks
- log viewer
- focused fields
- disabled controls

## Motion

Existing reduced-motion handling should remain.

Avoid essential information delivered only by animation.

## Screen Reader and Keyboard Test Script

For each major page:

1. Tab from browser chrome into page.
2. Verify skip link.
3. Verify logical focus order.
4. Open/close navigation.
5. Submit empty form.
6. Read errors.
7. Open/close confirm dialog.
8. Trigger a status update.
9. Verify live-region behavior.
10. Confirm no keyboard trap.

## Accessibility Acceptance Criteria

- WCAG 2.2 AA is the target baseline.
- All primary workflows are keyboard operable.
- Focus is visible.
- Focus is not obscured by authored sticky elements.
- Pointer targets meet minimum size or spacing requirement.
- Text/status does not rely on color alone.
- Form errors are programmatically associated.
- Modal focus behavior is correct.
- Dark mode passes the same functional checks as light mode.
- Mobile core workflows do not require horizontal scrolling.
