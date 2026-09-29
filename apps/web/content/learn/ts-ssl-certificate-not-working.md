## Quick answer

A secure address that does not load is almost never a certificate problem on HelloDeploy. TLS
is terminated upstream, so there is no certificate for you to request, install or renew. Look
at DNS and provisioning instead.

## Symptoms

- `https://` does not load, while `http://` might.
- A browser warning about the connection not being private.
- A certificate warning naming a different domain.

## What is not the cause

There is no per-project certificate to issue, and no "certificate pending" state to wait
through. If you are looking for somewhere to upload a certificate, there isn't one — that is
expected, not a missing feature.

## Common causes

- **The domain does not resolve at all.** Nothing can be served securely if nothing is
  reached. Start with [the domain not resolving](/learn/troubleshooting/custom-domain-not-resolving).
- **Provisioning has not completed.** Until it has, the domain is not being served.
- **The request is reaching something else.** A certificate warning naming an unrelated
  domain means your DNS points at another service.
- **Only one of root and www is covered.** They are separate hostnames.
- **An external proxy in front** with its own TLS settings, configured inconsistently.

## How to check

1. Does the project address load over `https://`? If yes, HTTPS works and the problem is your
   domain.
2. Does your domain resolve at all?
3. Has provisioning completed?
4. Read the warning. A name mismatch tells you the request is arriving somewhere unexpected.
5. Test root and `www` separately.

## How to fix

Fix the domain, and HTTPS follows. In order: verification, provisioning, the CNAME, then
conflicting records.

If you put another proxy or CDN in front, make sure its own TLS settings are consistent —
that configuration is yours, not the platform's.

## Verify

Load the `https://` address. The page should load, the browser should report a secure
connection, and the certificate should name your domain. Check root and `www` separately.

## Never work around a warning

Do not tell visitors to click through a certificate warning, and do not disable certificate
validation in an application to silence an error. Both remove the protection rather than
fixing the cause, and the cause is usually that traffic is not going where you think.

## Related

- [HTTPS and SSL](/docs/https-and-ssl)
- [What Is an SSL Certificate?](/learn/what-is-an-ssl-certificate)
