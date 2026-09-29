## Quick answer

Your application starts, stops, and starts again. Something is making the process exit — an
error during startup, a crash shortly after, or a command that was never meant to keep
running.

## Symptoms

- The same startup messages repeating in the logs.
- The site loading intermittently, or not at all.
- A deployment that never settles into a healthy state.

## Common causes

- **An unhandled error during startup**, such as failing to reach a database.
- **A crash shortly after starting**, on the first request or a background task.
- **A start command that finishes.** A script that completes exits, and exiting looks like
  stopping.
- **Running out of memory.** The process is killed and restarted.
- **A failing dependency at startup** that the application treats as fatal.

## How to check

1. Look at what is printed immediately before each restart. That is the reason.
2. Check whether the messages are identical each time — a consistent failure — or vary, which
   suggests something intermittent like memory.
3. Confirm your start command runs a server rather than a task that completes.
4. Check whether anything the application needs at startup is unreachable.
5. Look for an error that is caught and logged but leaves the process unable to continue.

## How to fix

**Startup error.** Fix the underlying cause. If it is an external service, consider whether
the application must have it before it can serve anything — often it should start and degrade
rather than refuse to run.

**Crash after starting.** Find the error in the logs and handle it. An unhandled rejection or
exception ends the process in Node by default.

**A command that finishes.** Use your project's production start script, not a build step or
a migration.

**Memory.** Reduce what is held at startup. A process killed for memory often leaves a
truncated or unhelpful log.

## Verify

Redeploy and watch for a single start with no repeats. A healthy deployment starts once,
passes its health check, and stays.

## A note on restarts

Restarting a crashed process is correct behaviour — it is what keeps a site up through a
transient fault. A restart _loop_ is that mechanism failing to help, because the cause is
present every time. The fix is the cause, not the restarting.

## On HelloDeploy

A release that never reaches a healthy state is rolled back, leaving the previous one
serving. The deployment logs show each start attempt, so the error printed before each restart
is visible. See [Deployment Logs](/docs/deployment-logs).

## Related

- [What Is a Start Command?](/learn/what-is-a-start-command)
