# Phase 4 — Guest Comments and One-Level Threading

## Product contract

Guests post with display name (2–60 chars) and plain-text comment (10–2,000 chars). No account, manual approval queue, uploads, rich HTML, clickable external links or public email. Optional email only if a specific future opt-in notification feature is separately implemented; do not collect it in MVP. Turnstile is mandatory for every guest comment and guest reply. Staff/admin replies use existing RBAC and a verified team badge.

## Thread data model

Immutable comment ID, articleId, parentId (root for top-level, root parent ID for replies), replyToCommentId (actual target), displayName, plain-text body, status (`published`, `rejected`, `hidden`, `removed`), createdAt, moderation decision metadata/version, report state and audit timestamps. At most one **visual** nested level. Reply to reply: store root `parentId` and original `replyToCommentId`, render as sibling under root with safe `@displayName` context. Enforce relationships server-side: same article, valid visible target, root resolution, no cycles, no unlimited depth. Hide personal contact information.

## API and UI

Routes to list paginated public comments, submit root/reply, report, and admin remove/restore. Place form and discussions after article/related content. Oldest-first threads, root pagination, capped visible replies, accessible load more. Count visible published comments correctly. Show edit/revise error state for rejected posts without exposing filter bypass details. Preserve draft in browser on temporary failure.

## Critical gate

Implement feature flags and data model first; all public POST routes reject while comments disabled, even if UI hidden. Only publish after Phase 5 mandatory checks. No fallback bypass for failed protection services. Keep comment rendering plain text with output escaping.

## Tests

Cross-article reply spoof, deleted parent, invalid root/child, repeated nonce/submission, long names, malicious HTML/Markdown, Unicode, race conditions and pagination stability. Approved meaning auto-published safe, not manual moderation.
