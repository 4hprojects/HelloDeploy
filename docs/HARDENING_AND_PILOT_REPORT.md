# HelloDeploy Hardening and Pilot Report

## Measurement Snapshot

Collected with:

```sh
node scripts/measure-capacity.js --json
```

Result on 2026-07-01T10:15:46.339Z:

| Metric                    |   Result |
| ------------------------- | -------: |
| CPU cores                 |        8 |
| 1 minute load             |     1.65 |
| 5 minute load             |     1.65 |
| 15 minute load            |     1.24 |
| Memory used               |      31% |
| Memory free               | 10626 MB |
| Workspace filesystem used |       5% |
| Workspace filesystem free | 894.1 GB |

HTTP sampling was not run in this pass because no web process was started for P11. Use:

```sh
node scripts/measure-capacity.js --url http://127.0.0.1:3000/health --requests 50 --concurrency 5 --json
```

## Operating Thresholds

These are conservative pilot thresholds until a real deployed sample application is measured:

- Keep deployment worker concurrency at `1`.
- Pause the queue when memory usage exceeds 85%.
- Pause the queue when the HelloDeploy data filesystem exceeds 85%.
- Investigate when failed jobs increase during a short pilot window.
- Keep retained healthy releases at the configured default of 3.
- Do not enable public custom-domain pilot traffic until Nginx and tunnel checks pass on the host.

## Failure Recovery Checklist

| Component         | Check                                                                                      | Current status                                                 |
| ----------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| MongoDB           | Confirm web startup and `/health` after temporary MongoDB disruption.                      | Not rerun in P11; requires configured service access.          |
| Redis             | Pause queue, restart Redis, confirm worker reconnects and queued jobs remain durable.      | Not rerun in P11; requires service control.                    |
| Docker            | Restart Docker daemon during no active deployment, confirm worker reports failures safely. | Not rerun in P11; requires Docker daemon control.              |
| Nginx             | Force invalid generated route in a staging config and confirm rollback.                    | Covered by unit tests; host-level `nginx -t` not rerun in P11. |
| Worker            | Stop worker during queued job, restart, confirm job retry behavior.                        | Not rerun in P11; requires running Redis and worker.           |
| Cloudflare Tunnel | Stop tunnel and confirm platform remains safe while public ingress is unavailable.         | Not rerun in P11; requires tunnel service control.             |

No critical security test failure is known from the local test suite. Full tests passed in the P11 verification run.

## Pilot Deployment Checklist

Use a noncritical static or Express sample application.

1. Create a verified normal user.
2. Create a project draft.
3. Connect an approved GitHub repository.
4. Run detection and confirm the proposed runtime/configuration.
5. Submit the project for review.
6. Approve the project as Super Admin.
7. Deploy manually as Owner.
8. Confirm the deployment becomes healthy without manual Docker or Nginx commands.
9. Invite a Maintainer and confirm redeploy works.
10. Invite a Viewer and confirm read-only visibility.
11. Deploy a broken commit and confirm the active release remains available.
12. Roll back from the retained healthy release.
13. Suspend and reactivate the project from the admin UI.
14. Record timings, failures, and user friction in `WORKLOG.md`.

The pilot is not complete until the checklist is executed against a real noncritical repository on the target host.
