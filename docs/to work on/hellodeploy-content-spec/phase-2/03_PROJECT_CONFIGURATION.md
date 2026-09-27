# Project Configuration

URL: `/docs/project-configuration`

## SEO Title

`HelloDeploy Project Configuration | Deployment Settings Guide`

## Meta Description

`Learn how HelloDeploy project settings such as runtime, build command, start command, application port, and environment variables affect deployment.`

## H1

`Project Configuration`

## Intro

HelloDeploy needs enough information to prepare and run your application. The exact settings vary by runtime and framework.

Only fields currently available in the interface should be documented as configurable.

## Project Name

Explain where the project name appears, whether it affects the generated subdomain, and whether it can be changed later. Verify first.

## Repository or Project Source

Document only implemented options such as repository provider, repository, branch, or source directory.

## Runtime

If HelloDeploy exposes a runtime selector, explain it. If runtime detection is automatic, explain the actual detection behavior instead.

Related: `/supported-runtimes`

## Build Command

Related: `/docs/build-configuration`

## Start Command

Related: `/docs/start-command`

## Application Port

Related: `/docs/application-port`

## Environment Variables

Related: `/docs/environment-variables`

## Saving Configuration

Verify whether saving configuration triggers deployment or requires redeployment.

## Common Mistakes

- incorrect start command
- missing build command
- incorrect application port
- missing environment variables
- wrong branch
- unsupported runtime
