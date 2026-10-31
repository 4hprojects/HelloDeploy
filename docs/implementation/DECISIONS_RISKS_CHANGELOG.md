# Decisions, risks and changelog

Carries forward the package's `10_DECISIONS_RISKS_CHANGELOG.md` register. Approved constraints are not changed silently; changes get a dated entry.

## Register

| Topic                               | Status                    | Decision / missing evidence                                                                                                                | Gate owner        |
| ----------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| Free pilot                          | Verified                  | Limits enforced from `packages/database/src/quota.js` (1 project, 256 MB, 0.25 CPU, 10 deploys/month). No disk quota, so none is published | Technical owner   |
| Paid tiers                          | Deferred                  | PHP 299 and 799 are research only; nothing public                                                                                          | Product/operator  |
| Donations                           | Blocked until credentials | Scaffold ships disabled                                                                                                                    | Operator          |
| Legal operator                      | Decided                   | "4H Projects" on every public page; owner name only as blog byline                                                                         | Operator          |
| Philippine and international policy | Draft pending review      | Factual fixes published; governing law and liability cap in `LEGAL_DRAFTS.md`                                                              | Legal reviewer    |
| GitHub scopes and secrets           | Partly verified           | Tokens never stored; permission list needs owner input                                                                                     | Security owner    |
| Application isolation               | Gaps found                | Egress open, possible root in owner images, no disk quota                                                                                  | Security owner    |
| Account deletion                    | Decided                   | Self-service request; admin completes with existing deletion                                                                               | Technical/privacy |
| GA4 and AdSense                     | Off                       | Consent banner first; no IDs set                                                                                                           | Privacy/product   |
| Production release                  | Per PR                    | Owner merges each PR; autodeploy ships; agent verifies                                                                                     | Operator          |

## Changelog

- **2026-10-31** Owner decisions: one PR per phase, owner merges; publish factual legal fixes only; "4H Projects" everywhere; account closure by request.
- **2026-10-31** PR 1: Terms gains a licence to host and run deployed apps and an appeal route. AUP gains sexually explicit services and spam rules, an immediate-containment rule replacing "suspended without notice", and an appeals section. Service Limits runtime list aligned with Supported Applications. Password reset now signs out other sessions; reset steps 2–3 are rate-limited.
- **2026-10-31** Not changed: `docs/FAQ.md` already says pilots are switched off, so it does not contradict the public pages.
- **2026-10-31** PR 2: `/about`, `/features` (status-badged), `/pricing` → `/pilot` (301). Premium is described as not for sale and leaves the sitemap. Footer and homepage name 4H Projects.
- **2026-10-31** PR 3: Docs gain full guides for domains, deploy hooks, rollback and troubleshooting, plus new Logs and Delete and Disconnect topics and unique meta descriptions. New email-only `/contact`; `/faq` and `/help` redirect into the docs.
- **2026-10-31** PR 4: header and four-group footer, `X-Robots-Tag` on private routes, policy `lastmod`, homepage JSON-LD, optional Search Console tag. Consent banner, site-wide GA4 and AdSense deferred until the owner supplies a GA4 ID and authorizes the policy changes.
