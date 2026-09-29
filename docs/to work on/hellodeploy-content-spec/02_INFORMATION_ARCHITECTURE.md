# HelloDeploy Information Architecture

## Public Content Layers

HelloDeploy should have three connected public layers.

### Product

Explains what HelloDeploy does.

Pages:

- `/`
- `/features`
- `/how-it-works`
- `/supported-runtimes`
- `/pricing`

`/status` is not specified and not built. The platform exposes only JSON `/health` and
`/ready`. Do not link a Status page from navigation until it exists.

### Documentation

Explains how to use HelloDeploy.

Pages and sections, as delivered in Phase 2:

- `/docs`
- `/docs/getting-started`
- `/docs/project-configuration`
- `/docs/build-configuration`
- `/docs/start-command`
- `/docs/application-port`
- `/docs/environment-variables`
- `/docs/deployment-process`
- `/docs/deployment-logs`
- `/docs/redeployment`
- `/docs/deploy-hooks`
- `/docs/domains`
- `/docs/custom-domain`
- `/docs/dns-configuration`
- `/docs/https-and-ssl`
- `/docs/troubleshooting`

`/docs/troubleshooting` is an index and a short triage guide. The per-error walkthroughs
live under `/learn/troubleshooting/*` (Phase 5) — one page per error, not duplicated here.

### Learn

Explains deployment concepts.

Primary categories, matching the Phase 3 and Phase 5 folders:

- Deployment
- Hosting
- Domains and DNS
- Servers and Infrastructure
- Security
- Troubleshooting

There is no Development category. It was listed here before but no briefs were written for
it — add it back only alongside real briefs.

## Intended User Journey

```text
Learn the concept
      ↓
Understand how it works
      ↓
See how HelloDeploy handles it
      ↓
Try HelloDeploy
```

## Case Studies

Public case studies should include real projects:

- HelloUniversity
- HelloRun
- HelloPera

## Trust and Legal

Public trust pages:

- `/about`
- `/contact`
- `/legal`
- `/privacy`
- `/terms`
- `/cookies`
- `/acceptable-use`
- `/service-limits`
- `/data-processing`
- `/copyright`
- `/security`

The last five already exist in the application. Navigation must keep reaching them.
