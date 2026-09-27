# Phase 1: How It Works

URL:

```text
/how-it-works
```

## SEO Title

```text
How HelloDeploy Works | From Project to Production
```

## Meta Description

```text
Learn how HelloDeploy moves a supported web application from project configuration to build, deployment, HTTPS, domains, and production updates.
```

## H1

```text
What Happens When You Deploy a Website?
```

## Intro

A web application does not become publicly available simply because its source code exists.

Production deployment can involve dependencies, builds, application processes, ports, environment variables, networking, domains, HTTPS, and monitoring.

HelloDeploy organizes these steps into one guided workflow.

## Step 1: Project Source

HelloDeploy starts with the application source or a supported repository workflow.

Briefly explain repositories in plain language.

## Step 2: Project Configuration

Depending on runtime support, configuration may include:

- runtime
- build command
- start command
- application port
- environment variables
- deployment settings

## Step 3: Dependency Installation

Applications often depend on libraries or packages.

HelloDeploy installs dependencies according to the supported project workflow.

Do not name package managers unless verified.

## Step 4: Build

Some applications require:

- frontend asset generation
- TypeScript compilation
- production framework builds

The exact build process depends on the runtime and framework.

## Step 5: Start the Application

HelloDeploy starts the application using the configured runtime and start command.

Where relevant, explain that the application must listen on the expected port.

## Step 6: Verify the Deployment

Where supported, HelloDeploy checks whether the deployment appears to be running correctly.

Possible checks may include:

- process started
- expected port available
- application responds
- deployment status completed

Do not claim specific health checks until confirmed.

## Step 7: Route Web Traffic

Visitors need a way to reach the application.

Explain application ports and reverse proxies in simple terms.

Link:

```text
/learn/what-is-a-reverse-proxy
```

## Step 8: HTTPS

Explain:

- HTTPS protects traffic in transit
- domains must be configured correctly
- secure access depends on supported deployment behavior

## Step 9: Connect a Domain

Explain that DNS tells the internet where the domain should point.

Link:

```text
/docs/domains
/learn/what-is-dns
```

## Step 10: Logs and Future Updates

After deployment, users can review logs and redeploy when the application changes.

This creates a repeatable deployment workflow.

## Final CTA

Primary:

```text
Deploy Your First Project
```

Secondary:

```text
Read the Getting Started Guide
```
