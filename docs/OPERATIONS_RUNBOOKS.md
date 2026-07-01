# HelloDeploy Operations Runbooks

These runbooks cover routine platform operations for the single-server V1 deployment model.

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
4. Pause the deployment queue and wait for active jobs to finish or fail safely.
5. Pull or deploy the new release.
6. Run `npm install` if dependencies changed.
7. Run `npm run lint`, `npm run format:check`, and `npm test`.
8. Restart web and worker processes.
9. Check `/health`, `/admin/server`, queue status, and a known project route.
10. Resume the queue and disable maintenance mode.

## Rollback

1. Enable maintenance mode and pause the queue.
2. Restore the previous application release or Git commit.
3. Restore configuration only if the failed upgrade changed it.
4. Restart web and worker processes.
5. Run `/health`, `/admin/server`, and one known project route smoke test.
6. Resume the queue and disable maintenance mode after checks pass.

## Uninstall

Use `infrastructure/uninstall.sh` for host cleanup. Before running it, back up MongoDB, Nginx route files, protected configuration, and any project volumes that must be retained.
