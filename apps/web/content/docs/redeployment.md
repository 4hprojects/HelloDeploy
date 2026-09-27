Publishing an update reuses your existing configuration, so it is the same short workflow
rather than a fresh setup.

## Publishing an update

Push your changes, then deploy. HelloDeploy clones the commit being deployed and runs the
same build and start configuration against it.

Your settings are not re-detected. If your project has changed in a way that affects how it
builds — a new framework, a different output directory — update the configuration first.

## Automatic publishing

A project can publish automatically when you push to its production branch. Two things are
required:

- The project must be **reviewed and active**. Automatic publishing becomes available once a
  website has been reviewed.
- The project must be connected to **GitHub**, since the push has to reach HelloDeploy.

Otherwise you publish when you choose to.

## Automatic publishing pauses on risky changes

If a push changes infrastructure-level files, HelloDeploy pauses automatic publishing for
that project, flags it for review, and emails the owner. The paths that trigger this are:

```text
Dockerfile
docker-compose*
.dockerignore
nginx.*
.github/workflows/
infrastructure/
deploy/
.platform/
```

This is deliberate. Those files change how something is built or served rather than what it
does, so they get a human look before they deploy automatically. Publishing manually still
works.

## Configuration changes need a deployment

Saving configuration does not apply it. The same is true of environment variables, which are
passed to the container when it starts — a running application does not see a value that was
added or changed afterwards.

Save what you need, then deploy.

## Rolling back

HelloDeploy keeps the **three most recent healthy releases** for each project. Rolling back
switches traffic to one of them without rebuilding it, so it is fast.

Deploying a fourth healthy release stops and removes the oldest. Do not plan on returning to
a release older than that — it will not be there.
