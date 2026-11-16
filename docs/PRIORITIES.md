# Priorities

Updated 2026-11-16 (code items cleared in #209–#216; #88 decided; `main` protected); last full review of the code, GitHub and
the docs on 2026-11-03. This is the single current
list of what to work on. Multi-runtime detail lives in
[multi-runtime/STATUS.md](multi-runtime/STATUS.md), owner inputs in
[implementation/USER_INPUT_REQUIRED.md](implementation/USER_INPUT_REQUIRED.md), and dated
evidence in the [worklog](../WORKLOG.md). The previous version, with the decisions closed on
2026-10-21 and 2026-10-22, is [archive/PRIORITIES_2026-10-28.md](archive/PRIORITIES_2026-10-28.md).

Keep this file short. Put evidence in the worklog, not here.

## Where things stand

- **Production** runs `main` through the CI-gated autodeploy timer
  ([Operations Runbooks › Automatic deploys](OPERATIONS_RUNBOOKS.md#automatic-deploys)). A red
  main CI silently stops deploys. Live customer apps include HelloRun, HelloPera, HelloEventHub and
  HelloUniversity.
- **Learning Hub**: `/blog` with five articles and view counts since 2026-10-29. Guest comments
  with OpenAI moderation, a profanity filter and Turnstile since 2026-11-01
  ([operations](learning-hub/OPERATIONS.md)).
- **Public content**: legal fixes, `/about`, `/features`, `/contact`, fuller docs, SEO and
  `/account`, deployed 2026-10-31 (#170–#176). Donations, GA4, AdSense and Search Console stay off
  until the owner supplies inputs.
- **Admin operations dashboard**: merged in seven stacked PRs, #197 to #203, and shipped by
  autodeploy. See
  [implementation/admin-operations-dashboard](implementation/admin-operations-dashboard/IMPLEMENTATION_PROGRESS.md).
  Account closure requests are listed with days left against the 30-day promise on the overview
  and in a queue at the top of the admin users list.
- **Multi-runtime**: every pilot flag is off. The builder control pilot runs one
  administrator-owned Next.js project; its 7-day watch ended 2026-11-01.

## Now — code

Nothing open. Take the next item from **Next**.

## Now — owner

- **Builder pilot close-out**: check the admin Build Service page (idle shutdowns, no unexpected
  cancels, the pilot app healthy) and say whether the watch passed.
- **Comment checks**: as a signed-out guest, a comment with a link is refused. The PM2 per-article
  pause works after **Save controls**. Remove leftover test comments in `/admin/learning-hub`.
- **Confirm `TURNSTILE_SECRET_KEY`** is set in `/opt/hellodeploy/.env`
  (`USER_INPUT_REQUIRED` B).

## Next

- **Scheduled backups** (owner picks an off-host destination): `infrastructure/backup.sh` runs
  only before upgrades. Add a timer, retention and an off-host copy, then do the restore drill on
  a clean host (#67).
- **Container isolation decision** (`TODO_USER_INPUT_ISOLATION_DECISION`): app containers have
  open outbound network access, a writable root filesystem outside static sites, no run-time
  non-root user, and no disk quota. Decide before opening to wider untrusted use.
- **GitHub App uninstall** (owner decision): uninstalling marks repositories `REVOKED`, which
  stops new deploys, but apps already running stay up. Decide whether uninstall should also stop
  them.
- **Renew the GHCR production token by 2027-01-09** (expires about 2027-01-23). Follow the
  lessons from the 2026-10-25 renewal outage
  ([evidence](multi-runtime/EVIDENCE.md)).
- **Owner inputs for public pages**: governing law, liability cap, legal review, operator status,
  GitHub App permission list, GA4 and consent, Search Console
  ([USER_INPUT_REQUIRED.md](implementation/USER_INPUT_REQUIRED.md)).
- **Acceptance evidence**: #65 (UI/UX sessions), #66 (runtime pilot matrix), then the final
  GO or NO-GO in #68.

## Paused — multi-runtime pilots

Paused by owner decision (2026-10-22) until a build host exists. The steps to turn them on (a
builder host, the GHCR deletion probe, the acceptance harness, one allowlisted project per
runtime, and the owner-image security review) are in [multi-runtime/STATUS.md](multi-runtime/STATUS.md)
and the [runbook](multi-runtime/BUILDKIT_GHCR_RUNBOOK.md).

## Later

- **Dependency majors**, one at a time: `resend` 6 (clears the 4 low audit findings), Express 5,
  Mongoose 9, BullMQ 6, ioredis 6, dotenv, connect-mongo, EJS, svix.
- **Installable dashboard (PWA)**, specified fresh.
- **HelloPera release API**: a fresh spec if HelloPera's gated release is wanted.
- **Admin domain tunnels table** prints a `sudo` command; it goes away with the admin tunnel step
  ([design](design/CUSTOM_DOMAINS_CLOUDFLARE_FOR_SAAS.md)).
- **Before owner images are generally available**: a builder per tenant or per build, and runtime
  egress filtering.
- **E2 per-repository clone cache**: only with evidence that fetch time matters.

## Product decisions

Closed 2026-11-16: `main` is protected (both CI checks required, no review, admins may bypass,
no force push or deletion; #62 keeps the rest of the older release design). Anonymized study
records are kept indefinitely, as `main` does since #116; #88 (5-year expiry) is closed unmerged.
Open: the backup destination, the container isolation
decision, whether uninstalling the GitHub App stops running apps, and the owner inputs above.
