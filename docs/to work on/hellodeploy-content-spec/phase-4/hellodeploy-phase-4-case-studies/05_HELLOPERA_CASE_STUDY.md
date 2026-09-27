# Case Study Brief: HelloPera

## Working Title

```text
Deploying HelloPera With HelloDeploy
```

Alternative:

```text
Deploying a Modern Web Application With HelloDeploy: HelloPera
```

## Suggested URL

```text
/case-studies/hellopera
```

## Purpose

Use HelloPera to demonstrate deployment of a modern application that relies on external platform services.

The final article should be written only after the current production architecture is verified.

## Core Questions

- What is HelloPera?
- What services does it use?
- What environment configuration does it require?
- How does authentication affect production configuration?
- How does the application connect to its database?
- How is the domain connected?
- What production-specific issues were encountered?
- What did HelloDeploy need to run the app correctly?

## Required Evidence

Verify:

- current production URL
- runtime
- framework
- TypeScript or JavaScript status
- database provider
- authentication provider
- OAuth callback URLs
- build command
- start command
- deployment output
- environment variables
- domain
- HTTPS
- any PWA-specific production requirements

## Suggested Structure

### H1

```text
Deploying HelloPera With HelloDeploy
```

### Project Overview

Describe the application at a high level.

Focus on deployment-relevant aspects.

### Technical Architecture

Potential structure if verified:

```text
Users
  ↓
hellopera.online
  ↓
HelloDeploy
  ↓
HelloPera Application
  ↓
External Database / Authentication Services
```

### Authentication and Production URLs

If OAuth is used, explain why production callback URLs must match the deployed domain.

This can become a particularly useful original section.

### Environment Variables

Document categories such as:

- database URL
- public app URL
- authentication configuration
- provider keys

Never publish real values.

### Deployment Configuration

Document verified build/start configuration.

### Domain Setup

Explain `hellopera.online` configuration.

### Production Problems

Strong potential topics include:

- localhost callback URL left in configuration
- production domain mismatch
- environment variable differences
- database connection configuration

Only include issues that actually happened.

### Final Deployment

Document confirmed production behavior.

### Lessons Learned

Focus on modern app deployment with external services.

## Recommended Screenshots

- HelloDeploy project screen
- domain configuration
- OAuth configuration with sensitive values hidden
- sanitized environment variable names
- live HelloPera interface

## Related Links

- Environment Variables
- Custom Domains
- HTTPS
- Application Works Locally but Fails on HelloDeploy
- Deployment Logs
