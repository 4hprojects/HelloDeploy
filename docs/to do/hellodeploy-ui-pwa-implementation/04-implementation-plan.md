# 04 - Implementation Plan

## Objective

Provide a safe, incremental implementation sequence for Codex.

Do not implement everything in one uncontrolled refactor.

---

# Phase 0 - Repository Audit

Before changing code, inspect:

- frontend framework
- routing system
- CSS framework
- existing layout components
- existing navbar components
- authentication state provider
- dashboard shell
- service worker presence
- manifest presence
- public assets
- icon set
- build tooling
- deployment platform
- environment configuration
- tests
- linting
- formatting

Create a short internal map before editing.

Search for:

```text
Navbar
Header
Layout
Shell
Sidebar
Footer
manifest
serviceWorker
beforeinstallprompt
registerSW
workbox
vite-plugin-pwa
next-pwa
PWA
```

Do not add duplicate functionality if equivalents already exist.

---

# Phase 1 - Design Tokens and Layout Foundation

## Tasks

- [ ] Create or consolidate design tokens.
- [ ] Create shared PageContainer.
- [ ] Create responsive spacing utilities.
- [ ] Create responsive grid utilities.
- [ ] Establish breakpoint strategy.
- [ ] Establish touch target sizing.
- [ ] Ensure global box sizing and overflow rules are sane.

Suggested global rule:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  max-width: 100%;
}
```

Avoid globally hiding horizontal overflow unless necessary.

Do not use:

```css
body {
  overflow-x: hidden;
}
```

as a substitute for fixing overflowing components.

---

# Phase 2 - Shared Navbar

## Tasks

- [ ] Identify current navigation components.
- [ ] Create one navigation config.
- [ ] Create shared Navbar.
- [ ] Create desktop nav.
- [ ] Create mobile menu.
- [ ] Add active route state.
- [ ] Add auth-aware navigation.
- [ ] Add install action slot.
- [ ] Add account action slot.
- [ ] Add sticky behavior if compatible.
- [ ] Move Status to footer/secondary navigation.
- [ ] Verify anchors to homepage sections.

Do not change URLs unnecessarily.

---

# Phase 3 - Shared Footer

## Tasks

- [ ] Create shared footer.
- [ ] Add Product links.
- [ ] Add Docs.
- [ ] Add Supported Apps.
- [ ] Add Status.
- [ ] Add Service Limits.
- [ ] Add Privacy.
- [ ] Add Terms.
- [ ] Add Acceptable Use if already present.

Do not invent legal routes that do not exist.

If a route is planned but absent, leave it out or create only if requested elsewhere in the repository.

---

# Phase 4 - Public Page Responsiveness

Audit and fix:

- [ ] homepage
- [ ] product section
- [ ] how-it-works section
- [ ] supported apps
- [ ] docs
- [ ] status
- [ ] service limits
- [ ] sign in
- [ ] registration
- [ ] password reset
- [ ] verification pages
- [ ] footer

For each page test:

```text
320
360
375
390
430
768
1024
1280
1440
1920
```

---

# Phase 5 - Dashboard Responsiveness

Audit:

- [ ] dashboard home
- [ ] project list
- [ ] project details
- [ ] deployments
- [ ] deployment details
- [ ] logs
- [ ] domains
- [ ] environment variables
- [ ] project settings
- [ ] account settings
- [ ] billing if present
- [ ] service/resource allocation pages if present

---

# Phase 6 - Responsive Data Components

Create reusable patterns for:

```text
ResponsiveTable
MobileDataCard
StatusBadge
OverflowActionMenu
```

Rules:

- table remains table on large screens
- selected tables become cards on small screens
- technical tables may use controlled horizontal scroll
- actions remain accessible
- no hidden critical information

---

# Phase 7 - PWA Manifest

## Tasks

- [ ] Add manifest.
- [ ] Add icons.
- [ ] Add maskable icon.
- [ ] Add apple touch icon.
- [ ] Add manifest link.
- [ ] Add theme color.
- [ ] Validate generated HTML.
- [ ] Confirm production paths work.

---

# Phase 8 - Service Worker

Choose implementation based on framework.

## If Vite

Consider existing:

```text
vite-plugin-pwa
```

only if adding dependencies is acceptable.

## If Next.js

Inspect current Next.js version and architecture before selecting a PWA approach.

## If custom/static

Implement a minimal explicit service worker.

Do not add a major dependency without checking package architecture first.

---

# Phase 9 - PWA Install Hook

Implement:

```text
usePWAInstall
```

Responsibilities:

- detect standalone mode
- capture install prompt
- expose installable state
- expose install action
- detect iOS
- respond to `appinstalled`

Keep browser event logic out of Navbar.

---

# Phase 10 - Install UI

Implement:

- [ ] Navbar install button.
- [ ] Account/settings install option.
- [ ] iOS instructions modal.
- [ ] Optional dashboard promotion.
- [ ] Dismissed promotion persistence.
- [ ] Already-installed hiding.

---

# Phase 11 - Offline UI

Implement:

- [ ] offline route
- [ ] online/offline hook
- [ ] offline banner
- [ ] retry control
- [ ] documentation fallback where cached
- [ ] avoid stale deployment claims

---

# Phase 12 - Update Handling

Implement:

- [ ] waiting service worker detection
- [ ] update available prompt
- [ ] Update Now
- [ ] Later
- [ ] safe reload behavior

---

# Phase 13 - Testing

Run:

- type checking
- linting
- unit tests
- integration tests
- production build
- browser testing
- mobile viewport testing
- installed-PWA testing
- offline testing

Fix regressions before closing the initiative.

---

# Recommended Commit Sequence

Prefer small commits.

Example:

```text
feat(ui): add shared layout tokens and page container
feat(nav): unify desktop and mobile navigation
feat(ui): make public pages responsive
feat(ui): improve dashboard responsive layouts
feat(pwa): add web app manifest and icons
feat(pwa): add service worker and offline fallback
feat(pwa): add install flow and iOS guidance
feat(pwa): add update notification
test(ui): add responsive and pwa coverage
```

---

# Codex Implementation Rules

Codex should:

1. Inspect before changing.
2. Reuse existing components where practical.
3. Avoid replacing the entire frontend unless necessary.
4. Avoid introducing a second styling system.
5. Avoid changing backend APIs unless required.
6. Avoid changing route paths unnecessarily.
7. Preserve authentication behavior.
8. Preserve deployment behavior.
9. Keep TypeScript types strict if TypeScript is used.
10. Keep build and lint clean.
11. Update documentation after architecture changes.
12. Report files changed after each phase.

---

# Per-Phase Completion Report

After each phase, Codex should report:

```text
Phase:
Completed:
Files changed:
Behavior changed:
Tests run:
Known issues:
Next phase:
```

Do not continue blindly after a failing build.

Fix or document the failure.

---

# Rollback Safety

Before major layout refactors:

- retain previous component until migration is complete
- migrate page-by-page
- remove old component only after all references are gone

For PWA:

- version cache names
- do not reuse an old service worker cache blindly
- confirm service worker unregister/re-register behavior during development

---

# Final Deliverables

The implementation should produce:

- shared navbar
- shared mobile menu
- shared footer
- shared page container
- responsive public pages
- responsive dashboard
- responsive data patterns
- PWA manifest
- icons
- service worker
- install hook
- install button
- iOS install instructions
- offline page
- offline indicator
- update prompt
- test results
- updated project documentation
