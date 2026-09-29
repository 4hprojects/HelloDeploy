# Article Brief: Why HelloDeploy Uses a CNAME

## Search Intent

Comparison and explanation.

## Working Title

```text
Why HelloDeploy Uses a CNAME (and Not an A Record)
```

## Suggested URL

```text
/learn/why-hellodeploy-uses-a-cname
```

## Must Cover

- A record definition: points a hostname to an IPv4 address
- CNAME definition: points a hostname to another hostname
- why the difference matters — IP target vs hostname target
- why HelloDeploy has no IP to give out: traffic arrives through a Cloudflare tunnel, addressed as `<tunnel-id>.cfargotunnel.com`
- the two records a HelloDeploy domain actually uses: TXT for ownership, CNAME for routing
- root domain considerations, and that CNAME-at-root support varies by DNS provider
- that root and www are separate hostnames needing separate records

## Comparison Table

Compare, for A record and CNAME:

- points to
- common use
- example host
- example target
- used by HelloDeploy

The last column is the point of the article: TXT and CNAME yes, A record no.

## Scope Rule

This article explains why HelloDeploy requires the record it requires. It is not a general DNS-records reference, and it must not leave a reader thinking an A record is a supported alternative.

## Internal Links

- What Is DNS?
- How to Connect a Custom Domain to HelloDeploy
- `/docs/dns-configuration`
