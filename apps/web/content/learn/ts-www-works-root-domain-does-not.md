## Quick answer

The mirror image of the more common problem: `www` resolves and the bare domain does not.
Same cause — they are separate hostnames — with one extra wrinkle, which is that root domains
historically could not hold a CNAME.

## Symptoms

- `www.example.com` loads.
- `example.com` does not resolve.
- Visitors typing your domain without `www` see nothing.

## The root domain wrinkle

The DNS standard does not allow a CNAME at the root of a domain, because the root needs other
records alongside it.

In practice most modern providers work around this with flattening, and Cloudflare — where a
HelloDeploy domain has to live — does. So a root CNAME does work here, even though a strict
reading of the specification says otherwise.

If you have read that a root CNAME is impossible, that is why, and it does not apply to your
situation.

## How to check

1. Confirm `www` works, in a private window.
2. Look for a record at the root — usually written as `@` or left blank.
3. Check its target against the tunnel address shown for your domain.
4. Look for an old A record at the root. This is the usual culprit: a previous host's record
   nobody removed.
5. Check whether the root is listed among the hostnames on your domain in HelloDeploy.

## How to fix

**No root record.** Add a CNAME at `@` pointing at the tunnel address shown for your domain.

**An old A record.** Remove it. There is no IP address to point at on HelloDeploy, so any A
record at the root is left over from something else and will prevent the CNAME working.

**Wrong target.** Correct it to match exactly.

**Record correct, still not resolving.** The tunnel covers `www` only. Ask for the root to be
added — this is not fixable at your DNS provider.

## Verify

Load the bare domain from a network that has not cached the old answer. It should serve the
same site as `www`, over HTTPS, with no certificate warning.

## Related

- [Why HelloDeploy Uses a CNAME](/learn/why-hellodeploy-uses-a-cname)
- [The root domain works but www does not](/learn/troubleshooting/root-domain-works-www-does-not)
