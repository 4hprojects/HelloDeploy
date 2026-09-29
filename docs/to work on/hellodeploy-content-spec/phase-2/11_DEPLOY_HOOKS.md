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

A deploy hook is a project-specific URL of the form:

```text
POST https://<platform-domain>/api/deploy-hooks/<project-id>/<token>
```

Sending a POST request to it starts a deployment. It carries no session and no
user, so the token in the URL is the entire credential — treat it like a password.

Deploy hooks are an infrastructure control, so they are hidden in Simple mode and
exposed in Advanced mode.

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

Requests to a deploy hook are rate limited, and a token can be regenerated if it leaks.
