# Deployment and Rollback

## Release discipline
Use dedicated feature branch from clean supported baseline. No direct edits to production, no force pushes, no merges without owner instruction. Commits/PR grouped by phase. Existing production services remain unchanged during audit and development. Review migrations as additive/index-only if possible, with safe idempotence, resource impact and explicit rollback path.

## Flag sequencing
1. Blog infrastructure can deploy with `learningHub.enabled=false` until verified.
2. Enable public blog only after article, SEO and regression gates. Views/shares on when ready.
3. Guest submission remains OFF until full moderation/Turnstile/rate-limits/reporting gate and explicit owner approval. Publishing safe comments is automatic *after* activation.
4. Analytics only after proper configuration/privacy review.
5. Ads off until AdSense approval, correct account identifiers, consent implementation and owner authorization. Per-article ad eligibility independent of comments.

## Preflight
Backup MongoDB according to existing procedure, snapshot/verify healthy release and reversal, confirm resources/free disk, verify env configuration **without printing secrets**, check DB index performance, turnstile provider mode, moderation quotas and alerts, public routes on preview environment, sitemap and robots.

## Rollback
Feature flags first (guest comments, ads, analytics, blog), redeploy previous commit if needed, preserve published comments/views, avoid destructive rollback of additive schemas; provide index and data compatibility notes. On abusive incident: disable submissions, hide confirmed violations, turn off ads for risky pages, retain minimal audit records, investigate and restore only after tests.

## Evidence
Before proposing prod enablement provide exact SHA, gate status, unresolved risks and operator steps. Do not claim launched if only prepared.
