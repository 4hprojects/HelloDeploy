# Phase 4 Screenshot and Diagram Plan

## Purpose

Case studies should contain original visuals wherever useful.

These visuals should demonstrate real deployment work.

## Standard Screenshot Set

Aim for 3 to 6 useful screenshots per case study.

Possible screenshots:

1. HelloDeploy project overview
2. successful deployment status
3. sanitized deployment logs
4. environment variable names
5. custom domain configuration
6. live production application

Do not include screenshots only to increase page length.

Every item on that list except the first requires a deployment that actually ran.
No project has completed one through HelloDeploy yet, so these cannot be captured
for the three planned case studies until that changes — see
`02_EVIDENCE_COLLECTION.md`.

Logs are the item to be most careful with: platform redaction matches known
credential shapes and does not know a project's own values, so a log screenshot
can contain secrets that look redacted. `07_PRIVACY_AND_SANITIZATION.md` covers
this.

## Architecture Diagram

Every case study should include one simple architecture diagram.

Example:

```text
Visitor
 ↓  DNS: CNAME to <tunnel-id>.cfargotunnel.com
Cloudflare tunnel
 ↓  TLS terminates here
nginx on the host
 ↓  routes by hostname to a private loopback port
Application container
 ├── External database
 ├── Authentication provider
 └── Other external services
```

Customise it to the actual project, but keep the real path. Collapsing it to
"HelloDeploy" hides the parts a reader wants explained: that TLS terminates
upstream rather than in the application, that nginx picks the container by
hostname, and that the container is not directly reachable from the internet.

Databases and other services are external — HelloDeploy does not provide them,
so they belong outside the box, reached by the application.

## Before and After Visual

Where a real problem existed, consider:

```text
Before:
Custom domain fails

After:
Custom domain resolves correctly
```

Avoid visually exposing sensitive infrastructure details.

## Screenshot Caption Standard

Captions should explain why the screenshot matters.

Good:

```text
The deployment completed successfully before the custom domain was connected, helping isolate the remaining issue to DNS configuration.
```

Weak:

```text
Deployment screenshot.
```

## Image Alt Text

Describe the actual image.

Example:

```text
HelloDeploy deployment dashboard showing a successful HelloUniversity deployment
```
