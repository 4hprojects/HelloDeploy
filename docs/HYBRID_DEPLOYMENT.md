# Hybrid Deployment Guide

This topology keeps the public dashboard on Render while a dedicated Ubuntu 22.04 or 24.04 host runs the Docker deployment worker, constrained Nginx helper, Nginx, and Cloudflare Tunnel. Render reachability is not evidence that the deployment plane works.

## Service Boundaries

| Boundary        | Render web                          | Ubuntu worker plane                              |
| --------------- | ----------------------------------- | ------------------------------------------------ |
| Public host     | `hellodeploy.online`                | `*.apps.hellodeploy.online`                      |
| Processes       | Express web only                    | Worker, Nginx helper, Nginx, Docker, tunnel      |
| Shared state    | MongoDB Atlas and managed TLS Redis | Same MongoDB database and Redis service          |
| Shared secret   | Identical `HELLODEPLOY_MASTER_KEY`  | Identical `HELLODEPLOY_MASTER_KEY`               |
| Host privileges | No Docker or route-helper access    | Worker receives constrained Docker/helper access |

Keep Render and Ubuntu environment files separate. Copy values through the providers' secret-management interfaces, never through source control, logs, screenshots, or worklog evidence.

## Required Configuration

Render web:

```dotenv
NODE_ENV=production
PLATFORM_DOMAIN=hellodeploy.online
PLATFORM_SUBDOMAIN_SUFFIX=.apps.hellodeploy.online
REDIS_URL=rediss://<managed-redis-credentials>
```

Ubuntu worker:

```dotenv
NODE_ENV=production
PLATFORM_DOMAIN=hellodeploy.online
DEPLOYMENT_DOMAIN=apps.hellodeploy.online
REDIS_URL=rediss://<the-same-managed-redis-service>
NGINX_ENABLED=true
```

Install and upgrade the Ubuntu plane with `HELLODEPLOY_HOST_ROLE=worker`. This prevents installation or restart of the web service and skips dashboard ingress on that host:

```sh
node --env-file=/secure/path/worker.env scripts/preflight.js --mode hybrid_worker

sudo HELLODEPLOY_HOST_ROLE=worker \
  HELLODEPLOY_RELEASE_REF=<immutable-tag-or-commit> \
  HELLODEPLOY_CONFIG_SOURCE=/secure/path/worker.env \
  bash infrastructure/install.sh

sudo HELLODEPLOY_HOST_ROLE=worker bash infrastructure/upgrade.sh --ref <immutable-tag-or-commit>
```

Both services require the same `MONGODB_URI` database, `HELLODEPLOY_MASTER_KEY`, GitHub App identity, and queue-compatible Redis service. The web additionally owns session, webhook, Turnstile, and dashboard email configuration. The worker requires the GitHub private key used to clone approved repositories. Never print either environment for comparison; validate names and bounded modes with `scripts/validate-config.js`.

`HELLODEPLOY_CONFIG_SOURCE` must be a root-readable file delivered through a secure channel. Worker-only installation copies it to `/opt/hellodeploy/.env` as `root:hellodeploy-config:640` and refuses to generate replacement secrets. Remove the source copy securely according to the host's secret-delivery procedure after installation succeeds.

## DNS and Routing

1. Route the dashboard hostname to Render through Cloudflare.
2. Route the wildcard `*.apps` hostname through a Cloudflare Tunnel installed on Ubuntu.
3. Point the tunnel wildcard ingress to Ubuntu Nginx.
4. Let the worker request per-project route activation through the local Unix-socket helper.
5. Keep the dashboard outside the worker-host Nginx configuration; application routes belong only to `DEPLOYMENT_DOMAIN`.

Custom domains must also terminate through the Ubuntu ingress path before the worker marks their routes active.

## Ordered Validation

1. Validate Render and worker configuration separately with `--require-production`.
2. Deploy the reviewed web release using `npm run start -w @hellodeploy/web`.
3. Run `npm run production:check -- https://hellodeploy.online`; stop if any public check fails.
4. Run `sudo HELLODEPLOY_VERIFY_ROLE=worker bash infrastructure/verify-installation.sh` on Ubuntu. It requires the worker/helper plane, accepts an absent isolated web identity, and fails if the web service is active there.
5. Confirm the worker connects to MongoDB and reports Redis mode `managed-tls-url` without exposing endpoints.
6. Deploy one noncritical application and confirm `https://<slug>.apps.hellodeploy.online` routes to a loopback-bound, non-root container.
7. Continue through every supported runtime, failed-candidate rollback, queue drain, upgrade rollback, encrypted backup, and second-host restore in the live acceptance checklist.

The hybrid deployment remains **NO-GO** until the public cookie, authenticated workflow, host isolation, real deployment, upgrade recovery, and restore rows all have direct evidence.
