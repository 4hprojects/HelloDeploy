# Priorities

Updated 2026-10-21. This is the single current list of what to work on. Detailed status for
the multi-runtime initiative lives in [multi-runtime/STATUS.md](multi-runtime/STATUS.md);
dated evidence lives in the [worklog](../WORKLOG.md) and each initiative's evidence file.
Earlier trackers and audits are in the [archive](archive/README.md); the previous version of
this file, including its long "recently resolved" history, is
[archive/PRIORITIES_2026-10-15.md](archive/PRIORITIES_2026-10-15.md).

Keep this file short. Put evidence in the worklog, not here.

## Where things stand

- **Production** runs `main` through the CI-gated autodeploy timer
  ([Operations Runbooks › Automatic deploys](OPERATIONS_RUNBOOKS.md#automatic-deploys)). Live
  customer apps include HelloRun, HelloPera, HelloEventHub and HelloUniversity.
- **Multi-runtime deployments** (Next.js modes, Python, PHP, Java, owner Dockerfiles and
  prebuilt images) are merged and deployed with every pilot flag off. No user sees them until a
  flag and project allowlist are set. See the [summary](multi-runtime/README.md).
- **Email** delivers: Resend reports `email.delivered` for production sends, with signed
  webhooks processed (checked 2026-10-21).
- **Database isolation** is done: production moved from the shared `hellotasks` database to
  `hellodeploy_db` on 2026-09-02 ([worklog](../WORKLOG.md)).

## Now

1. **Rotate the GitHub webhook secret (owner action).** Every GitHub delivery to production
   has been rejected since at least 2026-07-31, so push-to-deploy and repository access updates
   never arrive. The cause is a mismatch between `GITHUB_WEBHOOK_SECRET` on the server and the
   GitHub App's secret; the code is correct. Follow
   [Operations Runbooks › GitHub webhooks rejected](OPERATIONS_RUNBOOKS.md#github-webhooks-rejected-rotate-the-webhook-secret).
   The admin Server page now shows webhook health, so this cannot go unnoticed again.

2. **Replace nginx's stock default site (owner action, sudo).** Unknown hostnames such as
   `anything.hellodeploy.online` get nginx's "Welcome to nginx!" page with HTTP 200 from
   `/etc/nginx/sites-enabled/default`. Replace its `server` body with `return 404;` (keep
   `listen 80 default_server; server_name _;`), then `sudo nginx -t && sudo systemctl reload nginx`.
   While there, check whether the older `sites-enabled/hellorun` and `hellotasks` sites from
   before HelloDeploy are still needed.

## Next — to turn on the multi-runtime pilots

3. **Provision the nonproduction builder and registry**: rootless BuildKit with mTLS and
   resource limits, builder egress limited to package hosts, ORAS on the worker, and a private
   GHCR repository with a least-privilege token
   ([runbook](multi-runtime/BUILDKIT_GHCR_RUNBOOK.md)).
4. **Run runbook step 7** to choose `REGISTRY_DELETE_API` (`oci` or `github-packages`) from a
   live GHCR deletion probe, including the referrers fallback tag.
5. **Run the nonproduction acceptance harness** (`npm run acceptance:multi-runtime`) with the
   disruptive cases, and record build time and memory per framework.
6. **Enable one allowlisted project per runtime** with `WORKER_CONCURRENCY=1`, following the
   stop procedure in the runbook.
7. **Before the owner-image pilots (P4):** a human security review of the
   [owner-image threat model](multi-runtime/THREAT_MODEL.md), Trivy installed with its database,
   every fail-closed case run live, and Docker Hub anonymous pull limits measured.

## Later

- **Before owner images are generally available:** a builder per tenant or per build (the
  shared BuildKit cache is reachable through `ONBUILD`), and runtime egress filtering for app
  containers.
- **E2 — per-repository clone cache.** Deliberately deferred (re-checked 2026-10-21): public
  repositories download an exact-commit archive and private ones fetch only that commit
  (`--depth 1`), and a shared cache needs lock-safe concurrency on the most critical path.
  Revisit only with evidence that fetch time matters.
- **Assistive-technology pass** of the dashboard with a real screen reader. The automated axe
  and keyboard checks were re-run on 2026-10-22: all pass (`npm run test:browser`, 31 of 33;
  the two failures are the screenshot baselines, which only match on the CI runner).

## Decided and closed (2026-10-21)

- **Post-merge deploy and rollback check passed** (2026-10-22). HelloEventHub deployed release 25
  at 00:13 and release 26 at 00:34, then rolled back to release 25 at 07:28 using its retained
  image, without a rebuild. Each run passed its health check, swapped containers, and sent the
  result email, and the app answered 200 afterwards.
- **P5 open questions decided** (recorded in
  [P5_COMPOSE_ADR.md](multi-runtime/P5_COMPOSE_ADR.md#decisions-on-the-open-questions-2026-10-22)):
  the public service is the one declaring `ports`; three services, configurable; private
  services get no outbound access by default. P5 stays behind its entry gate.
- **Legal copy for owner images drafted** in
  [LEGAL_POLICIES.md](LEGAL_POLICIES.md#owner-supplied-images-coverage), to go onto the public
  policy pages when the Dockerfile and prebuilt-image pilots open; counsel review still applies.
- **HelloUniversity custom domain confirmed.** `hellouniversity.online` serves the same app as its
  platform address `hellouniversity-4e6a.hellodeploy.online`, through HelloDeploy's custom-domain
  route; the HelloDeploy container is the only HelloUniversity process on the host, so there is
  no old host to retire.
- **Default image template — keep `legacy`.** Changing the production default would alter every
  existing build at once, against the docker-optimization plan's per-project canary first.
  Instead, detection now warns when a Next.js repository has no `public/` folder (the one
  `legacy` limitation users hit), and the runbook explains per-project opt-in to `optimized-v1`.
- Landing-page performance headroom was a measurement artefact: the Lighthouse lab served the
  110 KB stylesheet uncompressed, while production serves it Brotli-compressed (18 KB). The lab
  fixture now compresses like production; the mobile median LCP is 1.42 s against the 2.5 s
  budget.
- About 5% of web-vitals beacons (36 of 764 in two weeks) are rejected by CSRF. They come from
  pages whose session changes as they unload (signing in or out), so the beacon carries the old
  page's token. Exempting telemetry from CSRF would let anyone forge metrics; accepted as is.
- Bot probes such as `POST /xmlrpc.php` now get a 403 page instead of a 500: request-independent
  view locals are set on `app.locals`, so pages rendered before the locals middleware work.
- The deployment log "● Live" indicator is now a polite status region with the dot hidden from
  screen readers.
- `getUserProjects` was unused outside its own test and has been removed rather than optimized.
- `requireProjectRole` keeps its two queries: the membership lookup needs the project id first,
  and both are indexed single-document reads, so an aggregation would save about a millisecond.

## Product decisions

None open. The decisions made on 2026-10-22 under delegation are listed under "Decided and
closed".
