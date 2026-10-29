# Testing, Security and Acceptance Matrix

## Required automated tests
**Content**: duplicate slug/id, invalid metadata/dates, unsanitized HTML, draft exposure, duplicate heading anchors, reserved routes, broken references.
**UI**: 320–1440px responsive and zoom, long code, images, keyboard/focus, form error announcements, no-JS reading, accessible copy controls.
**Views**: 30-minute duplicate, distinct articles, expiry, concurrent Mongo increments, Redis interruption, bot best-effort, stable ID on slug rename, retry/double count behavior.
**Sharing**: proper URL encoding and canonical link, Facebook/LinkedIn/X endpoints, clipboard fallback, unsupported Web Share handling, analytics click labeling.
**Comments**: guest submit and reply, one visual level, replyTo child mapping, article isolation, parent missing/hidden, pagination, malicious text escaping, oversized bodies, submit idempotency, invalid CSRF/origin.
**Protection**: missing, replayed, expired and wrong-host/action Turnstile token, rate-limit enforcement and Redis failure, duplicate/obfuscated spam, legitimate criticism, harassment, English/Filipino examples, moderation timeout fail-closed, privacy/PII redaction, reporting manipulation, restored comments, admin authorization, global/per-article flags.
**SEO**: unique meta and H1, JSON-LD matches page, sitemap draft exclusion, robots, 404 and redirects, social image URLs, no duplicate analytics page_view, no personal data in analytics.
**Regression**: deployment, login, admin permissions, existing feature flags, PM2/Nginx and Cloudflare related workflows remain intact.

## Security practices
Backend-side policy enforcement, validation, escaped output, safe Markdown, indexed DB access, per-request budget and provider timeouts, appropriate CSP/CSRF, secure secrets, auditable actions, retention limits, conservative defaults. Add unit, integration and browser-level tests using existing project conventions; do not fabricate successful runs. Explain any tests not executable and their blockers.

## Phase acceptance report template
Phase, SHA/branch, scope, changed files, tests with commands/results, screenshots or objective evidence, security/performance impact, migrations/rollback, open issues, decisions, token usage (measured if tool exposes, otherwise estimated), next phase/gate. A phase isn't done with failing critical tests.
