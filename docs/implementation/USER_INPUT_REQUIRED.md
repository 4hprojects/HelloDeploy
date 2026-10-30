# User input required

Single checklist of what only the owner can supply. Placeholders (`TODO_USER_INPUT_*`) appear only here and in internal docs, never on public pages. Features waiting on an item stay disabled.

Last updated: 2026-10-31.

## A. Legal and business

| ID                                | Needed                                                            | Purpose                             | Affects              | Where it goes                                                    | Priority | Blocks prod?                      | How to supply                  | Status |
| --------------------------------- | ----------------------------------------------------------------- | ----------------------------------- | -------------------- | ---------------------------------------------------------------- | -------- | --------------------------------- | ------------------------------ | ------ |
| `TODO_USER_INPUT_GOVERNING_LAW`   | Governing law and venue (draft proposes the Philippines)          | Terms § Governing law               | `/terms`             | `apps/web/src/views/pages/terms.ejs`; draft in `LEGAL_DRAFTS.md` | P1       | No                                | Approve or edit the draft      | Open   |
| `TODO_USER_INPUT_LIABILITY_CAP`   | Approve a free-tier liability cap                                 | Terms § Limitation of liability     | `/terms`             | same                                                             | P1       | No                                | Approve or edit the draft      | Open   |
| `TODO_USER_INPUT_LEGAL_REVIEW`    | Qualified legal review of all policies                            | Package release gate for legal text | all policy pages     | `docs/LEGAL_POLICIES.md`                                         | P1       | No (pages already live as drafts) | Record reviewer and date       | Open   |
| `TODO_USER_INPUT_OPERATOR_STATUS` | Legal status of "4H Projects" (registered business or trade name) | Privacy § Who we are                | `/privacy`, `/about` | `apps/web/src/config/legal-policies.js`                          | P2       | No                                | State the registration, if any | Open   |

## B. Privacy and security

| ID                                           | Needed                                                           | Purpose                               | Affects                               | Where it goes                         | Priority | Blocks prod? | How to supply                                                                           | Status                |
| -------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------- | ------------------------------------- | ------------------------------------- | -------- | ------------ | --------------------------------------------------------------------------------------- | --------------------- |
| `TODO_USER_INPUT_GITHUB_APP_PERMISSIONS`     | Permission list from the GitHub App settings page                | List exact scopes in Privacy and docs | `/privacy`, `/docs/github-connection` | `privacy.ejs`, `public.controller.js` | P2       | No           | Screenshot or copy of the App's "Permissions & events"                                  | Open                  |
| `TODO_USER_INPUT_TURNSTILE_SECRET_CONFIRMED` | Confirm `TURNSTILE_SECRET_KEY` is set in `/opt/hellodeploy/.env` | Turnstile fails open without it       | sign-in, sign-up, reset               | `/opt/hellodeploy/.env`               | P2       | No           | Run `sudo grep -c '^TURNSTILE_SECRET_KEY=.' /opt/hellodeploy/.env` and report the count | Open (widget is live) |

## C. Analytics and SEO

| ID                               | Needed                                  | Purpose                      | Affects      | Where it goes           | Priority | Blocks prod? | How to supply                                           | Status |
| -------------------------------- | --------------------------------------- | ---------------------------- | ------------ | ----------------------- | -------- | ------------ | ------------------------------------------------------- | ------ |
| `TODO_USER_INPUT_GA4_ID`         | GA4 measurement ID (`G-…`) and go-ahead | Site analytics after consent | public pages | `/opt/hellodeploy/.env` | P3       | No           | Add the env value only after approving the consent text | Open   |
| `TODO_USER_INPUT_SEARCH_CONSOLE` | Search Console HTML-tag token           | Ownership verification       | `<head>`     | `/opt/hellodeploy/.env` | P3       | No           | Copy the `content` value of the verification meta tag   | Open   |

## D. Donations and payments

| ID                                   | Needed                            | Purpose           | Affects      | Where it goes             | Priority | Blocks prod? | How to supply                                   | Status |
| ------------------------------------ | --------------------------------- | ----------------- | ------------ | ------------------------- | -------- | ------------ | ----------------------------------------------- | ------ |
| `TODO_USER_INPUT_PAYPAL_LINK`        | Verified PayPal donate link       | Optional support  | Support card | `/opt/hellodeploy/.env`   | P3       | No           | Provider-hosted `https://www.paypal.com/…` link | Open   |
| `TODO_USER_INPUT_GCASH_QR`           | GCash QR image generated by GCash | Optional support  | Support card | owner-supplied image file | P3       | No           | Export from the GCash app                       | Open   |
| `TODO_USER_INPUT_BANK_QR`            | Bank-generated QR Ph image        | Optional support  | Support card | owner-supplied image file | P3       | No           | Export from the bank app                        | Open   |
| `TODO_USER_INPUT_DONATIONS_APPROVAL` | Approval to start collecting      | Package hard gate | Support card | `DONATIONS_ENABLED`       | P3       | No           | Say so explicitly                               | Open   |

## E. Infrastructure

| ID                                   | Needed                                                                             | Purpose                                | Affects           | Where it goes                             | Priority | Blocks prod? | How to supply            | Status |
| ------------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------- | ----------------- | ----------------------------------------- | -------- | ------------ | ------------------------ | ------ |
| `TODO_USER_INPUT_ISOLATION_DECISION` | Decide on egress limits, forced non-root and disk quota                            | Required before wider untrusted access | worker containers | `apps/worker/src/deployment/container.js` | P1       | No (pilot)   | Choose which to schedule | Open   |
| `TODO_USER_INPUT_BACKUP_SCHEDULE`    | Confirm whether a scheduled DB backup exists outside the repo (Atlas or host cron) | Privacy retention row "Server backups" | `/privacy`        | `privacy.ejs`                             | P2       | No           | Describe the schedule    | Open   |

## F. Other decisions

| ID                           | Needed                                                       | Purpose        | Affects             | Where it goes | Priority | Blocks prod? | How to supply     | Status   |
| ---------------------------- | ------------------------------------------------------------ | -------------- | ------------------- | ------------- | -------- | ------------ | ----------------- | -------- |
| `TODO_USER_INPUT_PAID_PLANS` | Any decision on paid plans (PHP 299 / 799 are research only) | Future pricing | none until approved | —             | P3       | No           | Separate approval | Deferred |
