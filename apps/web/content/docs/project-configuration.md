A project is the unit HelloDeploy deploys: a repository, the settings needed to build and run
it, its environment variables, and its domains.

## What a project holds

| Setting           | What it does                                                        |
| ----------------- | ------------------------------------------------------------------- |
| Build command     | The command that prepares your project for production               |
| Start command     | The command that runs your application                              |
| Output directory  | Where a build writes its files, for projects served as static sites |
| Application port  | The port your server listens on inside the container                |
| Health check path | The path HelloDeploy requests to decide a deployment is healthy     |

Not every project uses all of them. A static site has no start command and no port; a plain
Node server has no output directory.

## Detected, then confirmed

When you connect a repository, HelloDeploy inspects it and fills these in. It also records
how confident it is about each one, because the evidence differs:

- A build command declared in your `package.json` is strong evidence.
- A command filled in from a framework's convention is weaker.
- A port assumed because 3000 is common is weakest of all.

The interface flags the settings it guessed, so you can check those rather than re-reading
everything. A wrong assumption here is the most common reason a first deployment fails.

## Changing settings later

Saving configuration does not deploy it. New values apply on the next deployment, so change
what you need and then redeploy.

## Health check path

By default HelloDeploy requests `/`. If your application returns an error at the root but
serves something useful elsewhere, point the health check at a path that responds — otherwise
a working deployment is treated as failed and rolled back.

## Build filters

A project can include or ignore paths when the build context is assembled. This matters for
repositories that hold more than one thing, where sending everything to the build is slow or
leaks files the build does not need.
