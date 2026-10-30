# Final gates: validation and controlled release

## Required evidence
- Unit/integration/e2e tests appropriate to changed code and routes; smoke-test login, GitHub auth, deployment, admin controls and account deletion without destructive production experiments.
- Validate security: secrets not in views/logs, authorization, throttling, isolation assumptions, roles, cross-account access and abuse measures.
- Verify privacy: actual cookies/consent/tag behavior, request forms, retention and deletion statements, international disclosures and legal review status.
- Verify UX/SEO: responsive pages, keyboard/accessibility checks, link checker, index exclusions, metadata, sitemap, canonicals, redirects, blog internal linking.
- Verify support contact and disclosure inbox actually function.
- Confirm accurate free quotas, no enabled paid tiers without approval, no live donation buttons pointing to unverified recipients.
- Test health, monitoring, backup and rollback procedures; identify exact commit SHA and deployment environment. Check no unrelated pending features enabled.

## Release policy
Production deployment requires explicit user authorization after presenting summary of changes, tests, unresolved risks and rollback plan. Do not infer permission from permission to write Markdown or run Claude Code. Block release if material security controls or privacy/legal review fail. Safe partial releases should omit blocked features rather than exaggerate readiness.

## Report format after each phase
Changed files; tests run/results; policy and security implications; blockers; decisions autonomously made and rationale; unresolved owner/legal approvals; next phase. Maintain 10_DECISIONS_RISKS_CHANGELOG.md.
