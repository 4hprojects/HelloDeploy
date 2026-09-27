# Application Port Is Incorrect

## Suggested URL

```text
/learn/troubleshooting/application-port-incorrect
```

## H1

```text
Application Port Is Incorrect
```

## Quick Answer

A port mismatch happens when the application listens on one internal port while HelloDeploy expects another.

## Symptoms

- application starts successfully
- logs show a port
- site does not load
- health check fails if implemented
- gateway error appears

## Common Causes

- hard-coded development port
- configured HelloDeploy port does not match
- environment-provided port ignored
- framework defaults to another port

## How to Check

1. open startup logs
2. find the listening port
3. compare it with HelloDeploy project configuration
4. check whether the application reads the expected environment variable

## Example

Conceptual only:

```javascript
const port = process.env.PORT || 3000;
```

Do not publish this as a HelloDeploy requirement unless verified.

## How to Fix

- align project configuration with application port
- use platform-provided port where required
- remove incorrect hard-coded value

## How to Verify

Redeploy and confirm the site loads.

## Related Docs

- `/docs/application-port`
- `/docs/start-command`
- `/docs/deployment-logs`
