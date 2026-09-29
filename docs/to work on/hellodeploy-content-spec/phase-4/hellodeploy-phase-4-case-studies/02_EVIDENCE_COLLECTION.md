# Case Study Evidence Collection

## Purpose

Collect enough real evidence before writing final case-study copy.

The case-study writer should not fill factual gaps by guessing.

## Before any of this: the deployments have to have happened

As of 28 September 2026 none of the three case studies can be written, because
the deployments they describe have not taken place.

`docs/HELLODEPLOY_HELLORUN_PRODUCTION_PLAN.md` holds the HelloUniversity cutover
checklist. Every item is unchecked, including "Deploy `hellouniversity-4e6a`
through HelloDeploy and verify the managed container", and the same document
marks customer application hosting **NO-GO**.

So the honest state is: the platform has not yet hosted the projects these case
studies are about.

### What unblocks each one

A case study may be written once, for that project:

- the cutover checklist for it is complete
- it is serving traffic through HelloDeploy at its own domain
- an update and a rollback have both been performed and observed
- the deployment logs, configuration and any failures are available to read

Until then, the evidence categories below have nothing to collect from. Writing
anyway would mean inventing a deployment, its problems and its resolutions —
which is the one thing the content rules forbid outright, and the one thing a
reader of a case study has no way to check.

### If a case study is needed sooner

Write about a deployment that did happen. A real project deployed by someone
else, with their agreement, is worth more than an invented account of a flagship
one.

## Evidence Categories

### Project Identity

Collect:

- official project name
- public URL
- short project description
- current production status

### Technology

Verify:

- frontend framework
- backend runtime
- application framework
- database
- authentication provider
- external services
- storage if applicable

### HelloDeploy Configuration

Verify:

- project name
- source repository integration
- branch
- build command
- start command
- port behavior
- runtime settings
- environment variable categories
- deployment trigger
- custom domain configuration

### Deployment History

Collect useful examples of:

- first successful deployment
- failed deployment if relevant
- redeployment
- domain connection
- recent configuration change

### Problems Encountered

For each issue, record:

```text
Problem:
Observed symptom:
Cause:
How cause was verified:
Fix:
Result after fix:
```

### Domain and DNS

Verify:

- registrar if relevant
- DNS provider
- root domain
- www behavior
- subdomain behavior
- record types used
- HTTPS result

### Screenshots

Possible screenshots:

- project dashboard
- deployment status
- sanitized deployment logs
- environment variable names with values hidden
- domain settings
- successful live project

### Architecture

Document actual data flow.

Example questions:

- Does the app connect directly to Supabase?
- Does it use MongoDB Atlas?
- Is authentication external?
- Does HelloDeploy host both frontend and backend?
- Does the project have separate services?

## Verification Requirement

Every technical fact in the final case study should have a source such as:

- current project configuration
- current repository
- current deployment dashboard
- current DNS configuration
- verified live behavior
- documented development record

## Do Not Use as Evidence

Do not use:

- assumptions
- planned features
- outdated architecture
- unverified memory
- proposed deployment configuration
- screenshots from old versions without noting that they are historical
