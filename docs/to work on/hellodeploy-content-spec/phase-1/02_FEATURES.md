# Phase 1: Features Page

URL:

```text
/features
```

## SEO Title

```text
HelloDeploy Features | Deployment, Domains, Logs and More
```

## Meta Description

```text
Explore HelloDeploy features including deployment management, environment variables, deployment logs, domains, HTTPS, redeployment, and deploy hooks.
```

## H1

```text
Deployment Tools Without the Usual Setup Overhead
```

## Intro

HelloDeploy brings common deployment tasks into one interface.

Instead of manually setting up every step of the deployment process, users can configure supported applications, deploy them, connect domains, manage environment variables, review logs, and publish updates from one place.

## Deployment Management

Create, configure, deploy, and manage supported applications through a central dashboard.

Possible actions:

- create a project
- configure deployment settings
- start deployment
- review deployment status
- redeploy
- manage domains
- review logs

## Build Configuration

Many applications require a build process before they can run in production.

HelloDeploy provides configuration for supported build workflows.

Only show framework-specific examples that are verified.

## Start Commands

HelloDeploy needs to know how the application should start after deployment.

Explain start commands using verified runtime examples.

## Environment Variables

Environment variables allow applications to use configuration values without storing them directly in source code.

Examples:

- database URLs
- API keys
- application secrets
- service credentials
- external endpoints

Never expose real secret values.

## Deployment Logs

Deployment logs help users understand:

- dependency installation
- build completion
- application startup
- runtime failures

Link to:

```text
/learn/what-are-deployment-logs
```

## HelloDeploy Subdomains

Supported projects may receive a HelloDeploy-managed project URL.

Example:

```text
my-project.hellodeploy.online
```

Do not claim this is available for every plan until confirmed.

## Custom Domains

Users on supported plans can connect domains they already own.

Make clear that domain registration is separate unless explicitly included.

Related links:

```text
/docs/domains
/learn/what-is-dns
/learn/why-hellodeploy-uses-a-cname
```

## HTTPS

Explain that HTTPS protects traffic between the browser and website.

Do not claim specific certificate automation behavior until verified.

## Redeployment

Users can publish updated versions without recreating the entire project configuration.

## Deploy Hooks

Explain:

- what a deploy hook is
- how it triggers deployment
- why the URL must remain private
- when external workflows may use it

Never show real deploy-hook URLs.

## Project Dashboard

The dashboard should help users understand:

- current status
- recent deployment
- domain
- deployment settings
- environment configuration
- logs
- deployment actions

## Final CTA

```text
See How These Features Work Together
```

Link:

```text
/how-it-works
```
