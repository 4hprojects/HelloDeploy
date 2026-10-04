# HelloDeploy Responsive UI + PWA Implementation Pack

## Purpose

This implementation pack defines the work required to improve `hellodeploy.online` so that:

- Navigation is simple and consistent.
- The UI works across mobile, tablet, laptop, desktop, and wide screens.
- Public pages, authentication pages, and the application dashboard feel like one product.
- HelloDeploy can be installed as a Progressive Web App (PWA).
- Install controls appear only when installation is supported and appropriate.
- Offline and update states are handled safely.
- The implementation can be completed incrementally without destabilizing existing deployment functionality.

This pack is written for Codex or another development agent working directly on the HelloDeploy codebase.

---

## Primary Goals

1. Create one shared navigation system.
2. Create one responsive page-shell system.
3. Remove page-specific layout inconsistencies.
4. Make all primary application flows usable from 320px width upward.
5. Add PWA manifest, icons, service worker, install handling, and update handling.
6. Avoid caching sensitive or frequently changing deployment data.
7. Add a predictable mobile representation for tables and dense dashboard data.
8. Provide acceptance criteria and a QA checklist.

---

## Documents

Read and implement the documents in this order:

1. `01-architecture-and-design-system.md`
2. `02-navbar-and-responsive-layout.md`
3. `03-pwa-and-installation.md`
4. `04-implementation-plan.md`
5. `05-testing-and-acceptance.md`

---

## Implementation Principle

Do not treat this as a collection of isolated CSS fixes.

The desired architecture is:

```text
Shared Design Tokens
        ↓
Responsive Application Shell
        ↓
Unified Navigation
        ↓
Responsive Public Pages
        ↓
Responsive Authentication
        ↓
Responsive Dashboard
        ↓
PWA Foundation
        ↓
Install Experience
        ↓
Offline / Update Experience
        ↓
Cross-device QA
```

---

## Important Constraints

- Preserve existing application behavior.
- Do not break authentication.
- Do not break deployment workflows.
- Do not expose secrets or environment variables in cached assets.
- Do not cache authentication responses.
- Do not cache deployment status as authoritative data.
- Do not force installation prompts automatically on page load.
- Do not display an install button when the application is already installed.
- Do not duplicate navigation configuration across pages.
- Do not maintain separate desktop and mobile navigation data sources.
- Do not rely on viewport width alone for PWA install detection.
- Do not force desktop navigation to wrap on smaller screens.

---

## Navigation Target

### Public Desktop

```text
HelloDeploy   Product   How It Works   Docs   Supported Apps

                             Install   Sign In   [ Get Started ]
```

### Authenticated Desktop

```text
HelloDeploy   Dashboard   Projects   Docs

                             Install   Notifications   Account
```

### Mobile

```text
HelloDeploy                                      ☰
```

Public mobile menu:

```text
Product
How It Works
Supported Apps
Docs
────────────────────
Install HelloDeploy
Sign In
Get Started
```

Authenticated mobile menu:

```text
Dashboard
Projects
Docs
────────────────────
Install HelloDeploy
Account
Sign Out
```

---

## Breakpoints

Use responsive behavior, not device-specific assumptions.

Suggested baseline:

```text
Small mobile     320–479px
Mobile           480–767px
Tablet           768–1023px
Desktop          1024–1439px
Wide desktop     1440px+
```

These breakpoints may be adapted to the project’s existing CSS framework if needed.

The acceptance requirement is more important than exact breakpoint values.

---

## Definition of Done

This initiative is complete when:

- The same navigation source drives desktop and mobile.
- Public and authenticated areas share a consistent shell.
- Main pages work without horizontal page scrolling at 320px width.
- PWA installation works where supported.
- iOS receives appropriate Add to Home Screen guidance.
- Installed mode launches cleanly.
- Offline mode shows useful fallback UI.
- Application updates are handled safely.
- Responsive QA passes on the defined viewport matrix.
- Existing deployment features still work.
