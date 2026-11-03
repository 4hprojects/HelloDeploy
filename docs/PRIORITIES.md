# Priorities

Updated 2026-11-03 after a full review of the code, GitHub and the docs. This is the single current
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
- **Multi-runtime**: every pilot flag is off. The builder control pilot runs one
  administrator-owned Next.js project; its 7-day watch ended 2026-11-01.

## Now — code (in this order, one PR each)

1. **A failed delete teardown cannot be retried.** Database records go as soon as the
   teardown job is queued. After its 3 attempts fail, leftover containers or routes are recorded
   only in a `project.infrastructure_teardown` FAILURE audit event, and no admin page retries
   it. Needs a deleting state that the worker finalises, or an admin retry of failed jobs.
2. **Mask secret values in deploy logs.** `apps/worker/src/deployment/log-capture.js` only
   redacts by pattern, so an app that prints a secret value stores it in the logs.
3. **Flag a production install without Turnstile.** Auth Turnstile fails open when the secret is
   unset (`turnstile.service.js`), and `config:check` still passes.
4. **Account closure queue.** Show requests with days left against the 30-day promise in the
   admin users list; today there is only a badge.

## Now — owner

- **Builder pilot close-out**: check the admin Build Service page (idle shutdowns, no unexpected
  cancels, the pilot app healthy) and say whether the watch passed.
- **Comment checks**: as a signed-out guest, a comment with a link is refused. The PM2 per-article
  pause works after **Save controls**. Remove leftover test comments in `/admin/learning-hub`.
- **Confirm `TURNSTILE_SECRET_KEY`** is set in `/opt/hellodeploy/.env`
  (`USER_INPUT_REQUIRED` B).
- **Branch protection on `main`** (#62): none is set. The repository is public, so it is free.
  Recommended: require the `Lint & Test (22.x)` and CodeQL checks, with no required review so
  merges stay self-service.
- **#88**: keep study records for 5 years, or indefinitely as `main` does since #116.

## Next

- **Scheduled backups** (owner picks an off-host destination): `infrastructure/backup.sh` runs
  only before upgrades. Add a timer, retention and an off-host copy, then do the restore drill on
  a clean host (#67).
- **Container isolation decision** (`TODO_USER_INPUT_ISOLATION_DECISION`): app containers have
  open outbound network access, a writable root filesystem outside static sites, no run-time
  non-root user, and no disk quota. Decide before opening to wider untrusted use.
- **Webhook hardening**: rate-limit `/api/webhooks/resend`. Make the GitHub webhook limiter fail
  closed, or cap its body size below 25 MB. Limit deploy hooks per project, not only per IP.
  Handle GitHub App `unsuspend`, and stop apps on uninstall.
- **Test gaps**: `env-secret.service.js`, `approval-readiness.service.js`,
  `session-revocation.service.js`, `oci-image.js`, `project-route-lock.js`.
- **Script headroom**: `js/app.js` has 127 bytes left. Move a page-specific part (for example
  the password strength bar or the repository branch loader) into a page-scoped script before the
  next dashboard script change. `css/main.css` has 3.4 KB again since `auth.css` became its own
  bundle.
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

Open: #88 retention period, the backup destination, the container isolation decision, and the
owner inputs above.
