# 502 Bad Gateway

## Suggested URL

```text
/learn/troubleshooting/502-bad-gateway
```

## H1

```text
502 Bad Gateway
```

## Quick Answer

A 502 error usually means the routing layer could not get a valid response from the application.

In a deployment environment, that can happen when the application is not running, is listening on the wrong port, crashes, or is not reachable by the reverse proxy.

## Symptoms

- browser displays 502
- deployment route exists
- application does not respond normally

## Common Causes

- application process stopped
- wrong port
- startup failure
- process crash
- upstream routing issue

## How to Check

1. inspect deployment status
2. inspect startup logs
3. confirm application process is running
4. confirm application port
5. test project URL
6. compare custom domain result

## How to Fix

Fix the application process or routing configuration.

## HelloDeploy Note

Only describe 502 behavior if HelloDeploy's proxy layer can actually return this status.

## Related Docs

- `/docs/application-port`
- `/docs/start-command`
- `/docs/deployment-logs`
