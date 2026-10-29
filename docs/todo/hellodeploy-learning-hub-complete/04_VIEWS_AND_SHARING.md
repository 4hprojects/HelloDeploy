# Phase 3 — View Counters and Social Sharing

## View semantics
Display `N views` meaning approximate eligible article views, not unique visitors. First eligible page load counts; same article from same visitor within rolling/defined 30-minute dedup window does not. Different articles are independent; return after expiry may count. Exclude author previews, known crawlers/monitoring when identifiable. Anonymous dedup is approximate: avoid overclaiming bot or unique-user accuracy.

## Design
Prefer an idempotent view-recording endpoint triggered after actual article rendering and client hydration, with consent and privacy evaluated. For no-JS viewers decide documented fallback rather than silently implying coverage. Redis SET NX EX for best-effort dedup and per-article atomic MongoDB increment; audit race/error scenarios where key reservation succeeds but increment fails. Use non-PII ephemeral visitor cookie or equivalent with explicit privacy review; do not retain raw IPs as permanent view identity. Redis and DB failures must not block reading. Prevent endpoint abuse and forged article IDs; only published IDs eligible. Stable article ID persists across slug changes.

## Sharing
Under metadata and after content: Facebook, LinkedIn, X, Copy Link, and native Web Share when supported. Use canonical absolute article URL with correct encoding, secure external anchors (`noopener noreferrer`), accessible names, clipboard success/failure fallback, no forced tracking redirects. Optional desktop side rail if it does not compete with TOC. OS share success is not assumed from click.

## Analytics
Emit share-click and copy events with article ID, platform, no commenter identifiers. Ensure analytics disabled or gated according to consent policy. Never represent button clicks as successful posts.

## Acceptance
Concurrency and dedup tests; DB failure page continuity; bot exclusion best effort; URL encoding; copy fallback and Web Share feature detection; keyboard access; stats persistence after restart; bounds on cache usage.
