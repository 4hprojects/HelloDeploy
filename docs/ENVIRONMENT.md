# Environment Variable Reference

All configuration is read from the process environment (a `.env` file at the repo root is loaded via `dotenv` by both apps). "Required (prod)" means startup fails without it when `NODE_ENV=production`; in development a safe default applies.

Source of truth: [apps/web/src/config/env.js](../apps/web/src/config/env.js) and [apps/worker/src/config/env.js](../apps/worker/src/config/env.js).

## Core

| Variable         | Used by     | Required (prod) | Default (dev)                           | Purpose                                                                                |
| ---------------- | ----------- | --------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| `NODE_ENV`       | web, worker | —               | `development`                           | Environment mode; `production` enables rate limiting, secure cookies, strict config    |
| `PORT`           | web         | no              | `3000`                                  | Web server listen port                                                                 |
| `HOST`           | web         | no              | `localhost`                             | Web server bind address                                                                |
| `MONGODB_URI`    | web, worker | **yes**         | `mongodb://127.0.0.1:27017/hellodeploy` | MongoDB connection string                                                              |
| `REDIS_URL`      | web, worker | hybrid/managed  | —                                       | Preferred managed Redis connection; remote production connections must use `rediss://` |
| `REDIS_HOST`     | web, worker | no              | `127.0.0.1`                             | Legacy/local Redis host, used only when `REDIS_URL` is empty                           |
| `REDIS_PORT`     | web, worker | no              | `6379`                                  | Legacy/local Redis port                                                                |
| `REDIS_PASSWORD` | web, worker | no              | —                                       | Legacy/local Redis password                                                            |
| `LOG_LEVEL`      | web, worker | no              | `debug` dev / `info` prod               | `error` \| `warn` \| `info` \| `debug`                                                 |

`REDIS_URL` is authoritative when present, so stale legacy Redis fields cannot redirect a hybrid service. Production rejects `redis://` for a non-loopback endpoint and rejects non-loopback `REDIS_HOST`; use `rediss://` for managed Redis. Diagnostics and logs report only a bounded connection mode or error classification, never the URL, hostname, username, password, or provider endpoint.

## Security

| Variable                 | Used by     | Required (prod) | Default (dev)   | Purpose                                                                                                         |
| ------------------------ | ----------- | --------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| `SESSION_SECRET`         | web         | **yes**         | dev placeholder | Session cookie signing secret                                                                                   |
| `HELLODEPLOY_MASTER_KEY` | web, worker | **yes**         | dev placeholder | Base64-encoded 32-byte master key encrypting environment secrets (`scripts/generate-secrets.js` can create one) |
| `TURNSTILE_SITE_KEY`     | web         | no              | —               | Cloudflare Turnstile site key (bot protection on auth forms); Turnstile disabled when unset                     |
| `TURNSTILE_SECRET_KEY`   | web         | no              | —               | Cloudflare Turnstile server secret                                                                              |

## Platform / routing

| Variable                       | Used by     | Required (prod) | Default                               | Purpose                                                                                                                     |
| ------------------------------ | ----------- | --------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `PLATFORM_DOMAIN`              | web, worker | no              | dashboard host / `hellodeploy.online` | Public dashboard and authentication hostname; worker fallback for backward compatibility                                    |
| `DEPLOYMENT_DOMAIN`            | worker      | no              | worker `PLATFORM_DOMAIN`              | Wildcard application routing base; a project serves at `<slug>.<DEPLOYMENT_DOMAIN>`                                         |
| `PLATFORM_SUBDOMAIN_SUFFIX`    | web         | no              | `.apps.hellodeploy.online`            | Dashboard display suffix; keep equal to `.` plus `DEPLOYMENT_DOMAIN`                                                        |
| `NGINX_ENABLED`                | worker      | no              | `false`                               | When `true`, the worker writes nginx server blocks and reloads nginx on activation                                          |
| `NGINX_DISABLED_ACK`           | worker      | no              | `false`                               | Set `true` to allow `NGINX_ENABLED=false` in production (routing handled externally); otherwise the worker refuses to start |
| `NGINX_HELLODEPLOY_CONFIG_DIR` | worker      | no              | `/etc/nginx/hellodeploy.d`            | Directory for generated per-app nginx configs                                                                               |
| `NGINX_BINARY_PATH`            | worker      | no              | `nginx`                               | nginx binary used for `-t` validation and reload                                                                            |
| `NGINX_HELPER_SOCKET`          | worker      | no              | `/run/hellodeploy/nginx-helper.sock`  | Local Unix socket used to request privileged Nginx route changes                                                            |
| `NGINX_HELPER_TIMEOUT_MS`      | worker      | no              | `15000`                               | Maximum time to wait for the local Nginx helper                                                                             |

## GitHub App

The platform can start without a GitHub App, but repository connection, webhooks, and deployments require the complete integration. In production, configure every row in this group or leave the entire group empty; partial configuration fails validation. Use either the private-key path or the inline private key, not both.

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

Resend is optional. When `RESEND_API_KEY` is empty, outbound verification and deployment-notification email is skipped.

| Variable         | Used by     | Default                      | Purpose                                                                                |
| ---------------- | ----------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `RESEND_API_KEY` | web, worker | —                            | Resend API key; email verification and deployment notifications are skipped when unset |
| `EMAIL_FROM`     | web, worker | `noreply@hellodeploy.online` | From address for outbound mail                                                         |

## Configuration validation

Run `npm run config:check` after editing `.env`. The supported `npm start` commands force `NODE_ENV=production`; development remains available through `npm run dev`. Installation and upgrade additionally run `scripts/validate-config.js --require-production`, so they fail before service activation if the runtime is not actually in production mode. Production validation also rejects insecure remote Redis, missing or invalid startup values, partial conditional integrations, unreadable configured private keys, and routing disabled without `NGINX_DISABLED_ACK=true`. Diagnostics report configuration names and bounded statuses such as `production`, `managed-tls-url`, `configured`, `disabled`, or `incomplete`, never configured values.

After deploying a public release, verify the HTTPS, header, health, readiness, and session-cookie contract without printing cookie values:

```sh
npm run production:check -- https://your-platform-domain.example
```

## Seeding (one-time)

Used only by `scripts/seed-super-admin.js`: `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_FIRST_NAME`, `SUPER_ADMIN_LAST_NAME`.
