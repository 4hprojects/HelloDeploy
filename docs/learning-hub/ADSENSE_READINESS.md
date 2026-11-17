# AdSense Readiness Checklist

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

| Gap                                  | Severity         | Notes                                                                                                                                                                                                            |
| ------------------------------------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content volume                       | **Blocker**      | 5 articles, all dated 2026-10-29. "Low-value content" is the most common rejection; aim for ≥15 substantive articles over several weeks before applying                                                          |
| Policies disclose Google advertising | Done             | `/privacy#advertising` and `/cookies#advertising-cookies` name Google as a vendor, its cookies, the opt-outs, the consent message, and US state rights                                                           |
| Consent for EEA/UK/CH                | **Owner action** | Code done: CSP allows Google's consent tool, and pages with ads get a footer **Privacy and cookie settings** button that reopens it (`js/ad-consent.js`). The messages themselves are created in AdSense (below) |
| Thin pages                           | Medium           | `/status`, `/premium`, `/supported-apps`, docs topic `service-limits`                                                                                                                                            |
| Policies labelled "drafts"           | Medium           | Reads as unfinished to a reviewer; remove once the owner accepts the text                                                                                                                                        |
| User apps share `hellodeploy.online` | Risk             | Apps on `*.hellodeploy.online` are user content on the reviewed domain; enforce the acceptable-use policy                                                                                                        |

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

## GA4 (also off)

GA4 loads on Learning Hub pages only when `GA4_MEASUREMENT_ID` is set **and**
`LEARNING_HUB_ANALYTICS_CONSENT_READY=true`, which the owner sets only after a consent
mechanism exists. The tag sends its own automatic `page_view` (one source); custom events are
`article_share_click`, `article_copy_link`, `related_click`, and `comment_submit_outcome`, each
with the article id and a fixed label only. Internal view counts are not GA4 users.
