# Root Domain Works but WWW Does Not

## Suggested URL

```text
/learn/troubleshooting/root-domain-works-www-does-not
```

## H1

```text
Root Domain Works but WWW Does Not
```

## Quick Answer

The root domain and `www` hostname are separate DNS names.

If one works and the other does not, the missing hostname may not have the required DNS record or may not be added to the HelloDeploy project.

## Example

Root:

```text
example.com
```

WWW:

```text
www.example.com
```

## How to Check

1. confirm root domain works
2. check whether `www` is added in HelloDeploy
3. inspect DNS record for `www`
4. compare against required target
5. check HTTPS status for `www`

## Common Fix

Add or correct the `www` CNAME so it targets the same `<tunnel-id>.cfargotunnel.com` value
shown for the domain in HelloDeploy.

## When DNS Is Not the Problem

`www` also needs its own tunnel ingress entry. If the CNAME is correct and `www` still does
not resolve, the tunnel was provisioned for the root alone and support has to add `www`.
This is not user-fixable at the DNS provider.

## Related Docs

- `/docs/custom-domain`
- `/docs/dns-configuration`
- `/docs/https-and-ssl`
