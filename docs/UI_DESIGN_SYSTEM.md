# HelloDeploy UI Design System

Updated: 2026-10-02

HelloDeploy uses server-rendered EJS, the tokens in `apps/web/public/css/tokens.css`,
and the canonical patterns in `components.css` and `layout.css`. New interfaces must
reuse these patterns before introducing a new component or client dependency.

## Canonical patterns

| Need                        | Pattern                                                             | Requirements                                                                                                |
| --------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Primary or secondary action | `.button` variants and `.button-group`                              | One dominant action per page; 44px target where practical; pending label on mutations.                      |
| Feedback                    | `.alert`, status badge, flash banner                                | Use `role=status` for informative updates and `role=alert` only for immediate interruption.                 |
| Form                        | `.form-group`, `.form-label`, `.form-input`, hints and field errors | Visible labels, explicit associations, autocomplete, and server validation remain mandatory.                |
| Data collection             | Responsive table or stacked card list                               | Use tables for tabular data; core actions must not require horizontal scrolling.                            |
| Destructive action          | Confirmation dialog and danger styling                              | Explain scope and recovery, preserve focus, and restore focus to the trigger.                               |
| Deployment progress         | Status badge, timeline, and polite live region                      | Use canonical contract labels; poll only non-terminal records and preserve focus.                           |
| Logs                        | `.log-viewer` controls                                              | Redacted server data only; follow-live is user-controlled and pauses after upward scrolling.                |
| Readiness                   | `.readiness-list` / approval findings                               | Label findings “Fix required”, “Recommendation”, or “Ready”; only required configuration blocks deployment. |

## Status contract

Templates use `getStatusPresentation(kind, value)` from `@hellodeploy/contracts`.
Raw database enums are diagnostic values, not primary user-facing copy. Each status
presentation includes a label, tone, contextual hint, and terminal flag.

## Accessibility and responsive behavior

- Maintain visible `:focus-visible` indicators and the skip link.
- Do not obscure focused controls beneath sticky UI.
- Keep heading levels and `header`, `nav`, `main`, and `footer` landmarks ordered.
- Announce polling changes through a polite live region; never move focus on refresh.
- Support light/dark themes and `prefers-reduced-motion`.
- Test at 320, 360, 390, 768, 1024, and 1440 CSS pixels and at 200% zoom.
- Avoid color-only status communication and keep text/background contrast compliant.

## Motion

Motion shows a real state change. It is never decoration.

- Use the tokens in `tokens.css`: `--motion-fast` (120ms) for presses,
  `--motion-normal` (220ms) for menus, disclosures and status changes,
  `--motion-slow` (280ms) for panels. Ease with `--ease-standard`, or with
  `--ease-emphasis` for the restrained overshoot on dialogs.
- Animate `opacity` and the individual `translate`/`scale` properties. They
  don't clobber a component's own `transform`.
- Enter keyframes (`motion-fade-in`, `motion-rise-in`, `motion-pop-in`) only
  declare `from`, so they end on the element's resting style. Snapshots taken
  with animations disabled therefore match the static design.
- The only looping motion is the dot pulse on `building`/`deploying` badges,
  which reflects an in-progress backend state. Log lines don't animate.
- The global `prefers-reduced-motion` rule makes all of it instant. JS that
  delays DOM changes for motion (dashboard row exit) checks the same media
  query and skips the delay. It also skips the delay when the row holds focus.

The browser fixture and snapshots are local deterministic QA evidence. They do not
replace supported-host, real-device, external DNS, crawler, or production checks.
