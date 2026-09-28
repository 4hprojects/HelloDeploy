Deployment logs are the running commentary a deployment writes about itself. When something
fails, they are where the reason is.

## What they are

As a deployment runs, each step reports what it is doing: which packages are installing, what
the build printed, whether the application started, whether it responded. That output,
collected in order, is the log.

It is the only account of what actually happened, as opposed to what was supposed to.

## Build logs and runtime logs

They answer different questions and it is worth knowing which one you are reading.

**Build logs** cover preparing the project: downloading dependencies, compiling, bundling. A
failure here means the project could not be made ready. It has nothing to do with whether
your code works.

**Startup and runtime logs** cover the application running: the messages it prints when it
starts, and any errors after that. A failure here means the project was built fine and then
did not run.

A build that succeeds followed by a startup that fails is a very different problem from a
build that never completed, even though both show up as "the deployment failed".

## Warnings are not errors

Logs are full of warnings: deprecated packages, peer dependency complaints, advice about
future versions. Almost all of them are noise during a failure investigation.

Look for the error. Warnings that have been there for months are not the reason today's
deployment broke.

## Find the first meaningful error

Errors cascade. One genuine failure produces a dozen follow-on messages, and the last line is
usually the least informative — something like "command failed with exit code 1", which tells
you only that something went wrong.

Scroll back to the _first_ real error. That is generally the cause; everything after it is
consequence.

## Reading them well

- Check which stage you are in before interpreting a message.
- Read the first error, not the last.
- Ignore warnings until the error is understood.
- If the application starts and immediately stops, look for what it printed just before
  exiting.
- Compare against a deployment that worked, if you have one.

## Be careful when sharing them

Logs can contain more than you expect: internal paths, hostnames, package versions, sometimes
values an application printed about its own configuration.

Before pasting a log into an issue, a chat message, or a support request, read what you are
about to share. Remove anything that looks like a credential, and rotate it if it was a real
one — assume anything posted publicly is now public.

## How HelloDeploy handles it

HelloDeploy streams logs while a deployment runs and keeps them readable afterwards, for
failures as well as successes. The stages are separated, so a failure points at installation,
the build, startup, or the health check.

Output matching known credential shapes — GitHub, AWS and npm tokens, bearer headers, JSON
web tokens, private keys — is replaced before logs are stored or streamed. That is pattern
matching, not a comparison against the values you set, so a database URL with a password in it
or an application printing its own configuration will still appear. See
[Deployment Logs](/docs/deployment-logs).
