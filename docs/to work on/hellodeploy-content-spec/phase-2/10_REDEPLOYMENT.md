# Redeployment

URL: `/docs/redeployment`

## SEO Title

`Redeploy a Project With HelloDeploy | Update a Live Application`

## Meta Description

`Learn how to redeploy a HelloDeploy project after changing code, configuration, environment variables, or deployment settings.`

## H1

`Redeploying a Project`

## Intro

Redeployment publishes a new version of an existing project using its saved configuration.

You may need to redeploy after:

- updating application code
- changing build settings
- changing start command
- updating environment variables
- fixing a failed deployment

## Manual Redeployment

Document the exact action after UI verification.

## Source Updates

A deployment clones the exact commit it was created for, so redeploying reruns
the same configuration against whatever commit is being deployed rather than
picking up unrelated changes.

Pushing to the project's production branch can start a deployment automatically
through the GitHub webhook. A deployment can also be started manually or through
a deploy hook.

## Configuration Changes

Saving configuration does not deploy it. The new values take effect on the next deployment.

## Environment Variable Changes

Changes require a redeployment. Environment variables are passed to the container
when it starts, so a running application does not pick up a value added or changed
afterwards.

## Deployment History

Rollback exists and may be described as such. HelloDeploy keeps the three most
recent healthy releases per project; deploying a fourth stops and removes the
oldest. Rolling back switches traffic to one of the retained releases without
rebuilding it.

State the limit of three plainly. A reader who assumes every past release is kept
will eventually try to roll back to one that no longer exists.
