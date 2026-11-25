# Priorities

Updated 2026-11-25 (full review of every to-do source and owner status answers). This is the
single current list of what to work on. Multi-runtime detail lives in
[multi-runtime/STATUS.md](multi-runtime/STATUS.md), owner inputs in
[implementation/USER_INPUT_REQUIRED.md](implementation/USER_INPUT_REQUIRED.md), and dated
evidence in the [worklog](../WORKLOG.md). The previous version is
[archive/PRIORITIES_2026-11-16.md](archive/PRIORITIES_2026-11-16.md).

Keep this file short. Put evidence in the worklog, not here.

## How to-do packages are handled

`docs/todo/` holds a package only while its work is open. When a package is finished, the same
PR moves it to its initiative folder or to [archive/](archive/README.md) and updates this file,
the [documentation index](README.md) and the initiative tracker. On 2026-11-25 every package was
finished or moved, so `docs/todo/` no longer exists.

## Where things stand

- **Production** runs `main` through the CI-gated autodeploy timer
  ([Operations Runbooks › Automatic deploys](OPERATIONS_RUNBOOKS.md#automatic-deploys)). A red
  main CI silently stops deploys. Live customer apps include HelloRun, HelloPera, HelloEventHub and
  HelloUniversity. A 2026-11-21 nginx upgrade stopped the worker for two days; #238 fixed it.
  Check the systemd units, not only `/health`. Source archives are cached since #239.
- **Learning Hub**: `/blog` with 15 articles, including the ten-article cybersecurity series
  published 2026-11-20 (#227–#237; [plan](learning-hub/CYBERSECURITY_SERIES_PLAN.md)). Guest
  comments with moderation since 2026-11-01 ([operations](learning-hub/OPERATIONS.md)).
- **Analytics and ads**: GA4 with Consent Mode v2 on public pages (#224) is live; the owner set
  the production variables. AdSense code is ready behind flags (#222, #223); the owner applied on
  2026-11-21 and Google's review is still pending (2026-11-25).
- **Backups**: daily encrypted off-host backups are running. The restore drill is still open.
- **Multi-runtime**: every pilot flag is off. The builder control pilot (one administrator-owned
  Next.js project) passed its watch; the owner confirmed on 2026-11-25.
- **Hello Motion**: done for HelloDeploy (#243, #244). The deployment page now shows live
  stage progress ([audit](hello-motion/00_AUDIT_REPORT.md)).
- **Docker optimization**: `optimized-v1` stays opt-in per project by owner decision
  (2026-11-25). P2–P5 are deferred.

## Now — code

Nothing open. #204 (production check treats admin, deployment and environment bundles as
page-scoped) merged 2026-11-25. Take the next item from **Next**.

## Now — owner

- **Comment checks**: as a signed-out guest, a comment with a link is refused. The per-article
  pause works after **Save controls**. Remove leftover test comments in `/admin/learning-hub`.
- **GA4 console settings**: data retention 14 months, enhanced-measurement site search and form
  interactions off, mark `sign_up_click` as a key event once it arrives
  ([ADSENSE_READINESS.md](learning-hub/ADSENSE_READINESS.md)).

## Next

- **Renew the GHCR production token by 2027-01-09** (expires about 2027-01-23). Follow the
  lessons from the 2026-10-25 renewal outage ([evidence](multi-runtime/EVIDENCE.md)).
- **Backup restore drill** on a clean host (#67)
  ([Operations Runbooks › Scheduled off-host backups](OPERATIONS_RUNBOOKS.md#scheduled-off-host-backups)).
- **AdSense follow-up** (after Google's decision): if approved, mark articles `adEligible` and set the slot id and
  `ADSENSE_ENABLED` ([ADSENSE_READINESS.md](learning-hub/ADSENSE_READINESS.md)). If rejected, fix
  the stated reason and reapply.
- **Owner inputs for public pages**: governing law, liability cap, legal review, operator status,
  GitHub App permission list, Search Console, donations
  ([USER_INPUT_REQUIRED.md](implementation/USER_INPUT_REQUIRED.md)).
- **Dependency majors**: all done (#246–#254, 2026-11-26). Remaining minor: `argon2` 0.41 →
  0.45, with a hash-compatibility check first.
- **Acceptance evidence**: #65 (UI/UX sessions), #66 (runtime pilot matrix), then the final
  GO or NO-GO in #68.
- **Re-check version-sensitive article facts by 2027-04-30** (Node and npm flags, nginx
  versions, the OWASP and agentic lists).

## Paused — multi-runtime pilots

Paused by owner decision (2026-10-22) until a build host exists. The steps to turn them on (a
builder host, the GHCR deletion probe, the acceptance harness, one allowlisted project per
runtime, and the owner-image security review) are in [multi-runtime/STATUS.md](multi-runtime/STATUS.md)
and the [runbook](multi-runtime/BUILDKIT_GHCR_RUNBOOK.md).

## Later

- **Docker optimization P2–P5** (cache, metrics, retention, rollout): only if build time or disk
  space becomes a real problem ([tracker](docker-optimization/IMPLEMENTATION_TRACKER.md)).
- **Installable dashboard (PWA)**, specified fresh.
- **HelloPera release API**: a fresh spec if HelloPera's gated release is wanted.
- **Admin domain tunnels table** prints a `sudo` command; it goes away with the admin tunnel step
  ([design](design/CUSTOM_DOMAINS_CLOUDFLARE_FOR_SAAS.md)).
- **Before owner images are generally available**: a builder per tenant or per build, and runtime
  egress filtering.
- **E2 per-repository clone cache**: only with evidence that fetch time matters.
- **More cybersecurity articles** from the evergreen backlog, on request.

## Product decisions

Closed 2026-11-25: builder pilot watch passed; `optimized-v1` stays opt-in.

Closed 2026-11-16: `main` is protected (both CI checks required, no review, admins may bypass,
no force push or deletion; #62 keeps the rest of the older release design). Anonymized study
records are kept indefinitely, as `main` does since #116; #88 (5-year expiry) is closed unmerged.
Backups go daily to an encrypted S3-compatible bucket (Backblaze B2 recommended) and are kept 14
days. Container isolation (egress limits, non-root, disk quota) is deferred until access opens to
untrusted users. Uninstalling the GitHub App keeps running apps up; only new deploys stop.

Open: the owner inputs above.
