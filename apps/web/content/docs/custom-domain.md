This walks through connecting a domain you own, from adding it to serving traffic.

## Before you start

- A deployed project.
- A domain you own.
- That domain on **Cloudflare**, in an account you can sign in to.
- Access to its DNS settings.

Connecting a domain is **not fully self-service**: an administrator provisions it partway
through. Expect to wait at that step.

## Step 1: Add the domain

Add the hostname to your project. HelloDeploy immediately shows a one-time TXT verification
value.

**That value is shown once.** Keep the page open until the record is saved at your DNS
provider. If you lose it, remove the domain and add it again to generate a new one.

## Step 2: Add the TXT record

At your DNS provider:

```text
Type:  TXT
Name:  _hellodeploy-verify.example.com
Value: hellodeploy-verify=[the one-time value]
```

Note the record goes at `_hellodeploy-verify.`, not at the root of your domain.

## Step 3: Verify ownership

Select **Check DNS record**. HelloDeploy looks up the public TXT record and marks the domain
verified once it matches. DNS changes are not always instant, so if the check fails
immediately, wait and try again.

## Step 4: Wait for provisioning

A verified domain waits for an administrator to approve it and provision a Cloudflare tunnel
for it.

This step exists because the routing record is only accepted inside the Cloudflare account
that owns the domain, so it involves your own Cloudflare credentials. It is not automatic and
not instant.

## Step 5: Add the CNAME record

Once provisioning finishes, your domain's page shows the tunnel address. At your DNS
provider:

```text
Type:  CNAME
Name:  example.com
Value: [tunnel-id].cfargotunnel.com
```

The tunnel id is specific to your domain. Copy it from HelloDeploy — never reuse one from
documentation or another project.

## Step 6: Wait for DNS, then check

Different resolvers cache for different periods, so there is no fixed propagation time.

HelloDeploy probes whether public traffic actually reaches the platform and reports that
separately from whether routing is configured. Both need to be right.

## Step 7: Check HTTPS

Load the `https://` address. The page should load and the certificate should match your
domain.

## Root and www

`example.com` and `www.example.com` are different hostnames. Each needs its own CNAME **and**
its own entry in the tunnel.

If one works and the other does not, and the DNS record for the failing one is correct, the
tunnel was provisioned for only one of them. That is not something you can fix at your DNS
provider — ask for the other to be added.

## When something is wrong

| Symptom                     | Usual cause                                         |
| --------------------------- | --------------------------------------------------- |
| Verification never succeeds | TXT record at the wrong name, or not yet propagated |
| No CNAME target shown       | Provisioning has not finished                       |
| Domain resolves elsewhere   | An old conflicting record at the same name          |
| Root works, www does not    | The tunnel covers only one hostname                 |
