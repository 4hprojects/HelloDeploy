# Application Port

URL: `/docs/application-port`

## SEO Title

`Application Port in HelloDeploy | Port Configuration Guide`

## Meta Description

`Learn what an application port is, how HelloDeploy uses it, and what to check when a deployed application is listening on the wrong port.`

## H1

`Application Port`

## Intro

A running web application usually listens for requests on an internal network port. HelloDeploy needs to route incoming traffic to the port used by the application where this configuration applies.

## Simple Explanation

The port is the internal network location used by the application process. Visitors normally do not type this internal port into the public URL because the platform routes traffic to it.

## Platform-Provided Port

If HelloDeploy provides a `PORT` environment variable or similar mechanism, document the exact behavior only after verification.

## Common Symptoms

- deployment succeeds but site does not load
- application starts but cannot receive external traffic
- logs show another port
- health verification fails if implemented

## How to Check

1. Review startup logs.
2. Find the port reported by the application.
3. Compare it with HelloDeploy configuration.
4. Check whether the application reads the platform-provided value where required.

Related: `/docs/start-command`, `/docs/deployment-logs`
