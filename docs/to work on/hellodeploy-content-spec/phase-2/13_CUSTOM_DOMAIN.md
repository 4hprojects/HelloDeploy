# Connect a Custom Domain

URL: `/docs/custom-domain`

## SEO Title

`Connect a Custom Domain to HelloDeploy`

## Meta Description

`Learn how to add a custom domain to a HelloDeploy project, verify ownership, get the domain approved and provisioned, and point DNS at your deployment.`

## H1

`Connect a Custom Domain`

## Before You Start

You need:

- a deployed project
- a domain you control
- access to that domain's DNS settings
- the domain hosted on Cloudflare, under an account you can sign in to
- a plan that supports custom domains if restrictions apply

Connecting a custom domain is **not fully self-service**. One step in the middle requires a HelloDeploy administrator. Say so up front rather than letting users hit it unannounced.

## Step 1: Add the Domain in HelloDeploy

Open the project's Domains page and add the hostname.

HelloDeploy immediately shows a one-time TXT verification value. **It is shown only once.** Keep the page open until the record is added.

## Step 2: Add the TXT Verification Record

At your DNS provider:

```text
Type: TXT
Name: _hellodeploy-verify.example.com
Value: hellodeploy-verify=[the one-time value]
```

If the value is lost before it is added, remove the domain and add it again to generate a new one.

## Step 3: Verify Ownership

Select **Check DNS record**. HelloDeploy looks up the public TXT record and moves the domain to verified once it matches.

## Step 4: Wait for Administrator Approval and Provisioning

A verified domain waits for a HelloDeploy administrator to approve it and provision a Cloudflare tunnel for it.

This step exists because the tunnel's routing record is only accepted inside the Cloudflare account that owns the domain, so it involves the owner's own Cloudflare credentials. It is not instant.

Do not describe this step as automatic.

## Step 5: Add the CNAME Routing Record

Once provisioning completes, the domain's page shows the tunnel target. At your DNS provider:

```text
Type: CNAME
Name: example.com
Value: [tunnel-id].cfargotunnel.com
```

The tunnel id is specific to this domain. Copy it from HelloDeploy; never reuse one from documentation or another project.

## Step 6: Wait for DNS to Update

Do not guarantee a fixed propagation time.

HelloDeploy probes whether public traffic actually reaches the platform, and reports that separately from whether routing is configured internally. A domain can be routed on the platform while its DNS still points elsewhere.

## Step 7: Check HTTPS

Confirm the `https://` URL loads and the certificate matches the domain.

## Common Problems

- TXT value added at the wrong name (it belongs at `_hellodeploy-verify.`, not the root)
- TXT verification value lost before it was added
- CNAME added before provisioning finished, so the target was wrong or empty
- an old conflicting record left at the same name
- domain connected to the wrong project
- root works but www does not, or the reverse — usually tunnel ingress, not DNS
- HTTPS still provisioning

## Related

- `/docs/dns-configuration`
- `/docs/https-and-ssl`
