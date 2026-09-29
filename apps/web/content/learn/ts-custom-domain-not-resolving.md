## Quick answer

Your project address works but your own domain does not. Work through the stages in order —
verification, provisioning, then DNS — because each depends on the one before, and the most
common mistake is adding the CNAME before there is anything to point it at.

## Symptoms

- The `hellodeploy.online` address loads normally.
- Your domain does not resolve, or lands somewhere else entirely.
- The browser reports that it cannot find the site.

## Check the project address first

If the project address does not work either, this is not a domain problem. Fix the deployment
first; a domain cannot point at a site that is not running.

## Work through the stages

**1. Has ownership verification succeeded?** The TXT record goes at
`_hellodeploy-verify.example.com`, not at the root. If verification has not completed, nothing
further happens.

**2. Has provisioning finished?** A verified domain waits for an administrator to approve it
and provision a tunnel. Until that is done there is no CNAME target to add, and nothing you
change at your DNS provider will help.

**3. Is the CNAME right?** It should point at the `[tunnel-id].cfargotunnel.com` value shown
for your domain. The tunnel id is specific to your domain — one copied from elsewhere will
not work.

**4. Is there a conflicting record?** An old A record, a parked-page CNAME or a redirect at
the same name will keep winning. Remove it.

**5. Has DNS propagated?** Resolvers cache for different periods. Check from a different
network or device before concluding anything.

## Two different states

HelloDeploy reports whether the domain is configured on the platform and whether public
traffic actually arrives, separately.

A domain can be fully set up here while its DNS still points somewhere else entirely. Read
both, because "configured" and "reachable" answer different questions.

## Verify

Load your domain from a network you have not used to test it before — a phone on mobile data
is ideal, because it will not be holding a cached answer. Check both the root and `www`.

## What you cannot fix yourself

If verification has succeeded, provisioning has completed, the CNAME matches exactly and it
still does not resolve, the remaining causes are on the platform side. Ask rather than keep
changing records that are already correct.

## Related

- [Connect a Custom Domain](/docs/custom-domain)
- [DNS Configuration](/docs/dns-configuration)
- [What Is DNS?](/learn/what-is-dns)
