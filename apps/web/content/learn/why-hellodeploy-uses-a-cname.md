Most hosting guides tell you to point an A record at an IP address. HelloDeploy asks for a
CNAME instead. Here is the difference, and why it matters here.

## A records and CNAME records

An **A record** maps a name directly to a numeric address:

```text
example.com  →  203.0.113.10
```

A **CNAME record** makes a name an alias for another name:

```text
www.example.com  →  example-target.some-provider.net
```

When a resolver meets a CNAME, it looks up the target instead and uses whatever that
resolves to.

## Why the difference matters

An A record pins a name to one specific machine address. If that address ever changes, every
domain pointing at it breaks until each owner updates their records.

A CNAME defers the question. The target can change address freely; anything aliased to it
follows automatically, with no action from you.

That is the trade: an A record is direct and brittle, a CNAME is indirect and flexible.

## Why HelloDeploy has no address to give you

HelloDeploy does not publish a public IP address for your site to point at. Traffic reaches
the platform through a Cloudflare tunnel — an outbound connection from the server to
Cloudflare's network, which then delivers requests back through it.

A tunnel is identified by hostname, not by address:

```text
[tunnel-id].cfargotunnel.com
```

There is no address to write into an A record. The only way to point at a tunnel is to alias
a name to it, which means a CNAME.

If a guide tells you to point an A record at your hosting provider's IP, it is describing a
different kind of hosting.

## The records HelloDeploy uses

| Record | Purpose                                                   |
| ------ | --------------------------------------------------------- |
| TXT    | Proves you own the domain, before anything is provisioned |
| CNAME  | Routes traffic, once the domain has been provisioned      |

No A record. No exceptions — an A record will not work even if you find an address to put in
it.

## Root domains and CNAMEs

Strictly, the DNS standard does not allow a CNAME at the root of a domain, because the root
needs other records alongside it.

In practice most modern DNS providers work around this with flattening, and Cloudflare — where
a HelloDeploy domain has to live — does exactly that. So a root CNAME works, even though the
specification would not have allowed it.

## Root and www are still separate

Aliasing the root does not alias `www`. They are different names and each needs its own
record.

They also each need their own entry in the tunnel. If the CNAME for one is correct and it
still does not resolve, the tunnel may only cover the other — which is not something a DNS
change will fix.

## In short

HelloDeploy asks for a CNAME because there is no address to point at. The target is a tunnel,
tunnels are named rather than numbered, and naming is what a CNAME is for.

See [What Is DNS?](/learn/what-is-dns) for how records are resolved in general, and
[DNS Configuration](/docs/dns-configuration) for the exact records to add.
