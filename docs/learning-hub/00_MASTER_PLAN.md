# HelloDeploy Learning Hub — Master Implementation Plan

Status: approved planning baseline, subject to Phase 0 repository audit. Intended agent: Claude Code. This document is a specification, not evidence that code exists.

## Mission and scope

Build a public, mobile-first educational blog at `/blog` to help readers deploy, host, secure, and troubleshoot web applications. Publish five substantive tutorials. Support article statistics, sharing, and low-friction guest discussions with auto-publication only after mandatory protections pass. Prepare the _whole public site_ for AdSense review. Approval is not guaranteed and there is no fixed minimum article count.

## Hard decisions

- Existing HelloDeploy stack and conventions take precedence. Expected stack is Express/EJS, MongoDB, Redis, existing auth/admin, Cloudflare Turnstile. Audit actual implementation first.
- Initial editorial source: Git-tracked Markdown with validated YAML front matter. Engagement data in MongoDB. Keep content repository abstraction for future CMS.
- Routes: `/blog`, `/blog/:slug`, `/blog/category/:slug`, optional `/blog/author/:slug`. Avoid conflicts and reserve paths.
- Views: publicly displayed approximate eligible page views, 30-minute best-effort deduplication, never claim unique persons.
- Sharing: Facebook, LinkedIn, X, copy link, native Web Share with fallback; top and end of article, optional wide-screen floating toolbar. Track clicks, not successful shares.
- Comments: guests allowed; no login, no routine prepublication approval. Safe comments auto-publish. Mandatory server-side Turnstile, throttling, spam checks, contextual abuse checks, safe rendering, reporting, post-publication removal and restoration. Visual nesting maximum one level; replies to replies remain siblings and retain `replyToCommentId`.
- **Fail closed:** if required moderation, Turnstile, throttling, or state persistence is unavailable, reject/temporarily suspend new submissions. Never silently publish unverified content.
- Comments are OFF by default on production until verified and explicitly enabled by owner. Advertising OFF until site approved, configured, and owner authorizes activation. Do not infer AdSense approval.
- No browser-based CMS, reactions, comment attachment uploads, or outbound links in guest comments in MVP.
- No paid services, infrastructure procurement, destructive data migrations, secret disclosure, or unreviewed production activation without owner approval.

## Quality gates

- Written and code-tested security safeguards for commenting.
- Accessibility and mobile behavior including 320px widths, zoom, keyboard and screen reader states.
- SEO, OG, sitemap, canonical, structured data, author transparency and truthful dates.
- Privacy policy covers comment moderation, Turnstile, analytics, advertising as actually used. Consent requirements assessed before GA/ads enabled.
- Technical article examples verifiable; claims tied to source or real tests. Avoid invented performance data.
- Existing deployment operations unaffected by new public routes and feature flags.

## Phase dependencies

0 Audit (report only, STOP for review) → 1 Content foundation → 2 Public UI → 3 Views/sharing → 4 Guest comments core (disabled) → 5 Moderation/reporting (disabled until accepted) → 6 SEO/analytics/ads readiness → 7 five articles → 8 release QA and controlled deployment.

Phases 1–8 may continue in sequence after Phase 0 is accepted, provided gates pass; no production launch/feature enable/merge without explicit authorization. Keep separate commits, test results, documentation and rollback notes by phase. Dependencies and scope changes discovered in Phase 0 must be recorded before implementation.

## Source of truth

This file defines policy; specialized files define implementation acceptance. When conflicts arise, prioritize safety defaults, explicit owner constraints, current repository evidence, and document the discrepancy. Never assume another Hello project shares identical code.
