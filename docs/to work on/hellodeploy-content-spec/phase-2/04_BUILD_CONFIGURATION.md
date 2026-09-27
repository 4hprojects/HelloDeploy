# Build Configuration

URL: `/docs/build-configuration`

## SEO Title

`Build Configuration in HelloDeploy | Build Command Guide`

## Meta Description

`Learn what a build command does, when your application needs one, how to configure it in HelloDeploy, and how to troubleshoot build failures.`

## H1

`Build Configuration`

## Intro

Some applications need to be transformed or prepared before they can run in production. This process is commonly called a build.

A build may compile source code, generate production assets, bundle frontend files, or prepare framework output.

## What Is a Build Command?

A build command is the command HelloDeploy runs during the build stage for supported projects.

Only include runtime examples that have been verified.

## When Do You Need One?

Common cases:

- TypeScript applications
- frontend frameworks
- applications that generate production bundles
- frameworks with a production build step

## How to Configure It

After verifying the UI:

1. Open the project.
2. Open deployment settings.
3. Locate Build Command.
4. Enter the verified command.
5. Save changes.
6. Redeploy if required.

## Common Build Failures

- dependency missing
- invalid build command
- missing script
- missing environment variable
- unsupported runtime or version

## Troubleshooting

1. Open deployment logs.
2. Find the build stage.
3. Identify the first meaningful error.
4. Confirm the build works locally where practical.
5. Correct configuration.
6. Redeploy.

Related: `/docs/deployment-logs`, `/docs/redeployment`
