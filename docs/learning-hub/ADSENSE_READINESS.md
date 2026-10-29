# AdSense Readiness Checklist

Checked 2026-10-29. Technical readiness is not approval: Google reviews the whole site and may
refuse it for reasons this checklist cannot test. **Ads are off** and stay off until the owner
authorizes activation.

## Public site (live `https://hellodeploy.online`, checked with `curl` on 2026-10-29)

| Item                                                                          | Evidence                                                               | State                                                                         | Owner action                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| Home page explains the product                                                | `/` 200                                                                | Present                                                                       | —                                                  |
| How it works, docs, FAQ, supported apps                                       | `/how-it-works`, `/docs`, `/docs/faq`, `/supported-apps` all 200       | Present                                                                       | —                                                  |
| Pricing / plan information                                                    | `/pilot`, `/premium`, `/service-limits` 200                            | Present                                                                       | Confirm still accurate                             |
| Terms, privacy, cookies, acceptable use, data processing, copyright, security | all 200                                                                | Present; privacy and cookies updated for the Learning Hub                     | Review the 2026-10-29 privacy wording              |
| About page                                                                    | `/about` 404                                                           | **Missing**                                                                   | Supply truthful organization and operator facts    |
| Contact page                                                                  | `/contact` 404                                                         | **Missing** (an email appears in the privacy policy and footer operator line) | Decide the public contact channel                  |
| Original long-form content                                                    | `/blog` (404 before this release)                                      | Five tutorials in this release                                                | Owner approves publication                         |
| `ads.txt`                                                                     | `/ads.txt` 404                                                         | Absent, correctly                                                             | Add only with the real publisher id after approval |
| Mobile access                                                                 | Playwright 320–1440 px on blog pages; existing UI suite on other pages | Passing                                                                       | —                                                  |
| Broken internal links in articles                                             | `npm run content:check` fails on unresolved `/blog/...` links          | Enforced                                                                      | —                                                  |

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

## Before activation (owner)

1. AdSense account approved for `hellodeploy.online`.
2. A consent mechanism appropriate to visitor locations (Google requires a certified CMP for
   EEA, UK, and Swiss traffic). None exists today.
3. Privacy and cookie policies updated to name Google advertising and its cookies.
4. **Code change required:** extend the CSP in `apps/web/src/app.js` for AdSense hosts
   (`pagead2.googlesyndication.com`, `googleads.g.doubleclick.net`, `tpc.googlesyndication.com`,
   and others Google lists). This was deliberately not added untested.
5. Set the ids, mark chosen articles `adEligible: true`, and publish `ads.txt` with the real id.

## GA4 (also off)

GA4 loads on Learning Hub pages only when `GA4_MEASUREMENT_ID` is set **and**
`LEARNING_HUB_ANALYTICS_CONSENT_READY=true`, which the owner sets only after a consent
mechanism exists. The tag sends its own automatic `page_view` (one source); custom events are
`article_share_click`, `article_copy_link`, `related_click`, and `comment_submit_outcome`, each
with the article id and a fixed label only. Internal view counts are not GA4 users.
