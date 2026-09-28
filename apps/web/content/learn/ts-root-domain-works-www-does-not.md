## Quick answer

`example.com` and `www.example.com` are different hostnames. Each needs its own DNS record
**and** its own entry in the domain's tunnel. If the record for `www` is correct and it still
does not resolve, the tunnel does not cover it — and that is not something you can fix at
your DNS provider.

## Symptoms

- `example.com` loads.
- `www.example.com` does not resolve, or lands somewhere else.
- A certificate warning on `www` only.

## Why they are separate

People treat `www` as decorative, but to DNS it is simply another name. Nothing links the two
unless you configure it.

So every step that made your root domain work has to be repeated for `www`.

## How to check

1. Confirm the root really does work — try it in a private window to avoid a cached result.
2. Look for a DNS record with the name `www`. Is there one at all?
3. If there is, does it point at the same `[tunnel-id].cfargotunnel.com` value shown for your
   domain?
4. Check for a conflicting old record at `www` — a parked page or a previous host.
5. Check whether `www` is listed among the hostnames on your domain in HelloDeploy.

## How to fix

**No record.** Add a CNAME with the name `www`, pointing at the tunnel address shown for your
domain.

**Wrong target.** Correct it to match exactly.

**Conflicting record.** Remove the old one first. Two records at one name do not merge.

**Record correct, still not resolving.** The tunnel was provisioned for the root alone. Ask
for `www` to be added — no DNS change on your side will fix this.

## Verify

Load `www.example.com` from a network that has not cached the old answer. It should serve the
same site as the root, over HTTPS, with no certificate warning.

## Which should visitors use?

Pick one as canonical and redirect the other, so you do not have two addresses serving the
same content. Search engines handle it, but links, analytics and cookies all become
unnecessarily messy when both are live.

## Related

- [DNS Configuration](/docs/dns-configuration)
- [www works but the root domain does not](/learn/troubleshooting/www-works-root-domain-does-not)
