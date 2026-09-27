# Deploy Hooks

URL: `/docs/deploy-hooks`

## SEO Title

`HelloDeploy Deploy Hooks | Trigger Deployments From External Workflows`

## Meta Description

`Learn how HelloDeploy deploy hooks trigger deployments, when to use them, and why deploy hook URLs must be kept private.`

## H1

`Deploy Hooks`

## Intro

A deploy hook is a private URL that can trigger a deployment for a configured project.

## How It Works

```text
External Service
      ↓
Deploy Hook URL
      ↓
HelloDeploy
      ↓
New Deployment
```

## Common Uses

- CI workflow
- content publishing workflow
- repository automation
- scheduled external process
- custom deployment trigger

Only describe integrations that are technically possible.

## Creating a Hook

Document exact steps after verifying the UI.

## Triggering the Hook

Verify the supported HTTP method. Do not assume GET or POST.

If opening the URL in a browser triggers deployment, state that only if confirmed.

## Security

Treat a deploy hook like a secret.

Do not:

- commit it to a public repository
- show it in screenshots
- publish it in documentation
- place it in frontend code

## Revoking or Rotating Hooks

Document only if implemented.
