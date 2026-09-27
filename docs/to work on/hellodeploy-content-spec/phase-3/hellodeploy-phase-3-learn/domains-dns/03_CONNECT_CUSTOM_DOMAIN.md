# Article Brief: How to Connect a Custom Domain to HelloDeploy

## Search Intent

Transactional and instructional.

## Working Title

```text
How to Connect a Custom Domain to HelloDeploy
```

## Suggested URL

```text
/learn/connect-custom-domain-to-hellodeploy
```

## Must Cover

- prerequisites, including that the domain must be on Cloudflare
- that the flow is not fully self-service — an administrator approves and provisions the domain
- adding the domain in HelloDeploy
- the one-time TXT verification value and where it goes
- running the verification check
- the approval and tunnel-provisioning wait
- reading the CNAME target from the domain's page
- adding the CNAME at the DNS provider
- waiting for DNS, and why routing state and DNS state are reported separately
- HTTPS
- root and www behavior
- troubleshooting

## Important Rules

This article must follow the actual HelloDeploy domain workflow: **TXT verification → admin approval → tunnel provisioning → CNAME to `<tunnel-id>.cfargotunnel.com`**.

Do not present an A record as an option — HelloDeploy publishes no IP for custom domains.

Do not invent DNS values, and never print a real tunnel id as a copyable example.

## Internal Links

- What Is DNS?
- Why HelloDeploy Uses a CNAME
- What Is HTTPS?
- `/docs/custom-domain`
- `/docs/dns-configuration`
