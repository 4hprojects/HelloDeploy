# Learning Hub — Blockers and Owner Handoff

Updated 2026-11-03. The blog and view counts are on (2026-10-29), and guest comments are on
with OpenAI moderation (2026-11-01). GA4 and AdSense stay off. Each open item below needs the
owner; none is blocked by code.

## 0. Merge the release (owner)

Done 2026-10-29: merged as `3309c51` and deployed by autodeploy. Kept for reference. Release
candidate `0b0dd13de1faf7368c2c61e65c87fd9da8ee726c` passed full CI. To release:

```sh
gh pr ready 165
gh pr merge 165 --squash
```

Autodeploy deploys the merged `main` commit after `ci.yml` passes on it (with its own backup
and automatic rollback). Confirm with `journalctl -u hellodeploy-autodeploy.service -n 20` and
`npm run production:check -- https://hellodeploy.online --expected-sha <merged-sha>`.
Rollback reference: `2b54d220344bcbaed94e08b8468480883651b3af`.

## 1. Turn on the public blog (done)

Done 2026-10-29: `/blog` serves the five articles. **Undo:** remove `LEARNING_HUB_ENABLED=true`
and `LEARNING_HUB_VIEWS_ENABLED=true` from `/opt/hellodeploy/.env` and restart
`hellodeploy-web`. Post-enable checks are in [Release record › After enabling](#after-enabling).

## 2. Guest comments (live)

Live since 2026-11-01. The owner approved OpenAI moderation, set the provider, key and enable
flags in `/opt/hellodeploy/.env`, and restarted the web service. Owner tests on the live site
confirmed published comments, the profanity filter (guests and staff, #179 and #181), Philippine
time stamps (#180), and the refusal dialog with the Acceptable Use Policy notice (#182 to #186).
Still to confirm: a guest comment with a link is refused, and the per-article pause takes effect
after **Save controls**. Emergency stop: [OPERATIONS.md](OPERATIONS.md#emergency-stop-guest-comments).

## 3. GA4 (stays off)

Missing: a measurement id and a consent mechanism. Set `GA4_MEASUREMENT_ID` and
`LEARNING_HUB_ANALYTICS_CONSENT_READY=true` only when both exist.

## 4. AdSense (stays off)

Missing: account approval, a certified consent platform for EEA/UK/CH visitors, CSP additions
for ad hosts (code change), ids, and `ads.txt`. See [ADSENSE_READINESS.md](ADSENSE_READINESS.md).
Also add truthful `/about` and `/contact` pages before applying.

## 5. Review legal text

`/privacy` and `/cookies` were updated on 2026-10-29 for Learning Hub data and to list
Cloudflare Turnstile. All policy pages were expanded on 2026-10-30 (PR #167). The owner accepted
the wording for now and will send refinements. Still open: one spelling of the operator name,
and a named governing law in the Terms.

## Release record

Deployed 2026-10-29 as `3309c51d2c4b5c62016446d612dc4d422d70ef72`; backup
`/var/backups/hellodeploy/20261029_230800`; rollback reference `2b54d22`. Details in the final
entry of [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).

### After enabling

- `/blog`, each `/blog/<slug>`, `/blog/category/<slug>` return 200; an unknown slug returns 404.
- `/sitemap.xml` lists the five articles; each article page has `og:type` `article`, a
  canonical URL, and two JSON-LD blocks.
- `/assets/blog/social/<slug>.png` returns 200.
- `npm run production:check -- https://hellodeploy.online --expected-sha <sha>` passes.
- Dashboard and a deployment page still load for a signed-in user.
