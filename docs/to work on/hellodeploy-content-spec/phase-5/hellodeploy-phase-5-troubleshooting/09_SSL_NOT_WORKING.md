# SSL Certificate Is Not Working

## Suggested URL

```text
/learn/troubleshooting/ssl-certificate-not-working
```

## H1

```text
SSL Certificate Is Not Working
```

## Quick Answer

HTTPS problems often happen when DNS is incorrect, the domain has not been verified, certificate provisioning is still in progress, or a proxy configuration is interfering.

## Symptoms

- browser security warning
- HTTPS unavailable
- certificate mismatch
- HTTP works but HTTPS fails
- certificate pending

## Common Causes

- DNS not pointing correctly
- wrong domain attached
- certificate not yet provisioned
- conflicting proxy configuration
- root and www mismatch

## How to Check

1. confirm DNS
2. confirm domain is attached to correct project
3. check HelloDeploy certificate or domain status if available
4. test both root and www separately
5. inspect proxy settings if using Cloudflare

## How to Fix

Apply the fix matching the actual cause.

Do not recommend disabling certificate validation.

## How to Verify

The browser loads the site over HTTPS without a certificate warning.

## Related Docs

- `/docs/https-and-ssl`
- `/docs/custom-domain`
- `/docs/dns-configuration`
