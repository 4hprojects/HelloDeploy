# HelloDeploy Operations Runbooks

These runbooks cover routine platform operations for the single-server V1 deployment model.

The V1 production target is the complete self-hosted platform on one administrator-controlled Ubuntu host: privilege-separated web and worker services, the constrained Nginx helper, Docker, Nginx, and Cloudflare Tunnel. Do not use the superseded vendor-dashboard/remote-worker path as an installation shortcut. See [Product and Platform Architecture](PLATFORM_ARCHITECTURE.md).

## Ubuntu 26.04 In-Place Baseline

Ubuntu 26.04 is candidate-supported. The candidate flags permit deliberate validation on the current pilot; they do not establish general support.

Before any package, identity, service, Nginx, tunnel, or traffic change:

1. Run `npm run host:baseline -- --web-port <active-web-port> --json` to record the current full Git commit, worktree state, bounded service/dependency state, local `/health` and `/ready` results, and blocker codes. Run the public production checker separately. Evidence must contain statuses only, never environment values or private identifiers.
2. Create a protected backup of the current `.env`, repository release, Nginx dashboard configuration, Cloudflare Tunnel configuration, MongoDB state or verified external snapshot, and any existing HelloDeploy data. Verify its checksums and access controls before continuing.
3. Record rollback destinations for the repository checkout, repository-run web/worker command, Nginx site, tunnel configuration, and process startup mechanism.
4. Run `node scripts/preflight.js --json`. The Ubuntu 26.04 OS row must fail as candidate-only unless explicit acknowledgment is supplied.
5. After steps 1–3 pass, run `node scripts/preflight.js --allow-candidate-os --json`. Candidate acknowledgment changes only the OS gate; Docker and every other missing prerequisite must still fail independently.
6. Do not run the installer with `HELLODEPLOY_ALLOW_CANDIDATE_OS=true` until the tracker records the verified backup, immutable release, current health, and rollback commands.

Stop immediately if the backup cannot be verified, the current release is ambiguous, health is degraded, or any rollback destination is missing. Keep the current repository-run pilot and tunnel route in place until isolated candidate services pass readiness.

For the repository-run pilot, use `infrastructure/backup-pilot.sh` rather than the installed-host `backup.sh`. First create a root-owned destination directory that denies group and other access, import only the intended recipient's public GPG key into the root keyring, record its complete 40-character fingerprint, and verify the external database snapshot independently. Create a separate root-owned mode-`0600` text file containing the exact current repository path and full commit, existing web/worker startup mechanism, active Nginx/tunnel files, prior queue state, and the ordered recovery commands. Do not put credentials or secret values in that file.

The destination and instruction files can be prepared with `sudo install -d -m 0700 <destination>` and `sudo install -m 0600 /dev/null <rollback-instructions>`, followed by `sudoedit <rollback-instructions>`. Keep both outside the repository. Then run:

```sh
sudo bash infrastructure/backup-pilot.sh \
  --repo "$PILOT_REPO" \
  --output "$PROTECTED_DESTINATION/hellodeploy-pilot.tar.gz.gpg" \
  --gpg-recipient "$BACKUP_GPG_FINGERPRINT" \
  --nginx-config "$ACTIVE_DASHBOARD_NGINX_CONFIG" \
  --rollback-instructions "$PRIVATE_ROLLBACK_INSTRUCTIONS" \
  --external-database-snapshot-confirmed
```

Store the encrypted artifact on the approved off-host medium, unmount and remount or otherwise retrieve it, then run `bash infrastructure/verify-pilot-backup.sh <encrypted-artifact>` from a temporary GPG home containing the recovered private key. The verifier does not restore files or change services. Retrieval verification on the pilot host proves that the artifact and separately held key are usable; it does not satisfy the cross-host restore gate. Do not proceed based only on successful encryption.

Only after off-host storage and retrieval verification pass, create a root-owned mode-`0600` candidate configuration under a root-owned directory that is not group/other-writable. Preserve the existing cryptographic and integration values, set production-safe routing, and choose a candidate web port that does not conflict with the repository-run pilot. Run the installer with `HELLODEPLOY_PREPARE_ONLY=true`, `HELLODEPLOY_CONFIG_SOURCE`, the immutable release ref, and all three Ubuntu 26.04 acknowledgements. Preparation must leave the global Nginx include, platform ingress, and service activation unchanged. Its read-only prepared-foundation verifier must pass the expected full commit, identities, permissions, Docker allow/deny boundary, inactive/disabled units, absent helper socket, candidate port, existing Nginx syntax, and both production configuration checks before a separate activation workflow can be authorized.

Rollback from a failed pre-cutover candidate by stopping only the new HelloDeploy units, restoring the recorded Nginx and tunnel files, validating Nginx, restoring the prior repository release and command, and rechecking local and public health. Do not remove the pilot process or switch traffic until this recovery path has been rehearsed without secret exposure.

Record the following values outside the repository before rehearsal: the pilot's full commit, exact existing startup mechanism, encrypted artifact location, active dashboard Nginx file, active tunnel file, and whether the queue was already paused. Stop only the candidate `hellodeploy-*` units; never terminate the repository-run pilot until the candidate passes. If a cutover-stage check fails, restore the encrypted backup on an isolated staging path, install the recorded Nginx and tunnel files with their prior ownership/modes, run `nginx -t`, reload Nginx, restart the tunnel only if its file changed, restore the recorded full Git commit and locked dependencies, start the recorded pilot command, and require both local and public health before resuming the queue. Keep the queue paused if any rollback verification fails.

## Ordered Production Workflow

Run these stages in order and record each in the [Live Workflow Acceptance Checklist](LIVE_WORKFLOW_ACCEPTANCE.md):

1. **Preflight:** run the supported-host preflight. Stop on unsupported software, missing capacity/tools, or unsafe permissions.
2. **Configuration:** complete `.env`, enable the constrained local Nginx routing path, run web and worker validation with `--require-production` under their service identities, and resolve every `non-production`, `incomplete`, or invalid result.
3. **Install:** install one immutable tag or full commit with `npm ci`; do not continue from a dirty or moving checkout.
4. **Verify:** run the installed-host verifier and confirm identities, protected files, helper socket, Nginx, services, and `/ready`. Then run `npm run production:check -- https://your-platform-domain.example` from an external network. Stop if the web identity can access Docker or the route helper, or if HTTPS headers, readiness sanitization, or session-cookie attributes fail.
5. **Deploy:** deploy representative supported runtimes and confirm routing, non-root identity, loopback binding, resource limits, secret redaction, cleanup, and healthy-release continuity.
6. **Upgrade:** verify the backup, pause and drain the queue, activate the candidate, and restore prior queue state only after complete verification.
7. **Rollback:** on any candidate failure restore the previous full commit, locked dependencies, units, ingress, services, readiness, and prior queue state. Keep the queue paused on failed rollback verification.
8. **Backup:** create checksummed, encrypted, access-controlled off-host artifacts containing every required recovery component.
9. **Restore:** restore on a second clean supported host, redeploy a representative project, and record RPO/RTO.

For every stage capture only command status, sanitized component names, timings, and expected-versus-actual outcomes. Never capture environment values, cookies, session identifiers, credentials, private addresses, or raw tokens.

If the public check reports `session-cookie: missing secure`, confirm that the deployed process uses the supported `npm start` command or otherwise sets `NODE_ENV=production`. Confirm the immediate trusted ingress preserves `X-Forwarded-Proto: https`, restart or redeploy, and rerun the check. Do not work around the failure by disabling secure cookies, trusting arbitrary proxies, or recording a raw `Set-Cookie` header.

## Incident Response

1. Open `/admin/server` and check maintenance mode, queue state, host memory, disk, load, running apps, and failed jobs.
2. Enable maintenance mode if user mutations could make the incident worse.
3. Pause the deployment queue if Redis, Docker, Nginx, disk, or worker health is unstable.
4. Preserve logs and audit event correlation IDs. Do not paste secrets, tokens, database URLs, or private keys into tickets.
5. Suspend an abusive or unsafe project from `/admin/projects`; the worker should stop the container and serve the neutral suspension route.
6. Restore the last healthy route or rollback through the deployment UI when a project-specific release caused the incident.
7. Rotate affected credentials if a secret may have been exposed.
8. Record the root cause, corrective action, affected projects, and follow-up tests in `WORKLOG.md`.

## Backup

Back up these assets before upgrades and after major configuration changes:

- MongoDB Atlas backup/export for platform collections.
- `/etc/hellodeploy` protected configuration.
- `/etc/nginx/hellodeploy.d` generated HelloDeploy route files.
- Cloudflare Tunnel configuration and tunnel identifiers.
- `/var/lib/hellodeploy/releases` release metadata.
- Approved persistent project volumes if they are enabled in a later phase.

Do not rely on Docker images as the only backup. Source repositories and reproducible builds remain the primary recovery path.

## Restore

1. Put the platform into maintenance mode.
2. Pause the deployment queue.
3. Restore MongoDB data to the intended database.
4. Restore protected configuration and verify file permissions.
5. Restore Nginx HelloDeploy route files and run `nginx -t`.
6. Restart web, worker, Redis, Nginx, and Cloudflare Tunnel services as needed.
7. Open `/health` and `/admin/server`.
8. Resume the queue only after host, queue, and route checks pass.
9. Disable maintenance mode after a successful smoke test.

## Upgrade

1. Confirm the working tree is clean and the current release commit is recorded.
2. Back up MongoDB, configuration, Nginx route files, and release metadata.
3. Enable maintenance mode.
4. Let `infrastructure/upgrade.sh` pause the deployment queue and wait up to 10 minutes for active jobs to drain. Set `HELLODEPLOY_UPGRADE_DRAIN_TIMEOUT_MS` only when a documented workload needs a different 1-second to 1-hour deadline.
5. Pull or deploy the new release.
6. Run `npm ci --omit=dev` from the immutable release.
7. Run `npm run lint`, `npm run format:check`, and `npm test`.
8. Restart web and worker processes.
9. Check `/health`, `/admin/server`, queue status, and a known project route.
10. Confirm the script restored the queue's prior state, then disable maintenance mode. A queue that was already paused remains paused.

`infrastructure/upgrade.sh` automatically checks out the previous full commit when candidate installation or verification fails. It reinstalls locked dependencies, validates both service configurations, restores the previous service units and platform ingress, restarts services, and runs the complete installed-host verifier. It resumes the deployment queue only when the script paused it and rollback verifies successfully. Treat a `CRITICAL: rollback ... failed verification` message as an outage: keep the queue paused and inspect `journalctl -u 'hellodeploy-*'` before attempting another change.

## Rollback

1. Enable maintenance mode and pause the queue.
2. Restore the previous application release or Git commit.
3. Restore configuration only if the failed upgrade changed it.
4. Restore the release's systemd units and platform ingress, reload systemd, and restart the helper, web, and worker services.
5. Run the installed-host verifier, `/ready`, `/admin/server`, and one known project route smoke test.
6. Resume the queue and disable maintenance mode after checks pass.

## Uninstall

Use `infrastructure/uninstall.sh` for host cleanup. Before running it, back up MongoDB, Nginx route files, protected configuration, and any project volumes that must be retained.
