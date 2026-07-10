# Environment Variable Reference

All configuration is read from the process environment (a `.env` file at the repo root is loaded via `dotenv` by both apps). "Required (prod)" means startup fails without it when `NODE_ENV=production`; in development a safe default applies.

Source of truth: [apps/web/src/config/env.js](../apps/web/src/config/env.js) and [apps/worker/src/config/env.js](../apps/worker/src/config/env.js).

## Core

| Variable         | Used by     | Required (prod) | Default (dev)                           | Purpose                                                                             |
| ---------------- | ----------- | --------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| `NODE_ENV`       | web, worker | —               | `development`                           | Environment mode; `production` enables rate limiting, secure cookies, strict config |
| `PORT`           | web         | no              | `3000`                                  | Web server listen port                                                              |
| `HOST`           | web         | no              | `localhost`                             | Web server bind address                                                             |
| `MONGODB_URI`    | web, worker | **yes**         | `mongodb://127.0.0.1:27017/hellodeploy` | MongoDB connection string                                                           |
| `REDIS_HOST`     | web, worker | no              | `127.0.0.1`                             | Redis host (BullMQ queue, rate limiting, webhook dedup)                             |
| `REDIS_PORT`     | web, worker | no              | `6379`                                  | Redis port                                                                          |
| `REDIS_PASSWORD` | web, worker | no              | —                                       | Redis auth, if set                                                                  |
| `LOG_LEVEL`      | web, worker | no              | `debug` dev / `info` prod               | `error` \| `warn` \| `info` \| `debug`                                              |

## Security

| Variable                 | Used by     | Required (prod) | Default (dev)   | Purpose                                                                                                         |
| ------------------------ | ----------- | --------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`         | web         | **yes**         | dev placeholder | Session cookie signing secret                                                                                   |
| `HELLODEPLOY_MASTER_KEY` | web, worker | **yes**         | dev placeholder | Base64-encoded 32-byte master key encrypting environment secrets (`scripts/generate-secrets.js` can create one) |
| `TURNSTILE_SITE_KEY`     | web         | no              | —               | Cloudflare Turnstile site key (bot protection on auth forms); Turnstile disabled when unset                     |
| `TURNSTILE_SECRET_KEY`   | web         | no              | —               | Cloudflare Turnstile server secret                                                                              |

## Platform / routing

| Variable                       | Used by     | Required (prod) | Default                                                  | Purpose                                                                                                                     |
| ------------------------------ | ----------- | --------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PLATFORM_DOMAIN`              | web, worker | no              | `localhost:<PORT>` (web) / `hellodeploy.online` (worker) | Base domain for deployed app subdomains                                                                                     |
| `PLATFORM_SUBDOMAIN_SUFFIX`    | web         | no              | `.apps.hellodeploy.online`                               | Suffix shown for platform subdomains                                                                                        |
| `NGINX_ENABLED`                | worker      | no              | `false`                                                  | When `true`, the worker writes nginx server blocks and reloads nginx on activation                                          |
| `NGINX_DISABLED_ACK`           | worker      | no              | `false`                                                  | Set `true` to allow `NGINX_ENABLED=false` in production (routing handled externally); otherwise the worker refuses to start |
| `NGINX_HELLODEPLOY_CONFIG_DIR` | worker      | no              | `/etc/nginx/hellodeploy.d`                               | Directory for generated per-app nginx configs                                                                               |
| `NGINX_BINARY_PATH`            | worker      | no              | `nginx`                                                  | nginx binary used for `-t` validation and reload                                                                            |
| `NGINX_HELPER_SOCKET`          | worker      | no              | `/run/hellodeploy/nginx-helper.sock`                     | Local Unix socket used to request privileged Nginx route changes                                                            |
| `NGINX_HELPER_TIMEOUT_MS`      | worker      | no              | `15000`                                                  | Maximum time to wait for the local Nginx helper                                                                             |

## GitHub App

All optional in dev; required to use GitHub features (connect repo, webhooks, deploys).

| Variable                      | Used by     | Purpose                                                                  |
| ----------------------------- | ----------- | ------------------------------------------------------------------------ |
| `GITHUB_APP_ID`               | web, worker | GitHub App ID                                                            |
| `GITHUB_APP_NAME`             | web         | GitHub App slug (install links)                                          |
| `GITHUB_APP_PRIVATE_KEY_PATH` | web, worker | Path to the App's PEM (alternative: inline via `GITHUB_APP_PRIVATE_KEY`) |
| `GITHUB_APP_PRIVATE_KEY`      | web, worker | PEM contents, inline                                                     |
| `GITHUB_WEBHOOK_SECRET`       | web         | HMAC secret validating `X-Hub-Signature-256` on `/api/webhooks/github`   |

## Worker build/deploy

| Variable                | Required (prod) | Default                         | Purpose                                                    |
| ----------------------- | --------------- | ------------------------------- | ---------------------------------------------------------- |
| `WORKER_CONCURRENCY`    | no              | `1`                             | Parallel BullMQ jobs per worker process                    |
| `BUILD_TIMEOUT_MS`      | no              | `600000`                        | Hard cap on `docker build` duration                        |
| `BUILD_WORKSPACE_ROOT`  | no              | `/var/lib/hellodeploy/builds`   | Scratch dir for cloned build contexts                      |
| `RELEASE_METADATA_ROOT` | no              | `/var/lib/hellodeploy/releases` | Release metadata storage                                   |
| `PROJECT_VOLUME_ROOT`   | no              | `/var/lib/hellodeploy/projects` | Per-project persistent volumes                             |
| `PORT_RANGE_START`      | no              | `10000`                         | First loopback host port available for deployed containers |
| `PORT_RANGE_END`        | no              | `19999`                         | Last loopback host port available for deployed containers  |

## Email / notifications

| Variable         | Used by     | Default                      | Purpose                                                                                |
| ---------------- | ----------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | web, worker | —                            | Resend API key; email verification and deployment notifications are skipped when unset |
| `EMAIL_FROM`     | web, worker | `noreply@hellodeploy.online` | From address for outbound mail                                                         |

## Seeding (one-time)

Used only by `scripts/seed-super-admin.js`: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_FIRST_NAME`, `SUPER_ADMIN_LAST_NAME`.
