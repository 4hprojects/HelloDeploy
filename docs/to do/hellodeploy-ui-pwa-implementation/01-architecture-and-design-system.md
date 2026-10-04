# 01 - Architecture and Design System

## Objective

Create a shared UI foundation for HelloDeploy before modifying individual pages.

The target is to reduce duplicated layout logic and make future responsive development easier.

---

# 1. Recommended Component Architecture

Adapt names to the current framework and project conventions.

```text
src/
├── components/
│   ├── layout/
│   │   ├── AppShell
│   │   ├── PublicShell
│   │   ├── AuthShell
│   │   ├── Navbar
│   │   ├── MobileNavigation
│   │   ├── Footer
│   │   ├── PageContainer
│   │   └── PageHeader
│   │
│   ├── navigation/
│   │   ├── NavLink
│   │   ├── UserMenu
│   │   ├── Breadcrumbs
│   │   └── navigationConfig
│   │
│   ├── responsive/
│   │   ├── ResponsiveGrid
│   │   ├── ResponsiveTable
│   │   ├── MobileDataCard
│   │   └── OverflowContainer
│   │
│   └── pwa/
│       ├── InstallAppButton
│       ├── InstallAppModal
│       ├── IOSInstallGuide
│       ├── OfflineBanner
│       └── UpdateAvailablePrompt
│
├── hooks/
│   ├── usePWAInstall
│   ├── useStandaloneMode
│   └── useOnlineStatus
│
├── config/
│   └── navigation
│
└── styles/
    ├── tokens
    ├── globals
    └── utilities
```

Do not force this exact structure if the codebase already has a clear equivalent.

The required architectural concepts are:

- shared shell
- shared navigation data
- shared responsive primitives
- isolated PWA logic
- shared design tokens

---

# 2. Design Tokens

Create centralized layout and spacing tokens.

Example:

```css
:root {
  --page-max-width: 1280px;
  --page-wide-max-width: 1440px;

  --page-padding-mobile: 16px;
  --page-padding-tablet: 24px;
  --page-padding-desktop: 32px;

  --nav-height-mobile: 60px;
  --nav-height-desktop: 64px;

  --content-gap-xs: 8px;
  --content-gap-sm: 12px;
  --content-gap-md: 16px;
  --content-gap-lg: 24px;
  --content-gap-xl: 32px;
  --content-gap-2xl: 48px;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;

  --touch-target-min: 44px;
}
```

If Tailwind is already used, place equivalents in Tailwind configuration or the existing token system.

---

# 3. Page Container

Create one shared container primitive.

Target behavior:

```css
.page-container {
  width: 100%;
  max-width: var(--page-max-width);
  margin-inline: auto;
  padding-inline: var(--page-padding-mobile);
}

@media (min-width: 768px) {
  .page-container {
    padding-inline: var(--page-padding-tablet);
  }
}

@media (min-width: 1200px) {
  .page-container {
    padding-inline: var(--page-padding-desktop);
  }
}
```

Pages that need wider data layouts may opt into a wide variant.

Example:

```text
<PageContainer variant="default">
<PageContainer variant="wide">
<PageContainer variant="narrow">
```

Suggested values:

```text
narrow    768px
default   1280px
wide      1440px
```

---

# 4. Responsive Grid

Avoid page-specific grid breakpoints where possible.

Preferred approach:

```css
.responsive-grid {
  display: grid;
  grid-template-columns:
    repeat(auto-fit, minmax(min(100%, 280px), 1fr));
  gap: 24px;
}
```

Use explicit grids only where content meaning requires them.

Examples:

```text
4 columns → 2 columns → 1 column
3 columns → 2 columns → 1 column
2 columns → 1 column
```

---

# 5. Typography

Text must remain readable without pinch zoom.

Minimum recommendations:

```text
Body text           16px
Small supporting    14px
Very small labels   avoid below 12px
Page title          responsive clamp
Section title       responsive clamp
```

Example:

```css
.page-title {
  font-size: clamp(1.75rem, 3vw, 2.5rem);
}
```

Do not rely on large desktop headings that wrap poorly on phones.

---

# 6. Spacing

Prefer responsive spacing.

Example:

```css
.section {
  padding-block: clamp(40px, 6vw, 80px);
}
```

Avoid large fixed vertical padding that creates excessive whitespace on phones.

---

# 7. Touch Interaction

All important interactive controls should have a minimum target size near 44px.

Apply to:

- navbar links on mobile
- menu buttons
- dropdown entries
- tab controls
- form buttons
- pagination
- deployment actions
- copy buttons
- icon-only actions

Example:

```css
.touch-target {
  min-height: 44px;
  min-width: 44px;
}
```

---

# 8. Forms

All forms should follow these rules:

- Inputs fill available width on mobile.
- Labels stay visible.
- Error messages do not cause horizontal overflow.
- Two-column forms collapse to one column on narrow screens.
- Submit buttons remain reachable without horizontal scrolling.
- Modals do not exceed viewport width.
- Long environment variable values wrap or scroll inside controlled containers.
- Password managers and mobile keyboards should not break layout.

Suggested input sizing:

```css
input,
select,
textarea,
button {
  min-height: 44px;
}
```

---

# 9. Modal Rules

Desktop:

```text
max-width based on content
centered
scroll body if content exceeds viewport
```

Mobile:

```text
width: calc(100% - 32px)
max-height: calc(100dvh - 32px)
overflow-y: auto
```

For complex workflows, consider full-screen mobile sheets rather than tiny modal dialogs.

---

# 10. Dense Data and Tables

Do not allow large dashboard tables to cause page-level horizontal scrolling.

Use one of these patterns:

## Pattern A: Controlled table overflow

For logs or technical tables where tabular structure is required:

```text
page
  └── table container
        └── horizontal scroll
```

The page itself must not scroll horizontally.

## Pattern B: Mobile card conversion

Use for project lists, deployment history, domain lists, and user-facing records.

Desktop:

```text
PROJECT     STATUS    DOMAIN              UPDATED    ACTION
HelloPera  Running   hellopera.online    2m         Manage
```

Mobile:

```text
┌─────────────────────────────────┐
│ HelloPera                 Live  │
│                                 │
│ hellopera.online                │
│ Production                      │
│ Updated 2 minutes ago           │
│                                 │
│ [ Manage Project ]              │
└─────────────────────────────────┘
```

---

# 11. Logs and Code Blocks

Logs, terminal output, and code are allowed to horizontally scroll inside a bounded container.

Example:

```css
.code-scroll {
  overflow-x: auto;
  max-width: 100%;
}
```

Do not wrap log lines if wrapping would reduce readability.

---

# 12. Accessibility Baseline

All responsive work should preserve accessibility.

Required:

- semantic `<nav>`
- `aria-label` for navigation regions
- hamburger button uses `aria-expanded`
- menu can be opened and closed by keyboard
- Escape closes mobile menu
- focus moves logically
- visible focus states
- color is not the only status indicator
- buttons use actual `<button>`
- links use actual `<a>`
- mobile drawer prevents background focus when open where practical

---

# 13. Shared Application Shell

Target conceptual API:

```text
<AppShell>
  <Navbar />
  <Main />
  <Footer />
</AppShell>
```

Possible variants:

```text
<PublicShell />
<AuthShell />
<DashboardShell />
```

These variants should still use shared tokens and shared brand behavior.

---

# 14. Authentication Pages

Authentication pages may use a simplified layout, but they must still feel part of HelloDeploy.

Keep consistent:

- logo
- typography
- spacing
- buttons
- footer/legal access
- mobile behavior
- PWA theme color

Do not create a completely separate visual system.

---

# 15. Loading and Empty States

Responsive loading UI is required for:

- project list
- deployment list
- dashboard widgets
- domains
- logs
- environment variables
- status information

Do not use fixed-width skeletons that overflow on mobile.

Empty states should fit small screens.

---

# 16. Error States

Error messages must:

- wrap cleanly
- avoid overflow
- provide a next action when possible
- not cover navigation
- remain readable on narrow screens

---

# 17. Architecture Acceptance Criteria

- [ ] Shared page container exists.
- [ ] Shared design tokens exist.
- [ ] Shared responsive grid exists.
- [ ] Shared shell exists.
- [ ] Public pages use shared shell.
- [ ] Dashboard pages use consistent shell behavior.
- [ ] Authentication uses shared design language.
- [ ] No page-level horizontal scrolling from 320px upward.
- [ ] Touch targets are usable.
- [ ] Forms collapse correctly.
- [ ] Modals fit viewport.
- [ ] Tables use controlled overflow or mobile cards.
