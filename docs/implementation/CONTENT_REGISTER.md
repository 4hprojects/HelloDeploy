# Content register

Every public page, who owns it, and when it is next due for review. Update the row whenever a page changes. The PR template asks for this.

Cadence:

- **Monthly smoke check:** run `npm run -s production:check -- https://hellodeploy.online`, open each page below, and confirm that limits, runtimes and contact details still match production. `tests/ui/public-links.test.js` catches broken internal links on every CI run.
- **Quarterly review:** reread each page against the code and the audit (`HELLODEPLOY_AUDIT.md`), and bump `Last review`.
- **On change:** any change to quotas, runtimes, data handling, or the deletion flow updates the affected pages in the same PR.

Owner and reviewer are both the operator (4H Projects) during the pilot. Legal pages also need the legal reviewer before a new provision is published (`TODO_USER_INPUT_LEGAL_REVIEW`).

| Page                                                                                                                  | Source of truth                                                    | Last review | Next review | Status                                          |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------- | ----------- | ----------------------------------------------- |
| `/`                                                                                                                   | `pages/index.ejs`, plan defaults                                   | 2026-10-31  | 2027-01-31  | Current                                         |
| `/features`                                                                                                           | `pages/features.ejs`, audit matrix                                 | 2026-10-31  | 2027-01-31  | Current                                         |
| `/how-it-works`                                                                                                       | `pages/how-it-works.ejs`                                           | 2026-10-31  | 2027-01-31  | Current                                         |
| `/supported-apps`                                                                                                     | `pages/supported-apps.ejs`, `dockerfile-generator.js`              | 2026-10-31  | 2027-01-31  | Current                                         |
| `/pilot` (`/pricing`)                                                                                                 | `pages/pilot.ejs`, plan defaults, `config/donations.js`            | 2026-10-31  | 2027-01-31  | Current; donations off                          |
| `/premium`                                                                                                            | `pages/premium.ejs`                                                | 2026-10-31  | 2027-01-31  | Current; not in sitemap                         |
| `/about`                                                                                                              | `pages/about.ejs`                                                  | 2026-10-31  | 2027-01-31  | Current                                         |
| `/contact`                                                                                                            | `pages/contact.ejs`, `LEGAL_CONTACT_EMAIL`                         | 2026-10-31  | 2027-01-31  | Current                                         |
| `/status`                                                                                                             | `pages/status.ejs`, readiness check                                | 2026-10-31  | 2027-01-31  | Current                                         |
| `/docs` and topics                                                                                                    | `controllers/public.controller.js`, `config/public-pages.js`       | 2026-10-31  | 2027-01-31  | Current                                         |
| `/docs/faq` (`/faq`)                                                                                                  | `controllers/public.controller.js`                                 | 2026-10-31  | 2027-01-31  | Current                                         |
| `/terms`, `/privacy`, `/cookies`, `/acceptable-use`, `/service-limits`, `/data-processing`, `/copyright`, `/security` | `pages/*.ejs`, `config/legal-policies.js` (`effective`, `updated`) | 2026-10-31  | 2027-01-31  | Factual fixes only; drafts in `LEGAL_DRAFTS.md` |
| `/legal`                                                                                                              | `pages/legal.ejs`                                                  | 2026-10-31  | 2027-01-31  | Current                                         |
| `/blog`                                                                                                               | Learning Hub content repository                                    | 2026-10-30  | 2027-01-31  | See `docs/learning-hub/`                        |
| Emails (verification, reset, password changed, closure requested, suspended)                                          | `packages/contracts/src/email-content.js`                          | 2026-10-31  | 2027-01-31  | Current                                         |

Pages that change with owner input: `/pilot` (donations, `TODO_USER_INPUT_PAYPAL_LINK`, `_GCASH_QR`, `_BANK_QR`), `/cookies` and `/privacy` (analytics, `TODO_USER_INPUT_GA4_ID`), and `/terms` (governing law and liability cap, `TODO_USER_INPUT_GOVERNING_LAW`, `_LIABILITY_CAP`).
