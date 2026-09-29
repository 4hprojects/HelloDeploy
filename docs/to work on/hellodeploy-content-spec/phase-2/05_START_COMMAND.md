# Start Command

URL: `/docs/start-command`

## SEO Title

`Start Command in HelloDeploy | Application Startup Guide`

## Meta Description

`Learn how to configure the command HelloDeploy uses to start your application after deployment.`

## H1

`Start Command`

## Intro

After a project is prepared, HelloDeploy needs to know how the application should run.

The start command tells the deployment environment how to launch the application.

## Example

Use only verified runtime examples. Do not imply that all applications use the same command.

## Development vs Production Commands

Explain that a development server may differ from the production command and may not be suitable for deployment.

## How to Configure It

After verifying HelloDeploy UI:

1. Open the project.
2. Open deployment settings.
3. Locate Start Command.
4. Enter the correct command.
5. Save.
6. Redeploy if required.

## Common Problems

- command does not exist
- application exits immediately
- required environment variable missing
- wrong application port

Related: `/docs/application-port`, `/docs/deployment-logs`
