# Deployment Logs

URL: `/docs/deployment-logs`

## SEO Title

`HelloDeploy Deployment Logs | Read and Troubleshoot Deployments`

## Meta Description

`Learn how to read HelloDeploy deployment logs, find the first useful error, and troubleshoot failed builds or application startup problems.`

## H1

`Deployment Logs`

## Intro

Deployment logs show what happened while HelloDeploy prepared and started your application. When a deployment fails, logs are usually the best place to begin.

## Opening Logs

Document the exact interface path after verification.

## What Logs May Show

- source preparation
- dependency installation
- build output
- startup output
- warnings
- errors

## How to Read a Failed Deployment

1. Find the failed stage.
2. Find the first meaningful error.
3. Read the lines before it for context.
4. Compare with local behavior where practical.
5. Fix and redeploy.

## Security

Before sharing logs publicly, remove:

- tokens
- passwords
- connection strings
- private URLs
- personal information
- secret headers

Related: Build Configuration, Start Command, Application Port, Environment Variables, Troubleshooting.
