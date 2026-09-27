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

Document exact UI statuses. Do not invent labels.

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
