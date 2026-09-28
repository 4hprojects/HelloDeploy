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

## Recognisable secrets are redacted

Log output is scanned before it is stored or streamed, and things that _look_ like credentials
are replaced with `[REDACTED]`: GitHub, AWS and npm tokens, bearer headers, JSON web tokens,
private key blocks, and assignments such as `password=`.

**This is pattern matching, not knowledge of your values.** HelloDeploy does not compare log
output against the environment variables you set, so a secret that does not match one of those
shapes will appear in the log. A database URL with the password inside it, or an application
printing its own configuration at startup, are the common ways this happens:

```text
DATABASE_URL=postgres://user:hunter2@db.example.com:5432/app
{ STRIPE_SECRET: 'rk_live_51H8xyz' }
```

Neither of those is redacted.

So treat redaction as a safety net that catches the obvious cases, not a guarantee. Read a log
before you share it.

## Reading a failure

Work from the bottom up. The last error before the process stopped is usually the real one;
the lines after it are often consequences. Then check which stage it happened in, because the
same message means different things during a build and during startup.

If a deployment fails without an obvious error, check whether the application started and
then exited — a start command that runs and finishes looks like a successful start followed
by an immediate stop.
