# Phase 1 Runbook — Prove the Deployment Pipeline

Operator runbook for TB-010 … TB-021 in [../TASK_BACKLOG.md](../TASK_BACKLOG.md).

Every step here needs privileges an assistant session does not have: the Docker
socket, `sudo`, the Cloudflare dashboard, or the authoritative DNS provider. Run them
yourself. Record each outcome in [../LIVE_WORKFLOW_ACCEPTANCE.md](../LIVE_WORKFLOW_ACCEPTANCE.md).

This runbook is the concrete command sequence for stage 5 ("Deploy") of the Ordered
Production Workflow in [../OPERATIONS_RUNBOOKS.md](../OPERATIONS_RUNBOOKS.md). It does not
replace that document — it sequences the pilot specifically.

## Recording rule

Capture command status, sanitized component names, timings, and expected-versus-actual
only. Never capture environment values, cookies, session identifiers, credentials,
private addresses, or raw tokens.

---

## Preconditions

All four must hold before step 1. Stop if any fails.

| #   | Check                               | Command                                                                                             | Expected                                                 |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| P1  | Phase 0 is merged and installed     | `git -C /opt/hellodeploy rev-parse HEAD`                                                            | The merged full SHA containing the `express@4.22.3` bump |
| P2  | Dependency audit is clean           | `npm audit --omit=dev --audit-level=moderate`                                                       | `found 0 vulnerabilities`                                |
| P3  | Services are active **and enabled** | `systemctl is-active hellodeploy-web hellodeploy-worker hellodeploy-nginx-helper` then `is-enabled` | `active` and `enabled` for all three                     |
| P4  | Worker can reach its dependencies   | `node scripts/check-worker-readiness.js`                                                            | `worker_ready=passed`                                    |

> P3 matters more than it looks. The 2026-08-28 outage happened because both units were
> `active` but `disabled`, so they did not survive a reboot.

**Queue state.** The queue is deliberately operator-paused. It stays paused until step 2.

---

## Step 1 — Verify the route helper before trusting it (TB-021 prerequisite)

Deployment #8 built, ran non-root, and passed its health check, then failed at route
activation because the host Nginx did not define `$connection_upgrade`. The template
now defines the map, but verify it on the live host before spending another build.

```bash
node scripts/verify-nginx-helper-live.js
```

Expected: a throwaway route `zz-hd-p2-routing-probe` is activated, `nginx -t` passes, and
the route is removed. Any failure stops Phase 1 — fix routing first, because a build that
cannot be routed is a wasted deployment.

Also re-confirm the GitHub App environment group, which is all-or-nothing and has been
found incomplete before (`GITHUB_APP_NAME` missing):

```bash
NODE_ENV=production node scripts/validate-config.js --require-production --component worker
```

Expected: `github-app: configured`.

---

## Step 2 — Resume the queue (TB-011)

```bash
node scripts/resume-deployment-queue.js
```

Expected: `queue_state=resumed`. `queue_state=unchanged` means it was already running.

**Rollback at any point below:**

```bash
node scripts/queue-maintenance.js pause-and-drain --state-file /tmp/hd-queue-state.json
```

---

## Step 3 — Take the pilot to HEALTHY (TB-010)

Trigger a redeploy of `hellouniversity-4e6a` from the dashboard. Watch the live log
stream on the deployment detail page.

Every prior failure has a fix in place. Use this table to recognise a regression versus a
new fault:

| Deployment | Failed at        | Cause                                                                           | Fixed by                                                               |
| ---------- | ---------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| #1–#5      | clone            | download timeout margin                                                         | TB-022 — default now 300s, `CLONE_DOWNLOAD_TIMEOUT_MS`                 |
| #6         | `npm ci`         | build ran with `--network none`; lifecycle scripts ran before source was copied | non-host default build network; source copied before lifecycle scripts |
| #7         | container start  | non-root container could not create an absent `uploads/`                        | application-side fix, merged                                           |
| #8         | route activation | host Nginx did not define `$connection_upgrade`                                 | platform ingress template defines the map — verified in step 1         |

Expected end state: status `HEALTHY`, an active container running as a non-root user, and
the managed hostname serving the application.

**On failure:** the pipeline fails closed and leaves the previous release untouched. Pause
the queue (step 2 rollback), capture the failure code and the sanitized log, and stop.
Do not retry blind — each of the eight prior attempts had a distinct cause.

---

## Step 4 — Confirm the release actually holds (TB-017)

Before broadening, prove the safety properties on this one release:

1. **Non-root:** `docker inspect --format '{{.Config.User}}' <container>` is not `root` or empty.
2. **Loopback only:** the published port binds `127.0.0.1`, never `0.0.0.0`.
3. **Resource limits:** `docker inspect` shows the memory, CPU and pids limits.
4. **No secrets leaked:** the build log, image history and process arguments contain no secret values.
5. **Failed-candidate continuity:** trigger a deliberately broken deploy and confirm the healthy release keeps serving throughout.

Step 5 of the Release Smoke Test in [../OPERATIONS_RUNBOOKS.md](../OPERATIONS_RUNBOOKS.md) has the
full command forms.

---

## Step 5 — Runtime matrix (TB-012)

No runtime has ever completed a deployment through the real worker. Prove each one, in
this order — cheapest and least likely to fail first:

- [ ] `STATIC`
- [ ] `REACT`
- [ ] `VUE`
- [ ] `EXPRESS`
- [ ] `NODEJS`
- [ ] `NEXTJS`

For each: one deployment to HEALTHY, correct routing, non-root identity. Record the build
duration — it feeds the `buildTimeoutSeconds` quota default.

---

## Step 6 — Rollback and retention (TB-013, TB-014)

1. Deploy twice so the project has two HEALTHY releases.
2. Roll back to the previous release from the dashboard. Expect the retained image to be
   reused rather than rebuilt, and the prior release to be marked rolled back.
3. Confirm retention keeps the last 3 HEALTHY releases and does **not** delete an image a
   rollback target still shares.

> Retention runs today only as part of an activation. The scheduled global sweep is
> TB-050 and is not yet released, so do not expect idle projects to be trimmed.

---

## Step 7 — Concurrency and interruption (TB-015, TB-016)

- **TB-015:** start two deployments simultaneously on different projects. Expect two
  distinct ports and no collision. The allocator tie-breaks on the lower `_id` and retries.
- **TB-016:** interrupt Docker mid-build. Expect the deployment to fail closed with no
  orphaned route, container, or active pointer.

---

## Step 8 — Public repository path (TB-020)

Connect a public GitHub repository by HTTPS URL and deploy it to HEALTHY. This path is
implemented and unit-tested but has never run live
(`../PUBLIC_GIT_REPOSITORY_SPEC.md`; UX-14 is _Partial_ for this reason).

---

## Step 9 — Custom domain cutover (TB-018)

The 11-step checklist from the Production Plan. **Do not compress it** — the 24-hour
observation window and the retained rollback path are the whole point.

- [ ] Keep the existing HelloUniversity hosting path unchanged and record the exact rollback.
- [ ] Deploy `hellouniversity-4e6a` and verify it through the platform application address.
- [ ] Observe the managed release long enough to confirm stable health, logs, resources, notifications.
- [ ] Confirm the authoritative nameservers for `hellouniversity.online`; edit DNS only there.
- [ ] Publish the exact HelloDeploy TXT record without touching unrelated DNS records.
- [ ] Run **Check DNS record**, wait for verified ownership, obtain administrator approval.
- [ ] Add the custom hostname to Cloudflare Tunnel ingress and the managed Nginx route.
- [ ] Verify HTTPS, content, health, redirects and behaviour at the apex; configure `www` as a permanent redirect to the apex.
- [ ] Test the documented route back to the former hosting path, then reapply the HelloDeploy route.
- [ ] Observe the managed custom domain for at least 24 continuously healthy hours.
- [ ] Remove the former route only after monitoring, rollback ownership and final owner approval are confirmed.

**TLS note.** Every generated Nginx server block listens on port 80 only; TLS terminates
at Cloudflare Tunnel. There is no ACME or origin-certificate path. A customer domain can
only be served if it is proxied through the platform's Cloudflare account — which is what
the administrator approval gate exists to enforce. Treat this as a product constraint, not
a step to work around.

---

## Step 10 — Re-run acceptance (TB-019)

Re-run [../LIVE_WORKFLOW_ACCEPTANCE.md](../LIVE_WORKFLOW_ACCEPTANCE.md) end to end and correct its
two stale rows. "Wildcard application ingress: Failed" and "Deployment: Failed" both date
from the five clone-stage failures and predate deployment #8.

---

## Exit criteria

Phase 1 is complete when all of the following hold:

1. HelloUniversity serves from `hellouniversity.online` through HelloDeploy, healthy for 24 continuous hours.
2. All six runtimes have deployed to HEALTHY at least once.
3. Rollback, retention, concurrent allocation and Docker interruption each have a recorded result.
4. `LIVE_WORKFLOW_ACCEPTANCE.md` has no stale `Failed` rows.
5. The queue is running and the former hosting path is retired.

Then update the status block in [../TASK_BACKLOG.md](../TASK_BACKLOG.md) and add a worklog entry.
