# Case Study Brief: HelloRun

## Working Title

```text
Deploying HelloRun From Development to Production With HelloDeploy
```

## Suggested URL

```text
/case-studies/hellorun
```

## Purpose

Use HelloRun to demonstrate a more feature-rich production application and the deployment considerations that come with it.

## Core Questions

The case study should answer:

- What does HelloRun do?
- What services does it depend on?
- What must be configured for production?
- How does HelloDeploy fit into the architecture?
- How are environment-specific values handled?
- How is the custom domain connected?
- What real deployment issues occurred?
- How are updates published?

## Required Evidence

Verify:

- current live URL
- current runtime
- current framework
- current database
- authentication architecture
- storage services if any
- email service if any
- OCR or other external service if relevant to deployment
- build command
- start command
- port
- environment variables
- domain and DNS
- HTTPS
- deployment update workflow

## Suggested Structure

### H1

```text
Deploying HelloRun From Development to Production With HelloDeploy
```

### Project Overview

Explain HelloRun without turning the article into a full product overview.

Focus on deployment-relevant characteristics.

### Production Requirements

Possible categories:

- authentication
- database
- activity data
- uploaded evidence
- external services
- environment secrets
- custom domain

Only include verified architecture.

### Deployment Architecture

Create a real diagram.

Possible high-level form:

```text
Users
  ↓
hellorun.online
  ↓
HelloDeploy
  ↓
HelloRun Application
  ├── Database
  ├── Authentication
  ├── Email
  └── Other External Services
```

Update based on reality.

### Environment Configuration

Explain categories, not secret values.

### Deployment Process

Document the actual HelloDeploy flow.

### Domain Configuration

Explain how `hellorun.online` connects to the deployment.

### Problems Encountered

Prioritize real issues that teach something useful.

Examples only if they happened:

- environment variable mismatch
- runtime/configuration issue
- DNS error
- production-only bug
- external service callback URL mismatch

### Redeployment

Explain how a new HelloRun version is published.

### Final State

Document confirmed production behavior.

### Lessons Learned

Focus on practical issues from a real multi-service application.

## Screenshot Plan

Potential screenshots:

- project dashboard
- environment variable names only
- deployment log
- domain configuration
- production homepage
- architecture diagram

## Related Links

- Environment Variables
- Custom Domains
- Deployment Logs
- Redeployment
- Application Works Locally but Fails on HelloDeploy

## CTA

```text
See how HelloDeploy manages a production deployment
```
