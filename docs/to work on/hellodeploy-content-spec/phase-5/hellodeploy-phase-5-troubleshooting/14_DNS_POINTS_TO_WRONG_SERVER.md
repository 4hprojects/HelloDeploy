# DNS Record Points to the Wrong Server

## Suggested URL

```text
/learn/troubleshooting/dns-points-to-wrong-server
```

## H1

```text
DNS Record Points to the Wrong Server
```

## Quick Answer

A domain can be configured correctly inside HelloDeploy but still open the wrong website if its DNS record points to an old or unrelated server.

## Symptoms

- old website loads
- hosting provider parking page appears
- unrelated application loads
- HelloDeploy project URL works

## Common Causes

- old A record
- old CNAME
- conflicting records
- DNS provider not updated
- wrong DNS zone edited

## How to Check

1. inspect current DNS records
2. compare targets with HelloDeploy instructions
3. identify duplicate or conflicting records
4. confirm correct DNS provider
5. check current DNS resolution

## How to Fix

Update the record to the verified HelloDeploy target.

Remove old records only when safe and appropriate.

## Related Docs

- `/docs/dns-configuration`
- `/docs/custom-domain`
- `/learn/what-is-dns`
