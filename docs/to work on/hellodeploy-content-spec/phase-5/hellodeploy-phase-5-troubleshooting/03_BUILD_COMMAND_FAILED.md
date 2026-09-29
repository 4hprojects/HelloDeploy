# Build Command Failed

## Suggested URL

```text
/learn/troubleshooting/build-command-failed
```

## H1

```text
Build Command Failed
```

## Quick Answer

A build failure means the application could not complete its production preparation step.

The most common causes are an incorrect build command, missing script, compile error, missing environment variable, or dependency problem.

## Symptoms

- deployment stops during build
- missing build script
- compilation error
- framework build error
- missing environment variable
- output directory not generated

## Common Causes

### Wrong Build Command

The configured command does not match the project.

### Missing Script

The project has no matching build script.

### Compile Error

The source code fails to compile.

### Missing Environment Variable

The build requires configuration not available in production.

### Dependency Problem

A required dependency did not install correctly.

## How to Check

1. Open deployment logs.
2. locate the build stage.
3. identify the first meaningful error.
4. verify the configured build command.
5. run the same build locally where possible.
6. check required environment variables.

## How to Fix

- correct build command
- add missing script
- fix compile errors
- add required environment variable
- fix dependency problem

## How to Verify

Redeploy.

The build stage should complete successfully.

## Related Docs

- `/docs/build-configuration`
- `/docs/environment-variables`
- `/docs/deployment-logs`
