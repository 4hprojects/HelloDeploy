# Case Study Evidence Collection

## Purpose

Collect enough real evidence before writing final case-study copy.

The case-study writer should not fill factual gaps by guessing.

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
