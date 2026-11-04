# Hello Motion Design System

Version: 1.0 (proposed)  
Date: 2026-11-03  
Status: Implementation specification, pending repository audit  
Scope: HelloRun, HelloDeploy, HelloPera, HelloUniversity, HelloTasks, HelloEventHub

## 1. Purpose

Create a shared, accessible, lightweight motion language across the Hello ecosystem. Motion should clarify system state, establish spatial relationships, preserve continuity, and provide timely feedback. Do not add motion only for visual decoration.

This specification is an implementation target, not a claim that any project already supports these APIs or components. Inspect each repository before editing.

## 2. Non-negotiable design principles

1. **Meaning first:** each animation must communicate a real UI state change or relationship.
2. **Truthful status:** a successful animation requires a confirmed successful action; pending, queued, locally saved, synchronized, completed, and failed are distinct states.
3. **Continuity:** preserve stable element identity, scroll location, keyboard focus, and input values during updates.
4. **Accessibility:** respect `prefers-reduced-motion`; keep errors in text and use ARIA or native semantics as appropriate.
5. **Progressive enhancement:** without animation or unsupported browser APIs, the action still functions.
6. **Performance:** prioritize `transform` and `opacity`, avoid unnecessary reflows, and minimize animation on heavy pages.
7. **Brand independence:** shared behavior does not mandate identical colors, typography, or layout.
8. **Security:** animation code cannot bypass authorization, validation, idempotency, server checks, or CSRF protection.

## 3. Concept catalog

| ID | Pattern | Motion purpose | Recommended contexts | Avoid |
|---|---|---|---|---|
| MOT-01 | Toggle spring | Reinforce an on/off transition | Settings, filters | Oscillation that obscures true saved state |
| MOT-02 | Tap feedback | Confirm immediate input acknowledgment | Favorites, bookmarks, like | Indicating persistence when request failed |
| MOT-03 | Spatial-origin menu | Connect menu with its trigger | Context menu, quick actions | Animation that breaks focus or keyboard navigation |
| MOT-04 | Validation feedback | Make error state discoverable | Login, registration, upload | Shaking without an accessible message |
| MOT-05 | Moving tab indicator | Preserve selection continuity | Navigation tabs, filters | Sliding to unloaded or inaccessible content |
| MOT-06 | Stable list reflow | Preserve item tracking during changes | Task lists, deployment rows, notifications | Reordering without stable IDs or focus preservation |

## 4. Motion tokens (initial targets, not measured from reference video)

| Token | Value | Usage |
|---|---:|---|
| `--hello-motion-instant` | 0ms | Reduced-motion or disabled |
| `--hello-motion-fast` | 120ms | Button press |
| `--hello-motion-normal` | 220ms | Tabs, feedback, menus |
| `--hello-motion-slow` | 280ms | Panels, list reflow |
| `--hello-ease-standard` | cubic-bezier(0.2, 0, 0, 1) | General UI |
| `--hello-ease-emphasis` | cubic-bezier(0.34, 1.25, 0.64, 1) | Restrained spring-like feedback |

Suggested per-pattern ranges: tap 100–180ms, toggle 200–280ms, menu 160–220ms, error 180–260ms, tab 180–260ms, list reflow 180–280ms. Tune after measurement and usability tests. Avoid repeated shakes, large overshoot, and ambient motion.

### Baseline CSS

```css
:root {
  --hello-motion-fast: 120ms;
  --hello-motion-normal: 220ms;
  --hello-motion-slow: 280ms;
  --hello-ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --hello-ease-emphasis: cubic-bezier(0.34, 1.25, 0.64, 1);
}

.hello-pressable {
  transition: transform var(--hello-motion-fast) var(--hello-ease-standard);
}
.hello-pressable:active:not(:disabled) { transform: scale(0.97); }

@media (prefers-reduced-motion: reduce) {
  .hello-pressable { transition: none; }
  .hello-pressable:active:not(:disabled) { transform: none; }
}
```

Do not globally override all animations with a universal selector; target the hello-motion components and explicitly handle JavaScript animations, view transitions, focus, and functional progress indicators.

## 5. Component contracts

### MOT-01 Toggle

- **Inputs:** `checked`, `disabled`, optional `pending`, `onChange`.
- **State machine:** `off -> requesting-on -> on`, or `on -> requesting-off -> off`; failed requests restore the authoritative state and show a message.
- **Semantics:** use a native checkbox or accessible switch with keyboard and label support.
- **Motion:** thumb translates between endpoints; minor squash or overshoot optional, never detach visually.
- **Reduced motion:** immediate state update.
- **Acceptance:** rapid clicking cannot create duplicate or contradictory updates; accessible label/state match server truth.

### MOT-02 Tap / Favorite

- **Inputs:** `active`, `pending`, `disabled`, `onToggle`.
- **Motion:** brief scale feedback (e.g. 0.94 -> 1.08 -> 1) on an acknowledged press; persistent active appearance reflects authoritative state.
- **Semantics:** button with `aria-pressed` when acting as a toggle.
- **Acceptance:** rollback or error if save fails, no repeated submission while pending, no false success animation.

### MOT-03 Context Menu

- **Inputs:** `trigger`, `items`, `open`, `onClose`.
- **Motion:** short opacity and scale/translation anchored to trigger; gracefully reposition near viewport edges.
- **Semantics:** use native/popover or rigorously accessible menu patterns as appropriate to contents, supporting Escape, outside click, and focus return. Do not apply `role=menu` to a list of ordinary navigation links without implementing its keyboard model.
- **Acceptance:** keyboard-only operation works, focus is not lost, menu isn't clipped on mobile.

### MOT-04 Validation

- **Inputs:** `fieldId`, `errorMessage`, `status`.
- **Motion:** one small shake (optional) only when a fresh invalid submission is received; error border and text persist without motion.
- **Semantics:** `aria-invalid`, `aria-describedby`, inline message, appropriate live-region/status messaging. Move focus to first invalid field or error summary when needed.
- **Acceptance:** password remains masked; repeated failures do not create animation loops or clear user input.

### MOT-05 Tab Continuity

- **Inputs:** stable tab IDs, `activeId`, `onSelect`.
- **Motion:** indicator slides from previous tab to next; content change independent of indicator position.
- **Semantics:** native links for page navigation or complete tablist keyboard/focus behavior for application tabs.
- **Acceptance:** selection persists on reload when URL-driven, active state works without animation, overflow works on narrow screens.

### MOT-06 Stable List Reflow

- **Inputs:** items with unique immutable IDs; operation types `insert`, `remove`, `reorder`, `filter`, `refresh`.
- **Motion:** use FLIP or supported view transition for *visual* movement only. Capture first/last item geometry around a committed DOM update; animate translation back to zero; cleanup on cancel/interrupt.
- **Data safety:** removal must respect backend outcomes. For destructive actions, prefer undo where possible and confirmation where warranted. Do not detach the focused node without selecting an appropriate focus destination.
- **Acceptance:** focus and scroll remain coherent, remaining rows do not jump at end, rapidly repeated operations settle without ghost elements, reduced-motion is immediate.

## 6. Proposed package architecture

Adopt the lightest arrangement compatible with audited repositories. A versioned internal npm package is recommended only if shared maintenance and release workflows are viable. Otherwise create a source-controlled shared module template with clear version tracking. Do not introduce a monorepo as a prerequisite.

```text
hello-motion/
  package.json                     # only if package distribution selected
  src/
    styles/
      tokens.css
      base.css
      components.css
    core/
      preferences.js               # reduced-motion detection and subscriptions
      animate.js                   # guarded WAAPI helper, cancel/cleanup
      transition.js                # optional view transition wrapper
      focus.js                     # focus restoration helpers
    components/
      toggle.js
      feedback.js
      menu.js
      validation.js
      tabs.js
      list-reflow.js
  tests/
    unit/
    browser/
  examples/
    express-ejs/
  docs/
    accessibility.md
    integration.md
    changelog.md
```

**Contract example:**

```js
// Desired interface, not a completed implementation.
import { animateStateChange, prefersReducedMotion } from '@hello/motion';

await animateStateChange({
  root: document.querySelector('[data-hello-list]'),
  update: () => renderItems(nextItems),
  kind: 'list-reflow',
});
```

Requirements for the actual implementation: perform the update even if unsupported, honor async update and failure semantics, prevent concurrent animations from corrupting state, avoid forced-layout loops, resolve only after cleanup, and handle no-motion mode. Do not publish this illustrative call as a working API until tested.

## 7. Application mapping and priority

### HelloRun — first pilot
- P0: registration and activity-proof validation: visible pending, submitted, rejected, approved states.
- P0: list and leaderboard updates with stable item identities; do not misrepresent ranking changes.
- P1: event tab/filter continuity and contextual event actions.
- P2: favorite/like feedback, only if corresponding functionality exists or is separately approved.
- Preserve event IDs, URLs, historical records, certificate and badge rules. No new event or OCR features as part of a motion rollout.

### HelloDeploy — first pilot
- P0: accurate state transitions for queued/building/deploying/healthy/failed/rolled-back states, based on authoritative backend events.
- P0: stable app/deployment lists and logs disclosure behavior.
- P1: trigger-anchored actions menu and tabs.
- P2: settings toggles with state verification and rollback.
- Never infer success from animation, deployment requests, or a client timeout. Do not change infrastructure, deployment guards, or feature flags during motion integration.

### HelloPera
- P0: receipt upload, OCR processing, and transaction validation states.
- P1: stable transaction list and period tab transitions.
- P2: restrained chart updates. Never animate a balance through misleading interim values.

### HelloUniversity
- P0: form and exercise validation.
- P1: lesson tabs, accordion and progress state.
- P2: instructional DSA animation with speed, pause, step and reduced-motion modes, separate from decorative motion.

### HelloTasks
- P0: task status update and list reflow.
- P1: contextual menus, clipboard feedback, QR generation status.
- P2: settings toggles.

### HelloEventHub
- P0: registration validation; saved-locally vs synced vs submitted distinctions.
- P1: multi-step form transitions and attendee lists.
- P2: QR validation feedback and event detail disclosure.

## 8. Accessibility and interaction requirements

- Respect `prefers-reduced-motion` in CSS *and* JavaScript; subscribe to changes where appropriate.
- Text/status change must remain meaningful without animation or color.
- Preserve WCAG-relevant keyboard access, focus indicators, focus order, semantics and announcement behavior.
- On route/page changes, set the correct focus/announcement behavior in the application, rather than assuming animation handles it.
- Support screen magnification, 200% zoom, narrow viewports, touch, mouse and keyboard.
- Do not turn a loading icon into the sole status indicator; provide explicit status text and assistive-technology announcements.
- Avoid autoplaying or looping nonessential movement.

Relevant WCAG 2.2 success criterion 2.3.3 is Level AAA. The project's choice to support reduced motion is a design requirement, not a claim that complying with this single criterion establishes full WCAG conformance.

## 9. Performance requirements

- No measurable regression to core interaction latency from motion; use performance marks and representative device tests.
- Aim for fluid motion on target low-end Android hardware; report dropped frames/jank and long tasks during animation. No unsupported blanket promise of 60 FPS.
- Prefer composited transforms/opacity where feasible, but test real behavior.
- Avoid animating `height`, `top`, `left`, or expensive shadows across large collections unless measured and justified.
- Virtualized lists, scrolling tables, large leaderboards, and rapidly updating logs should use reduced or zero motion if animation would cause instability.
- Provide a feature flag per application and a kill switch when an interaction causes regressions.

## 10. Test matrix and acceptance criteria

Test each component in Chromium, Firefox and Safari where available, plus Android touch/browser coverage. Record versions and environmental constraints.

**Unit tests**
- Correct state transitions and callback semantics.
- Failure, retry and cancellation paths.
- Prefers-reduced-motion and API-unavailable fallbacks.
- Idempotent initialization and teardown.

**Browser / E2E tests**
- Keyboard-only interaction and focus restoration.
- Reduced-motion behavior and screen reader status announcements (manual AT verification where feasible).
- Simulated slow networks, 4xx/5xx, timeout, duplicate clicks.
- Rapid tab selection and repeated list insert/delete/reorder.
- Responsive mobile viewport and zoom.
- Confirm no change to authorization, submission data, route paths, event records or deployment lifecycle.

**Release gates**
1. Existing tests pass or baseline failures are documented.
2. New component tests pass.
3. Accessibility checklist reviewed.
4. Performance compared with a pre-change baseline.
5. A feature-flag rollback path exists.
6. Project owner approval for live enabling/deployment where required; do not assume blanket approval to publish.

## 11. Phased delivery

### Phase 00 — Repository audit (no feature implementation)
- Inventory applications, CSS/JS layout, existing dependencies and component patterns.
- Document high-friction flows, existing motion, browser targets and baseline metrics.
- Determine integration model: internal npm package versus shared files.
- Produce `00_AUDIT_REPORT.md`, application matrix, change-risk register and recommended first pilot components.
- Gate: finalize initial scope; no code deployment in this phase.

### Phase 01 — Shared foundation
- Implement tokens, reduced-motion, guarded animation helpers, focus/cancellation utilities, demo harness, tests and docs.
- No application behavior changes yet.
- Gate: package tests and accessibility smoke test.

### Phase 02 — HelloRun pilot
- Add validation and stable list transitions to selected existing flows, preserving business logic.
- Gate: test failed submission, duplicate requests, slow network and mobile scrolling.

### Phase 03 — HelloDeploy pilot
- Add only authoritative state feedback, contextual menu transitions and safe list behavior.
- Gate: test pending/failed/rolled-back states and verify no deployment-control regression.

### Phase 04 — Cross-project adoption
- Roll out independently to HelloPera, HelloUniversity, HelloTasks, HelloEventHub based on individual audits.
- Gate: app-by-app tests and rollback signoff.

### Phase 05 — Evaluate and refine
- Measure usability and performance, review reduced-motion feedback, update tokens, publish migration guidance and changelog.

## 12. Change management and decision authority

- The implementation agent may choose between equivalent technical approaches based on codebase evidence and document rationale.
- Preserve existing architecture and public routes. Do not opportunistically refactor authentication, infrastructure, payment, OCR, event mechanics or deployment logic.
- Agent may execute tests, create branches, prepare PRs, and update implementation documentation.
- For any sensitive/destructive change, irreversible data operation, billing action, secret access change or production deployment, follow actual platform permissions and obtain explicit approval as needed. Do not interpret a design-system request as production deployment approval.
- On a blocked choice, choose the safest reversible option, document it, and continue only with non-blocked work.
- For each phase: list changed files, tests, baseline comparisons, unresolved issues, decisions, and recommended next step.

## 13. Source references

- W3C WCAG 2.2 Understanding 2.3.3 Animation from Interactions: https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions
- W3C Technique C39 (CSS reduced motion): https://www.w3.org/WAI/WCAG22/Techniques/css/C39
- W3C Technique SCR40 (JavaScript reduced motion): https://www.w3.org/WAI/WCAG21/Techniques/client-side-script/SCR40
- MDN View Transition API and usage: https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using

## 14. Definition of done

The motion system is complete only when reusable components exist, applications integrate them without business-logic changes, non-animated fallbacks work, states remain truthful, accessibility and browser tests pass, performance is acceptable on intended devices, and each pilot can be disabled or rolled back independently.
