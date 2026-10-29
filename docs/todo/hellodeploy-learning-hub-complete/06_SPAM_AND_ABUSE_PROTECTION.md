# Phase 5 — Auto-Moderation, Reporting and Enforcement

## Policy and core principle
No routine manual approval. Eligible safe submissions publish immediately after **all required checks** pass. Suspicious/uncertain submissions do not publish; return actionable revision message or temporary unavailable message. Automatic classifiers cannot promise zero harmful comments. Keep post-publication reporting, removal, restoration, emergency disable and periodic policy review.

## Ordered gate (server controlled)
1. Comments + article flag enabled, POST origin/CSRF policy and server schema validation.
2. Cloudflare Turnstile **server-side Siteverify**, secret from server env; verify `success`, expected hostname and action; enforce short-lived single-use token, no trust in frontend widget. Do not log token.
3. Redis-backed rate-limit with safe fallback **reject** if protection unavailable. Proposed 3 submissions/10min and 10/hour using privacy-reviewed anonymous/IP-derived short-lived keys; account for NAT without permanent raw IP logs.
4. Normalization, text-only escaping, max lengths, reject outbound URLs in MVP; duplicate fingerprints and promotion/link-spam heuristic. Recognize code snippets/error logs and avoid simplistic keyword banlists.
5. Replaceable contextual content moderation adapter (English/Filipino technical discussion), provider approved before paid use. Test categories: harassment, threats, hate, sexual abuse, personal data exposure, promotion, repeated abuse. Distinguish harsh technical criticism from directed harassment. Never call a generative provider unless justified; block on required service outage.
6. Atomic decision: safe published; spam/unsafe rejected; uncertain requires revision; write minimal metadata, decision reason and policy version. Use idempotency keys against retries and replay.

## Reports and lifecycle
Any guest may report a published comment via rate-limited, Turnstile-protected form. Reasons: spam, harassment, hate, threats, personal data, other. Deduplicate reports, do not remove based only on report count, rerun moderation on reported content. Confirmed severe policy violation automatically hides, auditable with restoration. Admin may hide/remove/restore and disable globally/per article. Distinguish `hidden` from `removed`, visibility in queries and pagination. No user-generated text to GA4.

## Operational safeguards
Global kill switch, anomaly alarm for rejection spikes or moderation outages, short retention and purging of rejected submissions, logs without PII/secrets. Audit rate-limit bypasses, Unicode evasion, homoglyphs, obfuscated URLs, false positives, hate in English/Filipino, medical/technical quoted examples, privacy/PII. Never auto-publish on provider timeout. Protect moderation service costs with quotas and prefiltering. If no suitable moderation provider is approved, ship code disabled, not unsafe comments.

## Acceptance gate
Automated adversarial suite demonstrates safe criticism posts, spam/harassment blocked, failure paths closed, replay resisted, reports cannot be weaponized to auto-hide innocent comments, admins can restore, comments still readable after submission-disabled toggle. Owner authorizes live enabling separately.
