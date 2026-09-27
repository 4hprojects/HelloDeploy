Deployment logs are the record of what happened during a deployment. When something fails,
they are the first place to look.

## Reading them

Open a project, then the deployment you are interested in. Logs stream while a deployment
runs and stay readable afterwards, for deployments that succeeded as well as those that
failed.

## What they cover

- Dependency installation
- The build
- Container startup
- The health check

Because the stages are distinct, a failure tells you which one broke. That is usually enough
to know where to look: a build that fails is a problem in your project, while a build that
succeeds and a health check that fails is usually a port or startup problem.

## Secret values are redacted

Environment variable values are removed from log output before it is stored or streamed, so a
secret does not leak into a log you might later paste into a support message.

This is not a reason to be careless — an application that prints its own configuration can
still expose things HelloDeploy does not know are secret.

## Reading a failure

Work from the bottom up. The last error before the process stopped is usually the real one;
the lines after it are often consequences. Then check which stage it happened in, because the
same message means different things during a build and during startup.

If a deployment fails without an obvious error, check whether the application started and
then exited — a start command that runs and finishes looks like a successful start followed
by an immediate stop.
