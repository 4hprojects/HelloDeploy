# Application Keeps Restarting

## Suggested URL

```text
/learn/troubleshooting/application-keeps-restarting
```

## H1

```text
Application Keeps Restarting
```

## Quick Answer

A restart loop usually means the application starts, crashes, and is started again by the process manager or platform.

Document this behavior only if HelloDeploy actually restarts failed processes.

## Symptoms

- repeating startup logs
- repeated crash messages
- application briefly becomes available
- frequent restart events

## Common Causes

- unhandled startup error
- database unavailable
- missing environment variable
- port conflict
- invalid startup command
- application exits intentionally

## How to Check

1. review repeated log sequence
2. identify first error before each restart
3. check environment variables
4. check database connectivity
5. check start command
6. check port

## How to Fix

Fix the underlying crash cause.

Do not recommend increasing restart counts as a primary solution.

## How to Verify

Application starts once and remains running.

## Related Docs

- `/docs/start-command`
- `/docs/environment-variables`
- `/docs/application-port`
- `/docs/deployment-logs`
