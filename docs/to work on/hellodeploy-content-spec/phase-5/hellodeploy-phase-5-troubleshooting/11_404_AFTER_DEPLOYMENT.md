# 404 After Deployment

## Suggested URL

```text
/learn/troubleshooting/404-after-deployment
```

## H1

```text
404 After Deployment
```

## Quick Answer

A 404 after deployment can mean the application route does not exist, the requested path is not handled by the application, static assets were built incorrectly, or the custom domain is reaching the wrong service.

## Symptoms

- homepage works but nested route fails
- all routes return 404
- custom domain returns 404
- static SPA routes fail on refresh

## Common Causes

- application route missing
- SPA fallback not configured
- wrong output directory
- wrong custom domain target
- wrong project route

## How to Check

1. test root path `/`
2. test HelloDeploy project URL
3. test custom domain
4. inspect application routing
5. inspect static output configuration
6. review logs if available

## How to Fix

Depends on application type.

Avoid framework-specific instructions unless verified.

## Related Docs

- `/docs/custom-domain`
- `/docs/deployment-logs`
- `/docs/project-configuration`
