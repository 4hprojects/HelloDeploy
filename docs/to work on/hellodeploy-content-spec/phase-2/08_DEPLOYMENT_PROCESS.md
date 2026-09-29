# Deployment Process

URL: `/docs/deployment-process`

## SEO Title

`HelloDeploy Deployment Process | What Happens During Deployment`

## Meta Description

`Understand the stages HelloDeploy uses to prepare, build, start, and publish supported web applications.`

## H1

`Deployment Process`

## Intro

A deployment moves your configured application into a running production environment. The exact sequence depends on the runtime and current HelloDeploy engine.

## Potential Stages

Only display stages actually implemented.

### Prepare

Prepare source and deployment configuration.

### Install Dependencies

Install required dependencies for supported project types.

### Build

Run configured build if required.

### Start

Start the application.

### Route Traffic

Make the application reachable through its assigned route or domain.

### Verify

If health verification exists, describe the actual checks.

## Deployment Statuses

A deployment moves through these statuses:

| Status | Meaning |
|---|---|
| `QUEUED` | Accepted and waiting for a worker |
| `VALIDATING` | Configuration and repository access being checked |
| `BUILDING` | Dependencies installing and the build running |
| `DEPLOYING` | Container starting, health check running, routing being updated |
| `HEALTHY` | Running and serving traffic |
| `FAILED` | Stopped at one of the stages above; the previous release keeps serving |
| `CANCELLED` | Stopped before it finished |
| `ROLLED_BACK` | Replaced by an earlier release |

Within a run the stage shown is one of `PREPARING`, `BUILDING`, `CONFIGURING`,
`STARTING`, `CHECKING` or `PUBLISHING`.

Note that Simple mode labels `HEALTHY` as **Published** rather than "Live", because
several retained releases can be healthy while only one serves visitors. Do not
describe every healthy release as live.

## Successful Deployment

Expected result:

- deployment indicates success
- application route is available
- project opens

## Failed Deployment

1. Open logs.
2. Find failed stage.
3. Correct code or configuration.
4. Redeploy.
