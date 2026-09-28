DNS is the system that turns a name people can remember into an address computers can
connect to.

## What it means

Computers on the internet find each other by numeric address — something like
`203.0.113.10`. People do not want to remember those, and they change.

So we use names. `example.com` is a name; something has to translate it into an address. That
translation is DNS, the Domain Name System.

It is often described as a phone book. That is close enough, provided you remember that the
book is distributed across thousands of machines, cached everywhere, and updated slowly.

## What happens when someone visits your site

1. The browser asks a **resolver** — usually run by your internet provider — where
   `example.com` is.
2. If the resolver already knows, it answers immediately from its cache.
3. If not, it asks the servers responsible for `.com`, which point it at the servers
   responsible for `example.com`.
4. Those return the answer: this name points _here_.
5. The browser connects, and the resolver remembers the answer for a while.

All of that usually takes a few milliseconds and happens before anything of yours is
involved.

## Records

A domain's DNS settings are a list of records. Each has a type, a name and a value, and each
answers a different question.

The ones you will meet:

- **A** — this name points to this numeric address.
- **CNAME** — this name is an alias for that other name. The resolver looks that one up
  instead.
- **TXT** — arbitrary text. Widely used to prove you control a domain, because only someone
  with access to the DNS settings can publish one.
- **MX** — where email for this domain should go.

A site being unreachable and its email still working is perfectly normal: different records,
independently configured.

## Registrar and DNS provider

These get confused constantly.

The **registrar** is who you bought the domain from. The **DNS provider** answers questions
about where it points.

Often the same company, but not always — and when they differ, changing records at the
registrar does nothing, because the registrar is not the one answering. Find out who actually
hosts your DNS before wondering why an edit had no effect.

## Caching and propagation

Every answer carries a time to live: how long it may be cached before being asked again.

This is why changes are not instant. Resolvers around the world hold the old answer until it
expires, and they do not expire at the same moment. For a while, some visitors get the new
answer and some the old one.

"Propagation" describes this, though nothing is actually propagating — old answers are just
expiring at different times. There is no reliable number of hours to quote, which is why
platforms avoid promising one.

## Common mistakes

- **Editing records at the registrar when DNS is hosted elsewhere.** Nothing happens.
- **Leaving an old conflicting record.** A previous host's record at the same name will keep
  winning.
- **Expecting root and `www` to behave as one.** They are separate names and each needs its
  own record.
- **Assuming a change failed because it did not work in five minutes.** Check from a
  different network before concluding anything.

## How HelloDeploy uses DNS

Two records, in order. A **TXT** record proves you own the domain, then a **CNAME** points it
at HelloDeploy once the domain has been provisioned.

There is no A record, because HelloDeploy does not publish a server address for you to point
at — traffic arrives through a tunnel addressed by hostname. See
[Why HelloDeploy Uses a CNAME](/learn/why-hellodeploy-uses-a-cname).
