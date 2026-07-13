# HelloDeploy Self-Hosted Install Guide

HelloDeploy supports Ubuntu 22.04 and 24.04 for the V1 self-hosted edition.

Production installations require Node.js 22 and npm 10 or newer. The installer provisions Node.js 22 when needed, and preflight rejects unsupported major versions before making host changes.

License: MIT. See [`LICENSE`](../LICENSE).

## Install Modes

### Local-only

Use this mode for development, demos, or LAN-only testing.

- Public DNS is not required.
- Cloudflare Tunnel is not required.
- Nginx can be disabled or used only as a local reverse proxy.
- Custom domains should not be considered publicly reachable in this mode.

### Public IP

Use this mode when the server has a stable public IP and inbound HTTP/HTTPS traffic is allowed.

- Point the platform hostname to the server public IP.
- Point the wildcard app hostname to the server public IP.
- Configure TLS before production use.
- Keep existing non-HelloDeploy Nginx routes backed up and separate.

### Cloudflare Tunnel

Use this mode when the server should not expose inbound router ports.

- Route the platform hostname through the tunnel.
- Route wildcard app hostnames through the tunnel.
- Keep Cloudflare Tunnel configuration backed up outside the server.
- Use `/admin/server` to pause the queue or enable maintenance mode during tunnel incidents.

The supported V1 production topology installs the HelloDeploy web service, deployment worker, constrained Nginx helper, Docker, Nginx, and Cloudflare Tunnel on one administrator-controlled Ubuntu host. The processes retain separate service identities and privileges. See [Product and Platform Architecture](PLATFORM_ARCHITECTURE.md).

A vendor-hosted dashboard with a remote worker is not a supported V1 install mode. Managed MongoDB Atlas and managed TLS Redis may still be used as platform dependencies.

## Clean Install Steps

1. Start from a clean Ubuntu 22.04 or 24.04 server.
2. Run `node scripts/preflight.js` if the repo is already present, or run the installer preflight after cloning.
3. Set `HELLODEPLOY_RELEASE_REF` to a reviewed immutable tag or full commit SHA, then install with `sudo HELLODEPLOY_RELEASE_REF=<tag-or-commit> bash infrastructure/install.sh`.
4. Complete `node scripts/setup.js` when prompted by the installer.
5. Back up `HELLODEPLOY_MASTER_KEY` outside the server.
6. Seed the first Super Admin with `node scripts/seed-super-admin.js`.
7. Confirm `/health` returns `ok`.
8. Run `sudo bash infrastructure/verify-installation.sh` and resolve every failed identity, permission, service, Nginx, or readiness check.
9. Open `/admin/server` and verify queue, memory, disk, and maintenance controls.
10. Run `sudo bash infrastructure/backup.sh`.
11. Test restore on a second supported Ubuntu machine before production use.

## Planning Checklist

Generate a mode-specific install checklist without writing files:

```sh
node scripts/self-hosted-checklist.js --mode cloudflare_tunnel --domain hellodeploy.example.com
```

Machine-readable output:

```sh
node scripts/self-hosted-checklist.js --mode public_ip --domain hellodeploy.example.com --json
```

## Required Environment

The setup wizard and secret generator populate the production `.env`. Required keys include:

- `NODE_ENV`
- `PORT`
- `HOST`
- `PLATFORM_DOMAIN`
- `DEPLOYMENT_DOMAIN`
- `MONGODB_URI`
- `REDIS_URL` for managed Redis, or local `REDIS_HOST` and `REDIS_PORT`
- `SESSION_SECRET`
- `HELLODEPLOY_MASTER_KEY`
- `GITHUB_WEBHOOK_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_APP_NAME`
- `GITHUB_APP_PRIVATE_KEY_PATH`
- `RESEND_API_KEY`
- `TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `BUILD_WORKSPACE_ROOT`
- `RELEASE_METADATA_ROOT`
- `PROJECT_VOLUME_ROOT`
- `NGINX_HELLODEPLOY_CONFIG_DIR`
- `NGINX_ENABLED`
- `WORKER_CONCURRENCY`

Do not commit `.env`, generated private keys, tunnel credentials, MongoDB URLs, or webhook secrets.

## Backup And Restore

- Backup with local MongoDB dump: `sudo bash infrastructure/backup.sh`
- Backup with a separately verified Atlas/external snapshot: `sudo bash infrastructure/backup.sh --skip-database`
- Restore: `sudo bash infrastructure/restore.sh <backup-directory>`
- Upgrade: `sudo bash infrastructure/upgrade.sh --ref vMAJOR.MINOR.PATCH`
- Installed-host verification: `sudo bash infrastructure/verify-installation.sh`
- Rollback: use the previous release and `docs/OPERATIONS_RUNBOOKS.md`
- Uninstall: `sudo bash infrastructure/uninstall.sh`

Backups must include MongoDB data, protected configuration, Nginx route files, Cloudflare Tunnel configuration, and HelloDeploy release metadata.

`--skip-database` is an explicit acknowledgement that a current external database snapshot has already been verified. For non-interactive upgrades backed by external snapshots, set `HELLODEPLOY_DATABASE_BACKUP_MODE=external`; the default `local` mode requires `mongodump` to succeed. Backup directories contain secrets and must be transferred to an encrypted, access-controlled off-host destination.

Production upgrades must target an immutable release tag or full commit SHA according to [`RELEASE_POLICY.md`](RELEASE_POLICY.md); do not deploy an unreviewed moving branch.
