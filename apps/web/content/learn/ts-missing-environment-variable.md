## Quick answer

Your application needs a value it does not have. Either it was never set on the project, or
it was set after the current release started — environment variables are supplied when a
container starts, so a change needs a redeploy.

## Symptoms

- An error naming a variable, or `undefined` where a value was expected.
- A connection failing to a service whose address should have been configured.
- Something that works locally and not once deployed.
- A build failing where a build-time variable is missing.

## Common causes

- The variable was never added to the project.
- It exists in a local `.env` file that is not committed — which is correct, but means
  production needs its own copy.
- It was added after the running release started, and nothing has redeployed since.
- The name differs: a typo, or different capitalisation.
- The build needs it, and it was only set for run time.

## How to check

1. Read the error. It usually names the variable.
2. Check the project's environment variables for that exact name, including case.
3. Compare against your local `.env` — anything there and not on the project is a candidate.
4. Check whether anything has deployed since the variable was added.
5. Decide whether it is needed at build time or run time, or both.

## How to fix

**Never set.** Add it to the project and redeploy.

**Set after the release started.** Redeploy. This is the common one, and it looks like the
value did not save when it simply has not been applied yet.

**Name mismatch.** Match what the code reads, exactly. `DATABASE_URL` and `Database_Url` are
different variables.

**Needed by the build.** Frontend builds read variables when they run, not when the site is
visited. Be careful: anything a frontend build reads is written into the files visitors
download, so never put a secret there.

## Verify

Redeploy, then check the logs for the error again. If the application reports its
configuration at startup, confirm the value is present — but never print a secret value to do
so.

## Prevent it recurring

Keep a committed example file listing every variable name with placeholder values. Anyone
setting the project up, including future you, then knows what is required without guessing.

## On HelloDeploy

Variables are encrypted at rest and supplied when the container starts, which is why a change
needs a redeploy. Four names — `PORT`, `NODE_ENV`, `HOST` and `HOSTNAME` — are set by the
platform and cannot be overridden.

## Related

- [What Are Environment Variables?](/learn/what-are-environment-variables)
- [Environment Variables](/docs/environment-variables)
