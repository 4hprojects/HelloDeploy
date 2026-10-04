# 03 - PWA and Installation

## Objective

Make HelloDeploy installable as a Progressive Web App while preserving correct online behavior for deployment management.

---

# 1. PWA Scope

Implement:

- Web App Manifest
- PWA icons
- maskable icon
- theme color
- service worker
- install detection
- custom Install App button where supported
- iOS installation guide
- standalone detection
- offline fallback
- update notification
- app-installed detection

---

# 2. Manifest

Create:

```text
/public/manifest.webmanifest
```

or the equivalent location for the current framework.

Suggested manifest:

```json
{
  "id": "/",
  "name": "HelloDeploy",
  "short_name": "HelloDeploy",
  "description": "Deploy and manage web applications from one dashboard.",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0f172a",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

Adjust colors to match the actual HelloDeploy brand.

---

# 3. Manifest Metadata

Ensure HTML includes:

```html
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#0f172a">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
```

For iOS, add appropriate web app metadata only if it does not conflict with the current framework.

---

# 4. Icons

Required minimum:

```text
192x192
512x512
512x512 maskable
apple-touch-icon
favicon sizes already used by site
```

Use the real HelloDeploy logo.

Do not ship generic placeholder icons.

---

# 5. Service Worker Strategy

The service worker must not make deployment data look current when it is stale.

Use strategy by asset class.

## Static Assets

Examples:

```text
CSS
JavaScript bundles
logo
icons
fonts
static images
```

Strategy:

```text
Cache First
```

with versioned caches.

## Public Documentation

Examples:

```text
/docs
supported-apps content
static help pages
```

Strategy:

```text
Stale While Revalidate
```

if safe for the current framework.

## Dashboard HTML

Preferred:

```text
Network First
```

or framework-appropriate navigation fallback.

## API Calls

Default:

```text
Network Only
```

especially:

```text
authentication
deployment status
project state
environment variables
server metrics
domains
logs
billing
account details
```

---

# 6. Sensitive Data

Never intentionally cache:

- access tokens
- refresh tokens
- cookies
- authentication responses
- environment variable values
- deployment secrets
- API keys
- private log data
- private project payloads
- account settings

If a framework service worker caches fetches broadly, explicitly exclude API routes.

---

# 7. Offline Page

Create a route or static fallback:

```text
/offline
```

Recommended content:

```text
HelloDeploy

You're offline.

Your deployment dashboard requires an internet connection.

[ Try Again ]

Previously viewed documentation may still be available.
```

Do not imply deployment operations can continue offline.

---

# 8. Online Status UI

Create:

```text
useOnlineStatus()
```

Possible UI:

```text
You are offline. Deployment data may be unavailable.
```

Use a subtle banner.

When connection returns:

```text
Connection restored.
```

Do not show stale status as current.

---

# 9. Install State

Create:

```text
usePWAInstall()
```

Suggested state:

```ts
type PWAInstallState = {
  isInstallable: boolean;
  isInstalled: boolean;
  isIOS: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  install: () => Promise<void>;
};
```

Actual typing may vary.

---

# 10. beforeinstallprompt

Where supported:

1. listen for `beforeinstallprompt`
2. call `preventDefault()`
3. save the event
4. set `isInstallable = true`
5. show Install button
6. trigger prompt only after explicit user action
7. inspect result
8. clear deferred prompt after use

Concept:

```js
let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  setInstallable(true);
});
```

Install action:

```js
async function installApp() {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const result = await deferredPrompt.userChoice;

  deferredPrompt = null;
  setInstallable(false);

  return result;
}
```

---

# 11. Installed Detection

Check standalone state.

Examples:

```js
window.matchMedia("(display-mode: standalone)").matches
```

and where appropriate:

```js
window.navigator.standalone
```

for iOS compatibility.

When installed:

- hide navbar install button
- hide dashboard install promotion
- retain installation help in Settings only if useful

---

# 12. appinstalled

Listen for:

```js
window.addEventListener("appinstalled", ...)
```

When fired:

- mark application installed
- hide install CTA
- optionally persist local UI state
- do not show repeated install banners

---

# 13. iOS Install Experience

Custom browser install prompt is not consistently available on iOS.

Detect iOS/iPadOS and non-standalone browser mode.

Show an instructional modal:

```text
Install HelloDeploy

1. Tap the Share button.
2. Choose Add to Home Screen.
3. Tap Add.
```

Do not claim the browser can open a custom install dialog if it cannot.

---

# 14. Install Button Placement

Use three possible locations.

## Navbar

Show only when appropriate.

Label:

```text
Install
```

or:

```text
Install App
```

## Account / Settings

Permanent discoverability:

```text
Install HelloDeploy
```

## Dashboard Promotion

Optional, dismissible:

```text
Install HelloDeploy

Open your deployment dashboard directly from your device.

[ Install App ] [ Not Now ]
```

Persist dismissal locally.

Do not repeatedly nag the user.

---

# 15. Install CTA Logic

Pseudo-code:

```text
if installed:
    hide install CTA

else if beforeinstallprompt available:
    show "Install App"

else if iOS:
    show "Install App"
    clicking opens iOS instructions

else:
    hide CTA
```

Do not show a dead Install button.

---

# 16. Start URL

Default:

```text
/
```

Alternative if product requirements prefer:

```text
/dashboard
```

Only use `/dashboard` if:

- authentication redirect is reliable
- unauthenticated users are sent safely to sign-in
- deep link does not produce confusing loops

Safer default for initial rollout:

```text
/
```

---

# 17. Standalone Navigation

When running as installed PWA:

- external links may still open browser when appropriate
- internal links remain inside app
- authentication redirects work
- deep links work after reload
- no browser-only UI assumptions

---

# 18. Service Worker Update Handling

When a new service worker is waiting, show:

```text
A new version of HelloDeploy is available.

[ Update Now ]
[ Later ]
```

Do not automatically reload while the user may be:

- editing project settings
- entering environment variables
- reviewing deployment logs
- configuring domains
- triggering a deployment

Update action should:

1. tell waiting service worker to activate if required
2. wait for controller change
3. reload safely

---

# 19. Cache Versioning

Use cache names such as:

```text
hellodeploy-static-v1
hellodeploy-docs-v1
```

On activation:

- remove outdated known caches
- preserve only current cache versions

Do not delete unrelated caches from other apps sharing origin unless impossible by architecture.

---

# 20. Logout and Cache Safety

On logout:

- session should clear normally
- private application state should reset
- sensitive client-side stores should be cleared as appropriate

Do not rely on service-worker cache for private content.

---

# 21. PWA Acceptance Criteria

- [ ] Manifest loads without errors.
- [ ] Manifest has name and short name.
- [ ] Manifest has 192px icon.
- [ ] Manifest has 512px icon.
- [ ] Maskable icon exists.
- [ ] Theme color configured.
- [ ] App launches in standalone mode when installed.
- [ ] HTTPS is used.
- [ ] Service worker registers successfully.
- [ ] Static assets cache correctly.
- [ ] Private API data is not cached as offline truth.
- [ ] Offline fallback works.
- [ ] Install button appears only where appropriate.
- [ ] Install button disappears after installation.
- [ ] iOS receives installation instructions.
- [ ] Dashboard promotion can be dismissed.
- [ ] Update prompt appears when a new version is waiting.
- [ ] Update does not unexpectedly destroy user work.
