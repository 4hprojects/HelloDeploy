A deploy hook is a private URL that starts a deployment when something sends a request to it.
It is how a script, a scheduled job, or an external workflow triggers a release.

## The URL

```text
POST https://[your-platform-domain]/api/deploy-hooks/[project-id]/[token]
```

A `POST` request to it queues a deployment for that project. There is no session and no user
involved — the token in the URL is the entire credential.

## Treat the URL as a password

Anyone holding it can deploy your project. In practice that means:

- Store it where you store secrets, not in a repository.
- Do not paste it into an issue, a chat message, or a screenshot.
- Do not put it in client-side code, where any visitor can read it.

HelloDeploy stores only a hash of the token. The full URL is shown once when it is created
and cannot be recovered afterwards — if you lose it, generate a new one.

## Generating and revoking

Generating a token replaces any existing one, so the previous URL stops working immediately.
That is also how you respond to one leaking: generate a new token and the old URL is dead.

A hook can also be revoked outright, leaving the project with no hook URL at all.

## Rate limiting

Requests to a deploy hook are rate limited. A loop that calls it repeatedly will be refused
rather than queueing a deployment each time.

## Where to find it

Deploy hooks are an infrastructure control, so they appear in Advanced mode. Simple mode
hides them along with ports and runtime configuration — nothing is removed, and switching to
Advanced brings them back.

## When to use one

A deploy hook is useful when something other than a push should trigger a release: a content
change in an external system, a nightly rebuild, or a step at the end of a pipeline you run
elsewhere. If you simply want to deploy when you push, use automatic publishing instead —
it needs no secret to protect.
