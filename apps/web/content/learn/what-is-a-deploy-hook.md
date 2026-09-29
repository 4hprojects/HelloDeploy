A deploy hook is a private URL that starts a deployment when something sends a request to it.

## What it means

Deployments usually start in one of two ways: you press a button, or you push code. A deploy
hook adds a third — a URL that any system can call to trigger one.

It is deliberately simple. There is nothing to install and no credentials to exchange. The
URL contains a secret token, and holding the URL is the whole of the authorisation.

## How it triggers a deployment

A program sends an HTTP `POST` request to the URL. The platform recognises the token, works
out which project it belongs to, and queues a deployment exactly as if you had pressed
deploy.

Whatever called it does not wait around. The request returns quickly; the deployment happens
afterwards.

## It is a webhook in reverse

A webhook is something _you_ receive: a service tells you an event happened. A deploy hook is
something you _expose_ so another system can tell you to act.

The mechanics are the same — an HTTP request to a URL — but the direction, and therefore who
needs to keep the secret, is reversed.

## What people use them for

- A content management system rebuilding a site when an editor publishes something.
- A scheduled job redeploying nightly, to pick up data that changes on a timer.
- The final step of a pipeline that runs somewhere else.
- A manual trigger from a script, when pressing a button in a browser is inconvenient.

If all you want is "deploy when I push", you do not need a hook. Automatic deployment on push
already does that, and it involves no secret you have to protect.

## The security part

The URL is a password. Anyone who has it can deploy your project, repeatedly.

- Keep it wherever you keep secrets, not in a repository.
- Never put it in client-side code — anything a browser can read is public.
- Do not paste it into issues, chat, or screenshots.
- If it leaks, generate a new one. That immediately invalidates the old URL.

Platforms typically store only a hash of the token and show you the full URL once, so losing
it means generating a new one rather than looking it up.

## Manual deployment versus a deploy hook

|                 | Manual               | Deploy hook                    |
| --------------- | -------------------- | ------------------------------ |
| Who triggers it | A signed-in person   | Any system with the URL        |
| Authentication  | Your account session | The token in the URL           |
| Best for        | Deliberate releases  | Automation                     |
| Risk if leaked  | None specific        | Anyone can deploy your project |

## How HelloDeploy handles it

HelloDeploy gives each project a hook URL of the form
`/api/deploy-hooks/[project-id]/[token]`. Only a hash of the token is stored, the URL is
shown once, and generating a new token immediately kills the old one. Requests are rate
limited, and hooks appear in Advanced mode alongside other infrastructure controls. See
[Deploy Hooks](/docs/deploy-hooks).
