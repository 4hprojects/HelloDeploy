# AdSense and Google Analytics Readiness

Checked 2026-10-29; re-audited 2026-11-17. Technical readiness is not approval: Google reviews the whole site and may
refuse it for reasons this checklist cannot test. **Ads are off** and stay off until the owner
authorizes activation.

## Public site (live `https://hellodeploy.online`, checked with `curl` on 2026-10-29)

| Item                                                                          | Evidence                                                               | State                                                     | Owner action                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------- |
| Home page explains the product                                                | `/` 200                                                                | Present                                                   | —                                     |
| How it works, docs, FAQ, supported apps                                       | `/how-it-works`, `/docs`, `/docs/faq`, `/supported-apps` all 200       | Present                                                   | —                                     |
| Pricing / plan information                                                    | `/pilot`, `/premium`, `/service-limits` 200                            | Present                                                   | Confirm still accurate                |
| Terms, privacy, cookies, acceptable use, data processing, copyright, security | all 200                                                                | Present; privacy and cookies updated for the Learning Hub | Review the 2026-10-29 privacy wording |
| About page                                                                    | `/about` 200 (2026-11-17)                                              | Present                                                   | —                                     |
| Contact page                                                                  | `/contact` 200 (2026-11-17)                                            | Present (email only)                                      | —                                     |
| Original long-form content                                                    | `/blog` (404 before this release)                                      | Five tutorials in this release                            | Owner approves publication            |
| `ads.txt`                                                                     | `/ads.txt` 404                                                         | Served automatically once `ADSENSE_CLIENT_ID` is set      | Set the id when applying              |
| Mobile access                                                                 | Playwright 320–1440 px on blog pages; existing UI suite on other pages | Passing                                                   | —                                     |
| Broken internal links in articles                                             | `npm run content:check` fails on unresolved `/blog/...` links          | Enforced                                                  | —                                     |

## Ad controls built (all off)

| Control                      | Where                                                                                                                               | Default              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Owner switch                 | `ADSENSE_ENABLED`                                                                                                                   | `false`              |
| Account and slot ids         | `ADSENSE_CLIENT_ID` (`ca-pub-` + 16 digits), `ADSENSE_ARTICLE_SLOT_ID`                                                              | empty                |
| Per-article eligibility      | front matter `adEligible`                                                                                                           | `false`              |
| No ads beside guest comments | `articleAdSlot` returns nothing when the discussion is visible                                                                      | enforced             |
| Placement                    | one slot after the article body, before the end share row; never on forms, auth, dashboard, admin, error pages, or the comment form | enforced by template |
| SDK loading                  | the AdSense script tag is rendered only inside an active slot                                                                       | no script today      |
| Emergency off                | set `ADSENSE_ENABLED=false` and restart `hellodeploy-web`                                                                           | —                    |

## Remaining gaps (2026-11-17 audit)

| Gap                                  | Severity         | Notes                                                                                                                                                                                                                                                            |
| ------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content volume                       | Met              | 15 substantive articles: 5 dated 2026-10-29 and a 10-article cybersecurity series published 2026-11-20, each fact-checked against primary sources, with commands verified in containers (see `ARTICLE_VERIFICATION.md`). Keep publishing steadily after approval |
| Policies disclose Google advertising | Done             | `/privacy#advertising` and `/cookies#advertising-cookies` name Google as a vendor, its cookies, the opt-outs, the consent message, and US state rights                                                                                                           |
| Consent for EEA/UK/CH                | **Owner action** | Code done: CSP allows Google's consent tool, and pages with ads get a footer **Privacy and cookie settings** button that reopens it (`js/ad-consent.js`). The messages themselves are created in AdSense (below)                                                 |
| Thin pages                           | Medium           | `/status`, `/premium`, `/supported-apps`, docs topic `service-limits`                                                                                                                                                                                            |
| Policies labelled "drafts"           | Medium           | Reads as unfinished to a reviewer; remove once the owner accepts the text                                                                                                                                                                                        |
| User apps share `hellodeploy.online` | Risk             | Apps on `*.hellodeploy.online` are user content on the reviewed domain; enforce the acceptable-use policy                                                                                                                                                        |

## Activation steps (owner)

1. Close the blockers above.
2. Apply in AdSense for `hellodeploy.online`. Set `ADSENSE_CLIENT_ID` and restart `hellodeploy-web`:
   the `google-adsense-account` meta tag and `/ads.txt` go live while `ADSENSE_ENABLED` stays `false`.
3. Create the consent messages in AdSense → Privacy & messaging:
   - **European regulations** → Create message: site `hellodeploy.online`, English, buttons
     Consent / Do not consent / Manage options, privacy policy URL
     `https://hellodeploy.online/privacy`. Publish.
   - **US state regulations** → Create message → Publish.
   - The messages appear only on articles that load the ad script, so only once ads are on. To
     preview one there, add `?fc=alwaysshow&fctype=gdpr` to the article URL.
4. After approval: set `ADSENSE_ARTICLE_SLOT_ID` and `ADSENSE_ENABLED=true`, which also extends the
   CSP for AdSense and the consent dialog, and mark chosen articles `adEligible: true`.
5. Check a live article in a browser for CSP violations in the console.

## Google Analytics 4 (off until the owner sets it up)

GA4 covers **public pages only**. It never loads on `/auth`, `/dashboard`, `/projects`, `/admin`,
`/account` or `/github` (`PRIVATE_PATH_PREFIXES` in `apps/web/src/services/site-analytics.js`),
because auth URLs carry one-time tokens and app pages show project and repository names.

How it works, in load order on a measured page (`views/partials/analytics.ejs`):

1. Consent Mode v2 defaults: everything denied in EEA/UK/CH until the visitor accepts in Google's
   consent message; elsewhere analytics granted, all ad signals denied.
2. Google's consent tag (`fundingchoicesmessages.google.com/i/<pub-id>`), the same Privacy &
   messaging CMP used for ads. It updates consent when the visitor chooses.
3. `gtag.js`, configured with `page_location` reduced to origin + path + `utm_*`, a same-site
   referrer without its query, a fixed title on blog search, and Google signals and ad
   personalization off.

Opt-outs: the footer **Privacy and cookie settings** control (reopens the consent message in
EEA/UK/CH, otherwise opens `/cookies#analytics`), the **Turn off analytics** button on
`/cookies` (stores `hd-analytics-off` and sets `ga-disable-<id>`), and Google's browser add-on.

Events: automatic `page_view`; `sign_up_click` (fixed `link_location` of `header` or `page`) on
public "Create account" links; Learning Hub `article_share_click`, `article_copy_link`,
`related_click`, and `comment_submit_outcome` with the article id and fixed labels only.
Sign-ups themselves are counted by first-party product analytics, not GA4.

### Owner steps

1. In Google Analytics, create a GA4 property and a web stream for `https://hellodeploy.online`.
   Copy the `G-…` measurement id.
2. In GA4 Admin:
   - Data retention: **14 months**. The privacy policy states this.
   - Google signals: **off**.
   - Enhanced measurement: keep page views, scrolls, and outbound clicks; turn **off** site
     search and form interactions.
3. Publish the AdSense Privacy & messaging **European regulations** message (see the activation
   steps above). It covers analytics as well as ads. If Privacy & messaging is unavailable until
   AdSense approves the site, keep analytics off until then.
4. Set `GA4_MEASUREMENT_ID`, `ADSENSE_CLIENT_ID`, and `ANALYTICS_CONSENT_READY=true`, then
   restart `hellodeploy-web`. All three are required; any missing keeps every Google analytics
   script off.
5. Check GA4 Realtime for a visit, and Tag Assistant for the consent defaults. From an EEA VPN,
   confirm the consent message appears and no `_ga` cookie exists before accepting.
6. After the first `sign_up_click` arrives, mark it as a key event in GA4 Admin → Events.
