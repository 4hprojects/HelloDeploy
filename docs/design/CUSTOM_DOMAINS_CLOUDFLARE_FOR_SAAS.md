# Custom Domains Without Admin Tunnels (Cloudflare for SaaS)

**Status:** built behind configuration (2026-10-14); enable with the runbook in `docs/OPERATIONS_RUNBOOKS.md`. Registration runs in the web app when the owner selects **Get my DNS record** or **Check routing**, not in the worker's verification job. **Written:** 2026-10-14.

## Problem

Connecting a custom domain needs an administrator today:

1. The owner verifies ownership with a TXT record (automatic).
2. An administrator creates a Cloudflare tunnel **inside the owner's Cloudflare account**, because Cloudflare accepts a proxied CNAME to `<tunnel-id>.cfargotunnel.com` only in a zone owned by the same account as the tunnel (`infrastructure/provision-custom-domain-tunnel.sh`). That needs the owner's Cloudflare credentials, a `cloudflared tunnel login`, a per-domain systemd connector on the host, and a manual "record tunnel" step in Admin → Domains.
3. Only then can the owner add the CNAME.

So every custom domain needs a conversation between the owner and an administrator, and its DNS must be hosted on Cloudflare. Owners expect something simpler: "point my domain at the address you give me". That's how most hosting platforms work. The helloeventhub.online setup on 2026-10-14 stalled at step 2.

## Proposal

Use **Cloudflare for SaaS (Custom Hostnames)** on the platform's own `hellodeploy.online` zone:

1. HelloDeploy creates a **fallback origin**, e.g. `customers.hellodeploy.online`, a proxied record served by the platform's existing tunnel to local nginx.
2. When an owner adds `example.com`, HelloDeploy calls the Cloudflare API (`POST /zones/:zone/custom_hostnames`) to register it as a custom hostname, with HTTP or TXT validation and Cloudflare-managed certificates.
3. The owner adds **one record at any DNS provider:** `CNAME example.com → customers.hellodeploy.online`, plus any validation record the API returns.
4. Cloudflare validates the hostname and issues its certificate. Requests then arrive through the platform tunnel with the original `Host`, and nginx routes them by `server_name` exactly as today (`generateCustomDomainServerBlock`, `apps/worker/src/nginx/template.js`).
5. HelloDeploy polls the custom hostname status and the existing routing probe (`X-HelloDeploy-Route`), and moves the domain to ACTIVE/LIVE without an administrator.

The owner's DNS no longer has to be on Cloudflare, no tunnel is created per domain, and HelloDeploy never touches the owner's Cloudflare account.

## What changes

| Area                 | Today                                       | With Cloudflare for SaaS                                                                                           |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Owner's DNS provider | Must be Cloudflare                          | Any                                                                                                                |
| Admin involvement    | Creates a tunnel per domain                 | None, except optional approval                                                                                     |
| Host processes       | One `cloudflared` connector per domain      | None new; the platform tunnel is reused                                                                            |
| CNAME target         | `<tunnel-id>.cfargotunnel.com` (per domain) | `customers.hellodeploy.online` (fixed)                                                                             |
| Certificates         | Owner's Cloudflare zone                     | Cloudflare-managed on the platform zone                                                                            |
| Ownership proof      | HelloDeploy TXT                             | Keep HelloDeploy TXT (it gates hostname claims across projects) and add Cloudflare's validation record if required |

Code areas:

- `apps/web/src/services/domain.service.js`: create and delete custom hostnames through the API; map Cloudflare `status`/`ssl.status` to `DomainStatus`; replace the "awaiting tunnel" state.
- Worker or scheduled job: poll pending hostnames, with backoff.
- `apps/web/src/views/pages/projects/domains.ejs`: step 4 shows the fixed CNAME immediately after ownership is verified.
- Admin → Domains: drop the tunnel column for new domains; keep it read-only for legacy tunnel domains.
- Config: `CLOUDFLARE_API_TOKEN` (Zone → SSL and Certificates: Edit, Custom Hostnames: Edit, on `hellodeploy.online` only), `CLOUDFLARE_ZONE_ID`, and `CUSTOM_HOSTNAME_TARGET`; documented in `docs/ENVIRONMENT.md`.
- Ops: one-time fallback-origin setup; the platform tunnel ingress must accept the fallback hostname.

## Constraints and risks

- **Apex domains:** `example.com` itself can only be a CNAME at providers with CNAME flattening or ALIAS/ANAME records (Cloudflare, DNSimple, Route 53 alias, and others). Elsewhere the owner points `www.example.com` and redirects the apex at their registrar; the page must explain this. Cloudflare's "apex proxying" with static IPs is Enterprise-only.
- **Cost:** the first 100 custom hostnames are included on all plans; beyond that there is a per-hostname monthly fee. Check current pricing before enabling.
- **Owners already on Cloudflare** whose zone proxies the hostname: Cloudflare supports this ("orange-to-orange"), but the owner's own zone settings then apply first. Document it and test with one such domain.
- **API failures and rate limits:** creation must be retryable and idempotent, and a failure must leave the domain in a clear "try again" state, never half-created.
- **Rollback:** keep the tunnel path working for existing domains until all of them are migrated. A feature flag decides which path new domains use.

## Migration

1. Ship behind a flag. New domains use custom hostnames; existing tunnel domains (hellopera.online and others in `/etc/nginx/hellodeploy.d/custom-*.conf`) keep working.
2. For each legacy domain: register the custom hostname, ask the owner to switch their CNAME to the fixed target, confirm LIVE with the routing probe, then retire its `cloudflared` connector with the existing revert scripts.
3. Remove the admin tunnel step once no domain depends on it.

## Effort and open questions

Estimated effort is **L** (multi-day): API client and status mapping, polling, page and admin changes, ops setup, and migrating the existing domains.

Open questions:

- Is `hellodeploy.online` on a Cloudflare plan with Custom Hostnames enabled?
- Is the fallback origin served by the existing dashboard tunnel or a separate one?
- Is admin approval still required before activation (the FAQ says so), or automatic after validation?
- Should `www` be added as a second hostname automatically?
