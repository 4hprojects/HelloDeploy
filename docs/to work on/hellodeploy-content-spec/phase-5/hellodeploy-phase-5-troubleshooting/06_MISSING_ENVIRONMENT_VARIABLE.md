# Missing Environment Variable

## Suggested URL

```text
/learn/troubleshooting/missing-environment-variable
```

## H1

```text
Missing Environment Variable
```

## Quick Answer

Applications often fail in production because a required environment variable exists locally but was never added to the deployment environment.

## Symptoms

- application starts locally but fails in production
- undefined variable error
- database connection fails
- authentication fails
- external API fails
- build fails

## Common Causes

- variable not added
- wrong variable name
- wrong capitalization
- incorrect value
- variable added to local `.env` only
- redeployment required after adding variable

Redeployment is required, and this is verified: environment variables are passed
to the container when it starts, so a running application does not pick up a value
added or changed afterwards. Save the variable, then redeploy.

## How to Check

1. identify the variable expected by the code
2. open HelloDeploy environment variables
3. compare names exactly
4. confirm value exists
5. check logs for related errors

## How to Fix

- add missing variable
- correct spelling
- correct capitalization
- correct value
- redeploy if required

## Security

Never share secret values publicly.

## Related Docs

- `/docs/environment-variables`
- `/docs/deployment-logs`
- `/docs/redeployment`
