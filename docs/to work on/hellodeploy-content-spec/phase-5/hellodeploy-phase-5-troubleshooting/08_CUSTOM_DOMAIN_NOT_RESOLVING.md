# Custom Domain Is Not Resolving

## Suggested URL

```text
/learn/troubleshooting/custom-domain-not-resolving
```

## H1

```text
Custom Domain Is Not Resolving
```

## Quick Answer

If the HelloDeploy project URL works but the custom domain does not, the issue is usually DNS configuration rather than the application itself.

## Symptoms

- browser cannot find domain
- DNS error
- domain points to another site
- project subdomain works
- custom domain fails

## Common Causes

- domain never finished TXT verification
- domain verified but not yet approved and provisioned, so no tunnel target exists yet
- CNAME missing, or pointing at the wrong `<tunnel-id>.cfargotunnel.com` value
- conflicting old record at the same name
- root and www configured differently
- DNS change still cached
- domain attached to wrong project

## How to Check

1. confirm project URL works
2. confirm domain is added to correct HelloDeploy project
3. check the domain's status in HelloDeploy — verification and provisioning both have to finish before the CNAME has a target
4. inspect the public DNS records
5. compare the CNAME target against the value shown for this domain
6. remove conflicting records if appropriate
7. wait for DNS updates where necessary

HelloDeploy reports internal routing and public reachability separately. A domain can show
as routed on the platform while its DNS still points somewhere else — read both.

## How to Fix

Correct the DNS records to match the values shown for this domain in HelloDeploy. If the
domain is still waiting on verification or provisioning, there is nothing to fix at the DNS
provider yet.

## How to Verify

The custom domain resolves to the intended application.

## Related Docs

- `/docs/custom-domain`
- `/docs/dns-configuration`
- `/docs/https-and-ssl`
