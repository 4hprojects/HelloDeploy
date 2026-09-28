## Quick answer

Your domain resolves, but to something other than HelloDeploy — an old host, a parked page,
or a registrar holding page. Almost always there is a leftover record, or you are editing
records at a provider that is not the one actually answering for your domain.

## Symptoms

- Your domain loads someone else's page, or a "this domain is parked" notice.
- An old version of your site appears.
- A certificate warning naming an unrelated domain.
- Changes at your DNS provider appear to have no effect at all.

## Common causes

- **An old record left in place.** A previous host's A record at the same name keeps winning.
- **You are editing DNS at the wrong place.** The registrar and the DNS provider are often
  different companies. Records edited somewhere that is not answering do nothing.
- **Nameservers point elsewhere.** If the domain's nameservers are set to another provider,
  that provider's records are the ones in use.
- **Caching.** An old answer is still held, by a resolver or by your own machine.

## How to check

1. Check what the domain currently resolves to, from a network other than your own.
2. Look at the full record list at your DNS provider, not just the record you added. Anything
   else at the same name is a candidate.
3. Check the domain's nameservers. Those decide who answers — and for HelloDeploy the domain
   needs to be on Cloudflare.
4. Try from a phone on mobile data. A different result means caching rather than
   configuration.
5. Confirm the CNAME target matches the tunnel address shown for your domain.

## How to fix

**Leftover record.** Delete it. Two records at one name do not combine; one wins.

**Editing at the wrong provider.** Find out which nameservers the domain uses and edit there.
This is the one that wastes the most time, because every change appears to work and nothing
happens.

**Wrong nameservers.** Point them at Cloudflare, then recreate the records there. Expect this
to take longer to take effect than an ordinary record change.

**Caching.** Wait, and check from elsewhere. Do not keep changing records while waiting —
that makes it impossible to tell which change did what.

## A note on patience

Make one change, then verify. Changing several things while caches expire produces a state
nobody can reason about, including whoever you eventually ask for help.

## Related

- [What Is DNS?](/learn/what-is-dns)
- [DNS Configuration](/docs/dns-configuration)
