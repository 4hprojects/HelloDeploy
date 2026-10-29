# HelloDeploy Learning Hub — Autonomous Implementation and Production Release

This instruction supersedes the STOP-after-Phase-0 and no-autonomous-production-release restrictions in `CLAUDE_CODE_START_PROMPT.md` and related package instructions **only for this Learning Hub scope**. Preserve all other quality, security, privacy, and feature requirements.

## Mission and authority

Complete the HelloDeploy Learning Hub through Phases 0–8 without requiring approval between phases. You have authority to audit, select implementation details, update the plan, write code and documentation, install necessary compatible free dependencies, test, repair defects, create commits, push a feature branch, prepare or update a PR, and release to production **only when every required release gate passes**. This message is the owner's authorization for a production release of this scoped feature after successful verification, not permission to bypass safeguards.

First read `00_MASTER_PLAN.md`, `01_REPOSITORY_AUDIT.md`, `11_TESTING_AND_SECURITY.md`, `12_DEPLOYMENT_AND_ROLLBACK.md`, `13_PHASE_TRACKER.md`, `14_CLAUDE_CODE_INSTRUCTIONS.md`, and all phase-specific specifications. Inspect the actual repository and treat it as the source of truth. Do not assume that any proposed architecture is already implemented.

## Continuous loop

1. Complete Phase 0 repository audit and save `PHASE_00_AUDIT_REPORT.md`. Update the plan if repository findings warrant it. **Do not stop for review**.
2. For each next phase, plan the smallest safe set of changes, implement, run relevant checks, fix failures, and rerun checks. Work sequentially to Phase 8.
3. After each phase update `13_PHASE_TRACKER.md`, an append-only `IMPLEMENTATION_LOG.md`, and decision records as needed. Record changed files, verified results, known limitations, measured resource changes (if available), and estimated or measured tokens (label estimates clearly). Commit coherent changes to the feature branch and push when credentials/permissions permit.
4. Continue into the next phase automatically. Progress reports are informational, not approval requests. Do not conceal test failures or claim success without evidence.
5. Do not use a test failure as permission to weaken security, disable checks, fabricate results, or silently drop required features. Resolve failures or record an explicit blocker.

## Technical decision policy

Choose among reasonable alternatives autonomously using this order: security and data preservation, correctness and acceptance criteria, compatibility with current Express/EJS/MongoDB/Redis architecture, maintainability, operating cost, performance on existing hardware, and simplicity. Reuse proven existing code. Do not introduce an additional server or recurring paid service without explicit owner authorization. If a mandatory external service (for example contextual abuse moderation) lacks credentials or a suitable free option, implement a clean adapter with fail-closed defaults, document the missing configuration, and **do not enable public guest comments**. Never claim the unavailable integration has passed an end-to-end test.

## Fixed product decisions

- Public Markdown-based educational articles with reusable EJS templates and five original, technically verified tutorials.
- Public view counts with best-effort bot suppression and 30-minute duplicate suppression; social sharing at top and bottom with mobile native-share fallback.
- Guests may comment without accounts; **no manual preapproval**. Safe comments publish immediately only after server-validated Turnstile, anti-flood controls, spam checks, and contextual abuse screening pass.
- One visual reply nesting level. Replies to nested replies stay aligned at that level but preserve reply-to target context.
- Comment reports, post-publication admin removal/restore, audit trails, and emergency disable must be implemented. Comments remain fail-closed until safeguards are verified. No guarantee of perfect abuse detection should be asserted.
- Search, structured data, canonical tags, sitemap, privacy/disclosure checks, GA4 instrumentation when properly configured, and AdSense-readiness checks are part of the scope.
- Never expose secrets, send PII to analytics, publish fabricated benchmarks, or present unfinished tutorials as tested.

## Safe release policy

A production release is authorized **only if** all of the following are true:

- All mandatory Phase 0–8 acceptance criteria have passed, with evidence recorded; no unresolved critical or high-severity security issues.
- Regression checks for deployments, authentication, PM2/worker processes, admin permissions, and existing public routes pass.
- Required migrations are backward compatible, a current usable backup and verified rollback path exist, and predeployment checks confirm sufficient disk/memory and service health.
- No new unapproved financial obligations, destructive production operations, credential changes, or privilege expansions are required.
- The latest intended commit SHA is frozen and recorded. CI or equivalent local checks pass. The actual production deployment mechanism is confirmed and available.
- After deployment, verify live article routes, assets, SEO metadata, core application deployment health, logs, and rollback readiness. Record deployment timestamp, SHA, smoke-test evidence, and rollback reference.

Keep **AdSense ad serving disabled**, regardless of successful deployment, until the AdSense account/site is approved, consent/privacy obligations are satisfied, and the owner separately authorizes activation. Guest commenting may be enabled only if the complete moderation pipeline is operational and specifically passes required production smoke tests. If there is uncertainty, deploy the blog with comments disabled. Do not disable existing security or change production infrastructure broadly to satisfy this release.

## Blockers and stop conditions

Do not ask for routine engineering decisions. Decide and record rationale. If a high-impact step cannot be completed safely, do not improvise around the boundary. Examples: missing production access, required owner/third-party credentials, paid subscription, destructive migration, unavailable reliable backup, failed critical tests, an absent moderation provider required to enable public comments, or uncertain rollback. Finish all independent work; preserve a deployable branch; record `BLOCKERS_AND_HANDOFF.md` with the exact missing action and safest default. Do not falsely report a production release.

## Final report

Report each phase's completion status, commits/PR, test commands and actual outcomes, remaining risks, feature flag states, articles published, production URL checks, deployed commit SHA (if deployed), backup/rollback reference, and any features intentionally left off. State clearly whether production deployment was completed, partially completed, or blocked.

Proceed now from the current Phase 0 state; do not repeat completed verified work.
