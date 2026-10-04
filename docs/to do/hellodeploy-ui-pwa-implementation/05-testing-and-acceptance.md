# 05 - Testing and Acceptance

## Objective

Define the QA matrix and completion criteria for responsive UI and PWA behavior.

---

# 1. Required Viewports

Test at minimum:

```text
320 × 568
360 × 800
375 × 812
390 × 844
430 × 932
768 × 1024
1024 × 768
1280 × 800
1440 × 900
1920 × 1080
```

Exact heights may vary.

Width behavior is the main concern.

---

# 2. Browser Matrix

Test where available:

```text
Chrome Android
Samsung Internet
Safari iPhone
Safari iPad
Chrome desktop
Edge desktop
Safari macOS
Firefox desktop
```

PWA install behavior differs by browser.

Do not mark install flow broken simply because a browser does not support a custom installation prompt.

The fallback behavior must be correct.

---

# 3. Navigation Tests

## Desktop

- [ ] Logo links correctly.
- [ ] Public links work.
- [ ] Active navigation is visible.
- [ ] Sign In works.
- [ ] Get Started works.
- [ ] Install appears only when applicable.
- [ ] Navbar stays one line.
- [ ] Navbar does not overlap page content.
- [ ] Sticky behavior works.

## Mobile

- [ ] Hamburger opens menu.
- [ ] Hamburger closes menu.
- [ ] Escape closes menu.
- [ ] Navigation closes after route change.
- [ ] Menu fits viewport height.
- [ ] Menu can scroll when needed.
- [ ] Background does not unexpectedly scroll.
- [ ] Focus remains usable.
- [ ] Buttons are touch-friendly.
- [ ] Install action works correctly.
- [ ] Auth actions are visible.

---

# 4. Public Page Tests

Test:

- [ ] homepage
- [ ] docs
- [ ] supported apps
- [ ] status
- [ ] service limits if present
- [ ] sign in
- [ ] create account
- [ ] password reset if present

For each:

- [ ] no page-level horizontal scroll
- [ ] headings wrap correctly
- [ ] buttons remain visible
- [ ] cards stack
- [ ] images fit
- [ ] forms fit
- [ ] footer fits
- [ ] navigation remains usable

---

# 5. Docs Tests

Desktop:

- [ ] sidebar works
- [ ] content remains readable
- [ ] anchor navigation works
- [ ] code blocks are readable

Mobile:

- [ ] sidebar replaced by mobile contents UI
- [ ] content uses full available width
- [ ] code blocks scroll inside container
- [ ] headings are not hidden by sticky navbar

---

# 6. Dashboard Tests

## Dashboard Home

- [ ] cards stack correctly
- [ ] charts fit if present
- [ ] metrics do not overflow
- [ ] loading states fit

## Projects

- [ ] desktop table/grid works
- [ ] mobile cards work
- [ ] primary action available
- [ ] secondary actions available
- [ ] long project names do not overflow

## Deployments

- [ ] status visible
- [ ] commit text truncates or wraps safely
- [ ] branch names fit
- [ ] timestamps fit
- [ ] actions remain usable

## Domains

- [ ] long domain names fit
- [ ] DNS records use controlled overflow
- [ ] status remains visible
- [ ] mobile actions are usable

## Environment Variables

- [ ] keys fit
- [ ] values remain masked
- [ ] edit works
- [ ] delete confirmation works
- [ ] no sensitive data appears in logs
- [ ] no page overflow

## Logs

- [ ] log container scrolls horizontally if needed
- [ ] page does not scroll horizontally
- [ ] long lines remain readable
- [ ] mobile log viewport is usable

---

# 7. PWA Manifest Tests

- [ ] `/manifest.webmanifest` loads.
- [ ] valid JSON.
- [ ] correct name.
- [ ] correct short name.
- [ ] correct start URL.
- [ ] correct scope.
- [ ] `display: standalone`.
- [ ] 192 icon works.
- [ ] 512 icon works.
- [ ] maskable icon works.
- [ ] theme color is correct.
- [ ] apple touch icon works.

---

# 8. Service Worker Tests

- [ ] registers in production.
- [ ] no registration errors.
- [ ] static assets cache.
- [ ] old caches clean correctly.
- [ ] API routes are not incorrectly cached.
- [ ] authentication remains functional.
- [ ] logout remains functional.
- [ ] deployment status refreshes from network.
- [ ] environment variables are not cached for offline reuse.
- [ ] logs are not treated as authoritative offline data.

---

# 9. Offline Tests

Steps:

1. Load application online.
2. Open dashboard.
3. Switch browser offline.
4. Navigate/reload where supported.

Expected:

- [ ] useful offline state appears.
- [ ] no false "Live" status is presented as current if data is unavailable.
- [ ] retry control exists.
- [ ] cached docs may remain readable.
- [ ] reconnect restores application behavior.

---

# 10. Install Tests - Chromium

When installable:

- [ ] Install button appears.
- [ ] Click opens installation prompt.
- [ ] Cancel leaves app usable.
- [ ] Accept installs app.
- [ ] `appinstalled` is handled.
- [ ] Install button disappears.
- [ ] Installed app opens standalone.
- [ ] Navigation works.
- [ ] Login works.
- [ ] Deep links work.
- [ ] Reload works.

---

# 11. Install Tests - iOS

On Safari iPhone/iPad:

- [ ] Install action opens instructions.
- [ ] Instructions mention Share.
- [ ] Instructions mention Add to Home Screen.
- [ ] Instructions can close.
- [ ] App added to home screen launches.
- [ ] Installed state avoids repeated install prompt.

---

# 12. Update Tests

1. Install/load version A.
2. Deploy version B with new service worker.
3. Return to application.

Expected:

- [ ] update is detected.
- [ ] user sees update prompt.
- [ ] Later dismisses safely.
- [ ] Update Now activates new version.
- [ ] app reloads safely.
- [ ] no endless reload loop.
- [ ] unsaved user work is not silently discarded where preventable.

---

# 13. Authentication Tests

Test:

- [ ] sign in
- [ ] sign out
- [ ] session persistence
- [ ] expired session
- [ ] redirect to intended page
- [ ] installed mode authentication
- [ ] offline behavior while session exists
- [ ] reconnect after session expiry

PWA must not bypass authentication.

---

# 14. Accessibility Tests

- [ ] keyboard can open navigation.
- [ ] keyboard can close navigation.
- [ ] focus indicator visible.
- [ ] mobile drawer items reachable.
- [ ] screen reader labels exist for icon buttons.
- [ ] color is not sole status indicator.
- [ ] form labels exist.
- [ ] errors are associated with fields.
- [ ] install modal is accessible.
- [ ] update prompt is accessible.

---

# 15. Performance Checks

Check production build for:

- unnecessary duplicated CSS
- excessive JavaScript added only for PWA
- huge icon assets
- repeated navigation components
- layout shifts
- oversized mobile hero assets

PWA functionality should not meaningfully degrade first-load performance.

---

# 16. Regression Tests

Confirm existing functionality still works:

- [ ] create project
- [ ] connect repository
- [ ] configure project
- [ ] trigger deploy
- [ ] view deployment
- [ ] view logs
- [ ] configure domain
- [ ] manage environment variables
- [ ] rollback if supported
- [ ] deploy hook if supported
- [ ] account authentication
- [ ] logout

Adjust this list to actual features present in the repository.

---

# 17. Final Acceptance Criteria

The initiative can be considered complete only when all critical criteria pass.

## Critical

- [ ] navbar is shared
- [ ] mobile navigation works
- [ ] no page-level horizontal scrolling at 320px
- [ ] dashboard core flows work on mobile
- [ ] authentication works
- [ ] deployment workflows work
- [ ] manifest is valid
- [ ] service worker works in production
- [ ] install flow works where supported
- [ ] iOS fallback works
- [ ] installed mode works
- [ ] private API data is not cached improperly

## High

- [ ] docs mobile navigation works
- [ ] project cards work on mobile
- [ ] deployment cards work on mobile
- [ ] domains work on mobile
- [ ] environment variable UI works on mobile
- [ ] offline fallback works
- [ ] update prompt works

## Medium

- [ ] dashboard install promotion
- [ ] polished reconnect messages
- [ ] optional PWA settings panel
- [ ] install analytics if analytics already exist

---

# 18. Final Codex Report

Codex should provide:

```text
Implementation summary

Files added:
Files modified:
Files removed:

Navigation changes:
Responsive changes:
PWA changes:

Tests run:
Build status:
Lint status:
Type-check status:

Manual QA completed:
Known limitations:
Recommended follow-up:
```
