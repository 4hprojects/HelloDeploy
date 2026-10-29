# Phase 6B — AdSense Readiness and Advertising Controls

## Objective
Strengthen site quality and readiness; **no guaranteed approval** and no fixed article minimum. Entire public website matters, not only `/blog`.

## Public-site audit
Verify homepage explains current supported runtimes truthfully; features, pricing/free vs premium if offered, about, contact, privacy, terms, docs/support, functional public navigation, broken links, placeholders, mobile access, and meaningful original content. Document missing pages rather than inventing capabilities or pricing. Confirm legal/organization disclosures with owner, not generated as unverified facts.

## Ad slots
Reusable but **disabled** component; only on appropriate public content pages, never on deploy forms, login, dashboard/admin, error states or comment form. Do not load ads SDK before owner authorization and account approval. Per-page `adEligible` distinct from `commentsEnabled`, emergency disable ads, conservative spacing. Consider withholding ads from pages with unverified guest content and automatic safety flags. No deceptive placement or accidental-click inducement.

## Privacy/consent and policy
Review GA4, AdSense, Turnstile, moderation-service data transfer, cookie/local storage, retention, user rights, and geographic consent requirements before activation. Publisher remains accountable for all content including auto-published guest content. Implement report and post-publication controls; ad-off emergency path. Google approval is an external review not a unit test.

## Launch gate
Produce readiness checklist with evidence and unresolved owners. No AdSense script/ads.txt changes involving real IDs without owner providing IDs and approving deployment. Validate `ads.txt` only when necessary and correct account info is available. Report that technical readiness does not equal approval.
