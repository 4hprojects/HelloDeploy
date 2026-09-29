DNS is how a domain name turns into an instruction about where to send traffic. A HelloDeploy
custom domain needs two records, added at two different points.

## Record 1: TXT, to prove ownership

Added immediately after you add the domain. The value is shown once and never again.

```text
Type:  TXT
Name:  _hellodeploy-verify.example.com
Value: hellodeploy-verify=[one-time value from HelloDeploy]
```

HelloDeploy checks this when you select **Check DNS record**.

## Record 2: CNAME, to route traffic

Shown only after verification succeeds and an administrator has provisioned the domain.

```text
Type:  CNAME
Name:  example.com
Value: [tunnel-id].cfargotunnel.com
```

The tunnel id belongs to your domain alone. Copy it from your domain's page.

## There is no A record

HelloDeploy does not publish a server IP address, so there is nothing to point an A record
at. Traffic arrives through a Cloudflare tunnel, which is addressed by hostname rather than
by IP.

If a guide tells you to point an A record at a hosting provider's IP, it is not describing
HelloDeploy.

## Your domain must be on Cloudflare

The tunnel's routing record is only accepted inside the Cloudflare account that owns the
domain. In practice this means the domain has to be on Cloudflare before it can be
provisioned.

## Root and subdomains

At most DNS providers the root of your domain is written as `@` or left blank, and a
subdomain is written as just its first label — `www`, or `app` for `app.example.com`.

Root and `www` are separate hostnames. Each needs its own record, and each needs its own
entry in the tunnel. A correct CNAME on a hostname the tunnel does not cover will still not
resolve.

## Conflicting records

An old record at the same name — a previous host's A record, a parked-page CNAME, a
redirect — will prevent the new one working. Remove it before adding the HelloDeploy record.

## Propagation

Changes take time, and different resolvers cache for different periods. There is no fixed
propagation time to quote, so allow for it rather than assuming something has failed within
minutes.

## Project addresses need no DNS

A `hellodeploy.online` project address needs none of this. It works as soon as the project is
deployed.
