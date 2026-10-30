# HelloDeploy Public Content Improvement Package
Version: 2026-10-31 | Status: Approved direction, audit-first execution

## Objective
Improve HelloDeploy's public-facing legal, privacy, security, product, documentation, support, SEO, and donation experience without misrepresenting its actual capabilities or disrupting production. Primary audience: Philippines; international access permitted subject to jurisdictional audit.

## Source of truth
Planning Google Doc: https://docs.google.com/document/d/15AwcwFu-FueP8vjtDkmu0KJ-Pgi8GtDtyghoORY4R-M/edit
Use existing repository and live configuration as the technical source of truth. If documents and code disagree, report the difference and fix only after evaluating consequences.

## Mandatory execution order
1. 01_AUDIT_AND_INVENTORY.md
2. 02_SECURITY_LEGAL_PRIVACY.md
3. 03_PUBLIC_PAGES_PRICING.md
4. 04_DOCUMENTATION_SUPPORT.md
5. 05_NAVIGATION_SEO_ANALYTICS.md
6. 06_DONATIONS.md
7. 07_ACCOUNT_MANAGEMENT.md
8. 08_CONTENT_GOVERNANCE.md
9. 09_TEST_RELEASE_ACCEPTANCE.md

Phase numbering here identifies implementation units, not a requirement to create all features irrespective of audit results. Track approved, blocked and deferred items in 10_DECISIONS_RISKS_CHANGELOG.md. Proceed through safe implementation autonomously; stop at human-required gates.

## Non-negotiables
- Do not invent product features, infrastructure guarantees, legal operator, retention periods, payment links or account controls.
- Preserve working functionality, user data, established URLs and SEO equity.
- No global claims of GDPR compliance or legal guarantees without review; legal policies are drafts pending qualified review.
- Never include secrets in docs, logs, commits, screenshots or AI output. Mask any sensitive findings.
- Do not install analytics/advertising tags before verifying legal consent mechanism and current privacy disclosures.
- Do not enable payment collection, publish QR codes or billing plans without verified recipient credentials and authorization.
- Do not deploy to production without explicit user authorization and operational release evidence. Existing prior permissions do not constitute blanket approval of this package.
- Do not change hosting architecture, pricing, account deletion semantics, permissions or data retention invisibly.
- If a required control cannot be implemented safely, mark blocked and present honest public wording rather than false promises.

## Delivery artifacts
Audits, change log, implementation notes, screenshots of public UI where practical, tests, release checklist, rollback instructions, unresolved gates and an accurate user-facing feature inventory.
