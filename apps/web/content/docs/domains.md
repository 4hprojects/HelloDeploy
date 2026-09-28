A domain is the address people type to reach your site. Every HelloDeploy project gets one
immediately; connecting a domain you own is a separate, slower process.

## Your project address

Every project is reachable at a HelloDeploy address as soon as it is deployed:

```text
your-project.hellodeploy.online
```

This needs no DNS configuration and no waiting. It is served over HTTPS and it keeps working
whether or not you ever connect a domain of your own.

## A domain you own

You can also point a domain you already own at a project. Registering that domain is separate
— HelloDeploy does not sell or register domains. Buy it from a registrar first.

Connecting it is **not fully self-service**. The sequence is:

1. Add the domain to your project.
2. Prove you own it with a TXT record.
3. An administrator reviews and provisions it.
4. Add the CNAME record HelloDeploy then shows you.

Step 3 involves a person, so it is not instant. [Connect a Custom
Domain](/docs/custom-domain) walks through the whole thing.

## A prerequisite worth knowing early

Your domain must be on **Cloudflare**, in an account you can sign in to. Traffic reaches
HelloDeploy through a Cloudflare tunnel, and the record that routes it is only accepted
inside the account that owns the domain.

If your domain is managed somewhere else, move it to Cloudflare before starting.

## Registrar and DNS provider are not the same thing

The registrar is who you bought the domain from. The DNS provider is who answers questions
about where it points. They are often the same company, but not always — and it is the DNS
provider's records you need to change.

## Two records, in order

| Record | Purpose                     | When                         |
| ------ | --------------------------- | ---------------------------- |
| TXT    | Proves you own the domain   | Immediately after adding it  |
| CNAME  | Sends visitors to your site | After provisioning completes |

There is no A record. See [DNS Configuration](/docs/dns-configuration) for the exact values.

## Status and reachability are reported separately

HelloDeploy tells you two different things: whether the domain is set up on the platform, and
whether public traffic actually arrives. A domain can be fully configured here while its DNS
still points somewhere else entirely. Read both before concluding something is broken.
