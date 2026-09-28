## Quick answer

A development machine and a production container are not the same environment. Differences in
environment variables, build and start commands, runtime versions, ports, file paths,
database access or external services all produce failures that only appear once deployed.

## Why the environments differ

Your machine has accumulated state: installed tools, global packages, files you never
committed, environment variables set months ago, services running in the background.

A container starts from nothing and is given only what the configuration says. That is a
feature — it is what makes deployments repeatable — but it means anything you forgot to
declare is simply absent.

## Common causes

- **A missing environment variable.** It is in your local `.env`, which is not committed.
- **An uncommitted file.** If it is not in the repository, it does not exist in the build.
- **File path capitalisation.** `./Components/Button` works on macOS or Windows and fails on
  Linux.
- **A different runtime version** than the one you have locally.
- **A hardcoded port.** In production the port is assigned; read `PORT`.
- **Binding `localhost`.** Inside a container that means the container itself.
- **A database or service** reachable from your machine but not from the server.
- **An OAuth callback URL** registered for `localhost` only.
- **A build step you run by hand** and never configured.

## How to check

The single most useful test: clone your repository into a new directory, install, build and
run it there. Not your working copy — a clean checkout, which is what the platform gets.

Most "works locally" problems reproduce immediately, because the missing thing was never
committed.

Then:

1. Read the deployment logs and find which stage failed.
2. Compare your local `.env` against the project's environment variables.
3. Check paths for capitalisation.
4. Check the runtime version.
5. Confirm external services are reachable from outside your network.

## How to fix

Fix the first confirmed difference, then redeploy and look again.

Resist changing several things at once. When a fix and a new problem land together, you
cannot tell which change did what, and you end up further from understanding than you
started.

## Verify

After each change: redeploy, read the logs, test the project address, and note whether the
failure changed. A failure that changes is progress even when it is still a failure.

## A useful habit

Commit an example environment file listing every variable name with placeholder values. It
turns "what does this project need?" from archaeology into reading one file — and it is the
difference most often responsible for this whole class of problem.

## On HelloDeploy

The deployment logs separate installation, the build, startup and the health check, so start
by identifying which stage failed — that narrows the difference faster than comparing
environments in the abstract. See [Troubleshooting](/docs/troubleshooting).

## Related

- [What Are Environment Variables?](/learn/what-are-environment-variables)
- [Troubleshooting](/docs/troubleshooting)
