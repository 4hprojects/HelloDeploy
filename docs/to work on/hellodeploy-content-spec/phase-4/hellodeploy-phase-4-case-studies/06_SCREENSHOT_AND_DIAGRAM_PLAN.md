# Phase 4 Screenshot and Diagram Plan

## Purpose

Case studies should contain original visuals wherever useful.

These visuals should demonstrate real deployment work.

## Standard Screenshot Set

Aim for 3 to 6 useful screenshots per case study.

Possible screenshots:

1. HelloDeploy project overview
2. successful deployment status
3. sanitized deployment logs
4. environment variable names
5. custom domain configuration
6. live production application

Do not include screenshots only to increase page length.

## Architecture Diagram

Every case study should include one simple architecture diagram.

Example:

```text
User
 ↓
Custom Domain
 ↓
HelloDeploy
 ↓
Application
 ├── Database
 ├── Authentication
 └── External Services
```

Customize it to the actual project.

## Before and After Visual

Where a real problem existed, consider:

```text
Before:
Custom domain fails

After:
Custom domain resolves correctly
```

Avoid visually exposing sensitive infrastructure details.

## Screenshot Caption Standard

Captions should explain why the screenshot matters.

Good:

```text
The deployment completed successfully before the custom domain was connected, helping isolate the remaining issue to DNS configuration.
```

Weak:

```text
Deployment screenshot.
```

## Image Alt Text

Describe the actual image.

Example:

```text
HelloDeploy deployment dashboard showing a successful HelloUniversity deployment
```
