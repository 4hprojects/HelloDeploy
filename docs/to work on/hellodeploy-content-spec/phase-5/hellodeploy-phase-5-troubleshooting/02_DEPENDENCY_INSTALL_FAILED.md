# Dependency Installation Failed

## Suggested URL

```text
/learn/troubleshooting/dependency-installation-failed
```

## H1

```text
Dependency Installation Failed
```

## Quick Answer

A dependency installation failure usually means the deployment environment could not install one or more packages required by the application.

The problem may come from an invalid dependency declaration, unsupported runtime version, unavailable package, lockfile conflict, or authentication requirement.

## Symptoms

Possible symptoms:

- deployment stops before build
- package installation exits with an error
- missing package message
- unsupported version error
- lockfile conflict
- package registry authentication error

## Common Causes

### Invalid Dependency

The project references a package or version that cannot be resolved.

### Runtime Version Mismatch

A package requires a newer or older runtime.

### Broken Lockfile

The lockfile may conflict with the dependency manifest.

### Private Package

The application may depend on a private package that requires credentials.

### Unsupported Package Manager

Only include this if HelloDeploy limits package managers.

## How to Check

1. Open deployment logs.
2. Find the dependency installation stage.
3. identify the first package-related error.
4. compare the dependency manifest and lockfile.
5. check runtime requirements.
6. verify private package credentials if applicable.

## How to Fix

Possible fixes:

- correct invalid package version
- regenerate lockfile
- update runtime
- remove unsupported dependency
- configure private package access
- confirm dependency install works locally

## How to Verify

Redeploy.

The dependency installation stage should complete and deployment should move to build or startup.

## Related Docs

- `/docs/deployment-logs`
- `/docs/project-configuration`
- `/docs/redeployment`
