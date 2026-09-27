# Navigation and Footer Specification

## Primary Navigation

```text
Product
  How It Works
  Features
  Supported Runtimes
  Pricing

Learn
  Deployment
  Hosting
  Domains and DNS
  Servers and Infrastructure
  Security
  Troubleshooting

Docs
  Getting Started
  Deployments
  Domains
  Environment Variables
  Deploy Hooks
  Troubleshooting

Case Studies
  HelloUniversity
  HelloRun
  HelloPera

Company
  About
  Contact

Sign In
Get Started
```

## Footer

```text
Product
  Features
  How It Works
  Supported Runtimes
  Pricing

Resources
  Learn
  Documentation
  Troubleshooting
  Case Studies

Company
  About
  Contact

Legal
  Legal Overview
  Privacy Policy
  Terms of Service
  Cookie Policy
  Acceptable Use Policy
  Service Limits
  Data Processing Terms
  Copyright Policy
  Security Policy
```

## Deliberate Omissions

**Status** and **Glossary** were removed from the footer. Neither is specified anywhere in
this pack, and no Status page exists — the platform has only JSON `/health` and `/ready`.
Add either back only once it has a spec and a page.

## Phase 1 Reality

Learn, Docs and Case Studies are Phase 2 to Phase 5. Until those pages exist, the Phase 1
navigation must omit their entries rather than link to pages that 404.

## Legal Column

The Legal column lists all nine legal pages the application already serves. The previous
four-item version would have orphaned Service Limits, Data Processing Terms, Copyright
Policy and Security Policy, which are live today.

## Navigation Rules

- Public pages must be reachable without login.
- Do not hide key product information behind authentication.
- Use descriptive link labels.
- Avoid duplicate links with different labels for the same destination unless necessary.
- The active section should be visually identifiable.
- Mobile navigation must expose the same primary destinations.
