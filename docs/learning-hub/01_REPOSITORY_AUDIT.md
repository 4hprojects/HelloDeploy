# Phase 0 — Repository and Reference Audit

**Audit only. Do not implement, refactor, deploy or toggle flags during this phase.**

## Inspect and evidence

1. Repository tree, package scripts, current branch, tests, CI/CD, deployment/rollback mechanism; record inspected commit SHA.
2. Existing Express routers, EJS layouts/partials, CSS tokens, mobile navigation, CSP, authentication, session and CSRF design.
3. MongoDB connection/models/index conventions and Redis client, key prefixes and failure handling; any preexisting analytics or counters.
4. Cloudflare Turnstile widget/siteverify configuration; sitekey, secret storage conventions, hostname/action binding; no secrets in report.
5. Existing global/per-feature flags, admin RBAC and logging, Resend and security headers.
6. Public content routes, SEO tags, robots/sitemap and about/contact/privacy/terms presence; verify live route functionality where permitted.
7. Existing library and dependency posture, Markdown processing and untrusted HTML handling.
8. Review related HelloRun and HelloUniversity article experiences as UX reference if code access is authorized. HelloPera only if accessible. No cross-repo code copying without assessing license, portability and compatibility.
9. Baseline CPU/RAM/response times and server constraints only if accessible; do not claim measurements otherwise.

## Deliverable `PHASE_00_AUDIT_REPORT.md`

Produce: findings table (capability / evidence path:line / reuse or gap / risk / recommendation); route collision matrix; data-model migration implications; dependency decision; privacy/AdSense gap matrix; credible implementation effort and token estimates with uncertainty; revised phase sequencing and blockers. Explicitly separate verified facts from assumptions and unavailable systems.

## Gate

Stop after report and request review of audit findings. Do not quietly continue to implementation. The user may then authorize the remaining phases to proceed continuously with per-phase reports and automatic routine engineering decisions.
