# Learning Hub Operations

For operators of hellodeploy.online. Environment variables are in
[ENVIRONMENT.md › Learning Hub](../ENVIRONMENT.md#learning-hub-web).

## What is on in production

| Capability            | Control                                                               | State shipped                               |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| Blog pages at `/blog` | `LEARNING_HUB_ENABLED`                                                | On after the Phase 8 release (code default) |
| View counts           | `LEARNING_HUB_VIEWS_ENABLED`                                          | On after the Phase 8 release (code default) |
| Guest comments        | `LEARNING_HUB_COMMENTS_ENABLED` + provider + Turnstile + admin switch | **Off**                                     |
| GA4 analytics         | `GA4_MEASUREMENT_ID`                                                  | **Off** (no id, no consent mechanism)       |
| AdSense ads           | `ADSENSE_ENABLED`                                                     | **Off** (not approved)                      |

## Emergency: stop guest comments

1. Open `/admin/learning-hub` as any administrator.
2. Tick **Pause new comments and replies on every article** and select **Save controls**.
   Submissions stop within five seconds. Published comments stay readable and reportable.
3. Hide or remove abusive comments from the **Reported** or **Published** tab. Each action writes
   an `admin.learning_hub_comment_*` audit event; **Restore** reverses hide or remove.

If the admin page is unreachable, set `LEARNING_HUB_COMMENTS_ENABLED=false` in
`/opt/hellodeploy/.env` and restart `hellodeploy-web`; the discussion section disappears.

## How a comment is decided

In order, all on the server: feature flag, article opt-in and admin switch → CSRF → rate limits
(3 per 10 minutes and 10 per hour per address, Redis-backed, fail closed) → input validation →
Cloudflare Turnstile Siteverify (action `blog-comment`, hostname checked, single use) →
idempotency key → rule screening (links, contact details, promotion, floods; lookalike letters
and invisible characters folded first) → duplicate text within 24 hours → contextual moderation
provider → publish. A provider timeout, error, or missing configuration refuses the comment.

Rejected submissions are deleted automatically after 7 days. Reports are kept 90 days. No raw IP
address or session id is stored with a comment, report, or view.

Reports never hide a comment by count. A report re-runs moderation; only an `unsafe` verdict
hides the comment (`learning_hub.comment_auto_hidden` audit event), and an administrator can
restore it.

## Enabling guest comments (owner decision)

Needs, in this order: an approved moderation provider and its key, the privacy policy updated for
that provider, `LEARNING_HUB_MODERATION_PROVIDER` and the key in `/opt/hellodeploy/.env`,
`LEARNING_HUB_COMMENTS_ENABLED=true`, a web restart, `commentsEnabled: true` on chosen
articles, and a production smoke test (one safe comment publishes, one link is refused, one
report is recorded, pause stops submissions). Turnstile keys already exist in production.

## Rollback

Flags first: they take effect on restart and leave data in place. Collections
`article_stats`, `article_comments`, and `article_comment_reports` and the `platform_settings`
key `learningHubComments` are additive; an older release ignores them, so redeploying the
previous commit needs no data change.
