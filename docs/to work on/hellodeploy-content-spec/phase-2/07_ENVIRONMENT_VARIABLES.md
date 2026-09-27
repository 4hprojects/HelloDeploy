# Environment Variables

URL: `/docs/environment-variables`

## SEO Title

`Environment Variables in HelloDeploy | Configuration and Secrets`

## Meta Description

`Learn how to add, update, protect, and troubleshoot environment variables used by applications deployed with HelloDeploy.`

## H1

`Environment Variables`

## Intro

Environment variables let an application receive configuration values without storing those values directly in source code.

Common uses:

- database connection strings
- API keys
- authentication secrets
- application URLs
- external service credentials

## Example

```text
DATABASE_URL=...
APP_URL=...
API_KEY=...
```

## Adding an Environment Variable

After verifying the UI:

1. Open the project.
2. Open Environment Variables.
3. Add variable name.
4. Add value.
5. Save.
6. Redeploy if required.

## Secret Values

Never publish or expose:

- database passwords
- private API keys
- authentication secrets
- private tokens
- service role keys
- deploy hook URLs

## Updating and Removing Variables

Verify whether changes require redeployment or restart.

## Build-Time vs Runtime Variables

Document only if HelloDeploy distinguishes these categories.

## Common Problems

- variable name mismatch
- capitalization mismatch
- incorrect value format
- variable saved but deployment not restarted when required
- secret committed to source code

## Security Guidelines

- do not commit secrets to repositories
- do not share secrets in screenshots
- rotate compromised credentials
- restrict access to production secrets
- use separate development and production values where appropriate
