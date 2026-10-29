# Learning Hub — Decision Records

Each entry: decision, alternatives, reason. Append new entries; do not rewrite old ones.

## D1 — Markdown and front matter libraries (2026-10-29)

`markdown-it` (`html:false`, `linkify:false`, restricted link protocols) and `yaml`.
Rejected `marked` (weaker safe-by-default story), `gray-matter` (pins `js-yaml` 3), and an HTML
sanitizer (unnecessary once raw HTML is disabled; fewer dependencies).

## D2 — Content loaded once at startup (2026-10-29)

Articles are read from `content/blog/articles/*.md`, validated, and held in memory. An invalid
article is excluded and logged rather than crashing the platform, because a content error must
never take down deployments. `npm run content:check` fails hard and runs in CI, so invalid
content cannot reach `main`.

## D3 — Flags: env for capability, database for emergency (2026-10-29)

Env flags turn capabilities on (`LEARNING_HUB_ENABLED`, `LEARNING_HUB_VIEWS_ENABLED`,
`LEARNING_HUB_COMMENTS_ENABLED`). A `PlatformSetting` switch lets an administrator stop comment
submissions instantly without a restart. Comments accept submissions only when every layer
allows it and Turnstile plus a moderation provider are configured.

## D4 — Turnstile strict verifier (2026-10-29)

The existing verifier returns `true` when no secret is configured and ignores hostname. Changing
it would alter sign-in. A separate strict verifier fails closed without a secret and checks
hostname and action; comments and reports use only that one.

## D5 — View deduplication keyed by session, not IP (2026-10-29)

The dedup key is an HMAC of the session id (secret: `SESSION_SECRET`), stored in Redis for 30
minutes. No raw IP is stored. Redis unavailable means the view is not counted, which can only
under-count. Readers without JavaScript are not counted.

## D6 — Moderation provider adapter, fail closed (2026-10-29)

Provider `none` is the default and always reports unavailable, so no comment can publish. An
`openai-moderation` adapter (free endpoint) is included but needs an API key and owner privacy
approval before use. A timeout or error never publishes.

## D7 — Comment rate limits reuse express-rate-limit (2026-10-29)

`commentBurstLimiter` (3 / 10 min) and `commentHourlyLimiter` (10 / h) use the existing Redis
store with `passOnStoreError: false`, so a Redis failure refuses submissions in production.
They key on the client address as every other limiter does; the key expires with the window.

## D8 — Rule screening before the provider (2026-10-29)

Deterministic checks (links, contact details, promotion pairs, character floods) run first, after
folding Cyrillic/Greek lookalikes and removing invisible characters. They protect provider quota
and catch what classifiers miss. Local addresses (`localhost`, `127.0.0.1`) and file names such
as `server.js` are allowed so error logs can be pasted. These rules are not a substitute for the
contextual provider and are not claimed to catch everything.

## D9 — Staff replies skip guest screening (2026-10-29)

Signed-in administrators reply without Turnstile or provider screening and carry a
"HelloDeploy team" badge. They are authenticated, audited platform operators.

## D10 — Phases 4 and 5 committed together (2026-10-29)

The comment route, its gate, and the protection pipeline are one unit: a Phase 4-only route
would have had no safe publish path. Both phases are recorded separately in the log.

## D11 — Comments readable independently of submissions (2026-10-29)

The discussion shows when the feature flag and article opt-in are on. The admin pause, a missing
Turnstile key, or a missing provider closes only submissions, so an emergency stop never hides
already published discussion. Reports stay open while submissions are paused.
