# Application Starts but Website Does Not Load

## Suggested URL

```text
/learn/troubleshooting/app-starts-but-site-does-not-load
```

## H1

```text
Application Starts but the Website Does Not Load
```

## Quick Answer

If the application process starts but the site does not load, the problem is often related to the application port, routing, host binding, runtime crash after startup, or domain configuration.

## Symptoms

- deployment shows success
- logs show application started
- browser times out
- connection refused
- blank gateway error
- project subdomain does not load

## Common Causes

### Wrong Application Port

HelloDeploy is routing to a different port.

### Application Bound to Localhost Only

Some applications may listen only on `127.0.0.1` when they should accept external routing.

Only include exact host binding advice if relevant to supported runtimes.

### Process Exits After Startup

The application may start and then crash.

### Routing Problem

The platform route may not be pointing to the expected service.

### Domain Problem

If the HelloDeploy subdomain works but the custom domain does not, troubleshoot DNS instead.

## How to Check

1. inspect startup logs
2. identify reported port
3. confirm process remains running
4. test HelloDeploy project URL
5. test custom domain separately
6. compare results

## How to Fix

Apply the fix that matches the cause.

## How to Verify

The project URL should load the application successfully.

## Related Docs

- `/docs/application-port`
- `/docs/start-command`
- `/docs/deployment-logs`
- `/docs/custom-domain`
