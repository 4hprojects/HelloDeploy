# DNS Configuration

URL: `/docs/dns-configuration`

## SEO Title

`DNS Configuration for HelloDeploy | Verification and Routing Records`

## Meta Description

`Learn which DNS records a HelloDeploy custom domain needs, in what order to add them, and how to troubleshoot common DNS mistakes.`

## H1

`DNS Configuration`

## Intro

DNS tells browsers where a domain should send traffic. A HelloDeploy custom domain needs **two** records, added at two different points in the process:

1. a **TXT record** that proves you own the domain
2. a **CNAME record** that actually sends visitors to your deployment

Add them in that order. The CNAME target does not exist until your domain has been verified and approved.

## Record 1: TXT (ownership verification)

Added immediately after you add the domain in HelloDeploy. The exact value is shown on screen once and never again.

```text
Type: TXT
Name: _hellodeploy-verify.example.com
Value: hellodeploy-verify=[one-time value shown in HelloDeploy]
```

HelloDeploy checks this record when you select **Check DNS record**. If you lose the value before adding it, remove the domain and add it again to generate a new one.

## Record 2: CNAME (routing)

Shown only after verification succeeds and an administrator has approved and provisioned the domain.

```text
Type: CNAME
Name: example.com
Value: [tunnel-id].cfargotunnel.com
```

The tunnel id is specific to your domain. Copy it from the domain's page in HelloDeploy — never reuse one from another project or from documentation.

## Why There Is No A Record

HelloDeploy does not publish a server IP address for custom domains, and there is no A record to add. Traffic reaches the platform through a Cloudflare tunnel, which is addressed by hostname (`<tunnel-id>.cfargotunnel.com`), not by IP.

Do not instruct users to point an A record at any address.

## Cloudflare Account Requirement

A tunnel's routing record is accepted only inside the Cloudflare account that owns the zone. In practice this means the domain must be on Cloudflare, and provisioning involves the domain owner's own Cloudflare credentials.

State this as a prerequisite rather than letting users discover it partway through.

## Root Domain and www

Root and www are separate hostnames and each needs its own CNAME **and** its own tunnel ingress entry. Adding only the DNS record for `www` will not make it work if the tunnel was provisioned for the root alone.

If one works and the other does not, the missing piece is as likely to be tunnel configuration as DNS. Route these cases to support rather than to a DNS self-fix.

## Subdomains

A project subdomain on `hellodeploy.online` needs no DNS work at all — it is provided by the platform.

## Existing Records

A conflicting record at the same name (an old A record, a parked-page CNAME, a previous host's record) will prevent correct resolution. Remove it before adding the HelloDeploy record.

## DNS Propagation

Updates may take time, and different resolvers cache for different periods. Do not promise a fixed propagation time.

## Learn More

- `/learn/what-is-dns`
- `/learn/why-hellodeploy-uses-a-cname`
