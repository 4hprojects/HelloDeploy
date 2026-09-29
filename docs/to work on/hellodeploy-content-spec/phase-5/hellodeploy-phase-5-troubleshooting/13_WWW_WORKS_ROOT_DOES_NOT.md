# WWW Works but Root Domain Does Not

## Suggested URL

```text
/learn/troubleshooting/www-works-root-domain-does-not
```

## H1

```text
WWW Works but Root Domain Does Not
```

## Quick Answer

If `www.example.com` works but `example.com` does not, the root domain may be missing its CNAME record, may not be attached to the HelloDeploy project, or may not have been included when the domain's tunnel was provisioned.

## How to Check

1. confirm `www` works
2. check whether root domain is added in HelloDeploy
3. inspect root DNS record
4. compare against HelloDeploy-required value
5. check HTTPS status for root domain

## Common Causes

- root domain not added to project
- root domain missing its CNAME to `<tunnel-id>.cfargotunnel.com`
- incorrect or conflicting old record at the root
- the tunnel was provisioned for `www` only, so the root has no ingress entry

The last cause is not something the user can fix at their DNS provider. If the root CNAME
is correct and the root still does not resolve, route the case to support.

There is no root A record to add — HelloDeploy publishes no IP address.

## Related Docs

- `/docs/custom-domain`
- `/docs/dns-configuration`
