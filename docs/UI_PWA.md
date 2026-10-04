# Responsive UI and PWA operation

HelloDeploy keeps its Express/EJS interface and shared CSS tokens. Public and
application navigation use one server-side configuration, with the same items in
the desktop header and mobile drawer. Project/admin navigation retains its existing
permission checks. Below 1024px the drawer replaces desktop links. Documentation
has a collapsible topic menu, and small-screen tables keep their actions reachable.

## Build and delivery

Run `npm run assets:build`, `npm run assets:verify`, and `npm run assets:budget`
before starting a production release. The build emits hashed CSS, application JS,
PWA JS, and a generated worker containing a content-derived cache version. Deploy
the complete build together with the public assets; do not hand-edit the generated
worker. Production refuses incomplete asset manifests.

`/site.webmanifest` remains the manifest URL. `/sw.js` serves the generated worker
with revalidation headers and root scope. `/offline` and `/offline.html` serve the
anonymous offline page. The maskable SVG embeds the existing HelloDeploy artwork
within the central safe area on an opaque navy background; existing PNG icons and
the Apple touch icon remain available.

Registration is enabled on HTTPS and localhost. Local browser testing requires an
asset build; a missing worker does not prevent ordinary online application use.
There are no new environment variables or runtime dependencies.

## Cache and session safety

Only the generated explicit static-asset list is cached: hashed UI code, the
manifest, brand/icons, and the self-contained offline page and its CSS/JS. Cache
names start with `hellodeploy-static-`. Activation removes only older caches owned
by this worker. Redirected precache responses fail installation.

Rendered pages—including documentation—are never cached: their shared EJS shell
can contain user state and CSRF tokens. APIs, authentication, deployment state,
environment values, logs/SSE, mutations, cross-origin requests, and query variants
are not added to Cache Storage. Successful document navigation always uses the
network. A failed GET navigation uses only the anonymous offline fallback, retaining
the requested URL so Retry can return to it after reconnection. Logout continues
to use the existing session and CSRF flow.

Offline banners warn that visible deployment information may be outdated. Offline
deployment management and cached documentation are deliberately unsupported.

## Installation and updates

Install appears only after a browser install event or in non-standalone iOS Safari.
Native prompts require a click and are discarded after use. iOS Safari receives
Share → Add to Home Screen instructions. Installed/standalone mode hides Install.
Authenticated users can always open installation help from the navigation utility
area; no new account route or promotional banner is introduced.

A waiting worker displays Update Now and Later. No automatic reload occurs.
Updating after a form edit requires confirmation. Another tab activating an update
does not discard work in this tab; refresh still requires consent. Later dismisses
the current page's notice, and a subsequent page may offer the waiting update again.

For local development, use the browser's Application panel to unregister the
HelloDeploy worker and remove its `hellodeploy-static-` caches when testing a clean
installation. Do not clear unrelated origin storage. A rollback must include a
complete asset build: the worker content changes with the rolled-back assets and
uses the same waiting/consent lifecycle.

## Acceptance evidence

The browser suite exercises all ten widths from 320 through 1920px, public/auth
pages and authenticated project workflows, drawer keyboard behavior, installation
state, offline fallback/reconnect, cache exclusions, logout, and worker updates.
Service-worker unit tests verify allowlisting, mutation/private-request bypass,
anonymous navigation fallback, cache cleanup, and explicit activation.

These are local fixture and automated browser checks. Real iPhone/iPad Add to Home
Screen, Android/desktop installation and standalone deep links, production HTTPS
and proxy delivery, and supported-host deployment acceptance remain external gates.
See the implementation tracker and worklog for exact commands and outcomes. This
work does not change the platform's production readiness decision.
