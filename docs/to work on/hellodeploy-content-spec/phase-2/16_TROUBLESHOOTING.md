# HelloDeploy Troubleshooting

URL: `/docs/troubleshooting`

## SEO Title

`HelloDeploy Troubleshooting | Fix Common Deployment Problems`

## Meta Description

`Troubleshoot failed builds, startup errors, missing environment variables, port problems, domain issues, DNS errors, and HTTPS problems in HelloDeploy.`

## H1

`Troubleshooting HelloDeploy`

## Start With the Failure Stage

Possible categories:

- project configuration
- dependency installation
- build
- application startup
- application routing
- domain
- DNS
- HTTPS

## Deployment Failed

Check:

1. deployment logs
2. first meaningful error
3. build command
4. start command
5. required environment variables
6. application port
7. runtime support

## Build Failed

Check command, dependencies, required configuration, runtime support, and whether the project builds locally where practical.

## Application Starts but Does Not Load

Check application port, process status, startup logs, runtime errors, and routing status if exposed.

## Missing Environment Variable

Check name, capitalization, value, and whether redeployment is required.

## Custom Domain Does Not Work

Check project assignment, DNS records, conflicting records, verification, and HTTPS status.

## Before Contacting Support

Collect:

- project name
- deployment ID
- approximate failure time
- relevant error message
- screenshot if useful

Do not send passwords, tokens, private keys, or secret environment variables.
