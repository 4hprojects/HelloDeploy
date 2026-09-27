This guide takes a project from a Git repository to a running website. It assumes you have
a HelloDeploy account and a repository you can deploy.

## Before you start

You need a repository containing a project HelloDeploy can build. Check
[Supported Runtimes](/supported-runtimes) if you are not sure yours qualifies — a runtime is
only listed as supported once a full deployment has been tested against it.

Your project also needs a `package-lock.json` committed. Builds install dependencies with
`npm ci`, so a project that locks with pnpm or Yarn will not install until an npm lockfile
is present. HelloDeploy warns you about this before deploying rather than letting the build
fail.

## Step 1: Connect a repository

Start a new deployment and choose your source. HelloDeploy reads the repository and inspects
it — package files, lockfile, framework markers — to work out what kind of project it is.

## Step 2: Review what was detected

HelloDeploy shows what it found and, importantly, what it had to assume. A build command
declared in your `package.json` is strong evidence; a port it guessed from convention is not.

Anything marked as assumed is worth checking, because a wrong assumption here is the most
common reason a first deployment fails.

## Step 3: Set the application port

If your project runs a server, it must listen on the port HelloDeploy gives it. HelloDeploy
injects a `PORT` environment variable when your container starts, set to the application port
configured on the project:

```js
const port = process.env.PORT || 3000;
app.listen(port);
```

Read `PORT` rather than hardcoding a number. An application bound to a different port never
answers the health check, so the deployment starts and then fails.

`PORT` is managed by the platform and cannot be set as one of your own environment
variables. The same is true of `NODE_ENV`, `HOST` and `HOSTNAME`.

A React or Vue single-page application has no start command and no port — it is built to
static files and served as a static site.

## Step 4: Add environment variables

Anything your project reads from the environment — database URLs, API keys, service
credentials — is set here rather than committed to your repository. Values are encrypted at
rest and passed to the container when it starts.

Because they are passed at start, changing one later needs a redeploy before the running
application sees it.

## Step 5: Name your website

Your project gets an address on the platform, such as `your-project.hellodeploy.online`. This
works immediately and needs no DNS configuration. Connecting a domain you own is a separate step,
covered in the domains documentation.

## Step 6: Deploy

HelloDeploy clones the exact commit, installs dependencies, runs your build, starts the
container, and checks that the application actually responds before sending any traffic to
it.

Watch the logs as it runs. They cover dependency installation, the build, startup and the
health check, so a failure points at the stage that broke rather than leaving you guessing.
Secret values are redacted, so an environment variable's value never appears in them.

## Step 7: Check the result

A deployment that reaches `HEALTHY` is running and serving traffic. If it fails, your previous
release keeps serving — a failed deployment never takes your site down.

## What next

- Publish an update by redeploying. Your configuration is reused, so it is the same short
  workflow rather than a fresh setup.
- If an update goes wrong, roll back. HelloDeploy keeps the three most recent healthy
  releases, so you can return to one without rebuilding it.
- If something is not working, the deployment logs are the first place to look.
