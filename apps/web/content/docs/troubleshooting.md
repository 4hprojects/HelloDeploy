Most deployment problems fall into a handful of shapes. This page is a triage guide: find the
shape, then go to the page that covers it.

## Start with the stage that failed

Deployment logs separate dependency installation, the build, startup and the health check.
Knowing which one failed narrows the cause more than any other single fact.

| Failed at    | Look at                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| Dependencies | A missing or wrong lockfile — see [Build Configuration](/docs/build-configuration)  |
| Build        | Your build command, or a variable the build needs                                   |
| Startup      | Your start command — see [Start Command](/docs/start-command)                       |
| Health check | The port, or the health check path — see [Application Port](/docs/application-port) |

## The build fails

**Dependencies will not install.** Builds run `npm ci`, which needs a `package-lock.json`
committed. A project locking with pnpm or Yarn needs an npm lockfile added. Full guide:
[Dependency Installation Failed](/learn/troubleshooting/dependency-installation-failed).

**The build command fails.** Run the same command locally from a clean checkout. A build that
only works with files you have locally and have not committed will fail here. Full guide:
[Build Command Failed](/learn/troubleshooting/build-command-failed).

**Something is missing that exists on your machine.** Anything not committed does not reach
the build. That includes `.env` files, which is the point of environment variables.

## It builds but never becomes healthy

This almost always means nothing answered the health check.

- **Wrong port.** Read `process.env.PORT`. HelloDeploy injects it; an application bound to a
  different port never answers.
- **Bound to localhost.** Inside a container, `127.0.0.1` is unreachable from outside. Bind
  to all interfaces.
- **The process exited.** A start command that runs and finishes looks like a start followed
  immediately by a stop. It has to stay running.
- **The health check path errors.** HelloDeploy requests `/` by default. If that returns an
  error, point the health check at a path that responds.

Full guides: [The app starts but the site does not
load](/learn/troubleshooting/app-starts-but-site-does-not-load),
[Application port is incorrect](/learn/troubleshooting/application-port-incorrect), and
[The application keeps restarting](/learn/troubleshooting/application-keeps-restarting).

## It works locally but not deployed

The environments differ in ways that are easy to forget:

- Environment variables you have locally and have not set on the project.
- File paths that differ in case — the container is case-sensitive even if your machine is
  not.
- Runtime versions.
- Services reachable from your machine but not from the server.
- A build step you run manually and have not configured.

Change one thing at a time and redeploy, rather than several at once. Otherwise a fix and a
new problem cancel out and you learn nothing. Full guide: [Works locally but fails on
HelloDeploy](/learn/troubleshooting/works-locally-but-fails-on-hellodeploy).

## A change did not take effect

Saving configuration does not deploy it, and environment variables are passed to the
container when it starts. Add or change what you need, then redeploy. See [Redeployment](/docs/redeployment) and
[Missing environment variable](/learn/troubleshooting/missing-environment-variable).

## A push did not deploy

Automatic publishing requires a reviewed, active project connected to GitHub. It is also
paused deliberately when a push changes infrastructure files, in which case the owner is
emailed. [Redeployment](/docs/redeployment) lists the paths that trigger this.

## The domain does not work

Work through it in order, because each step depends on the last:

1. Does the `hellodeploy.online` project address work? If not, this is a deployment problem,
   not a domain one.
2. Has verification succeeded?
3. Has provisioning finished? Until it has, there is no CNAME target to add.
4. Is the CNAME correct, and is there an old conflicting record at the same name?
5. Does root differ from `www`? They are separate hostnames needing separate tunnel entries.

Full guides: [Custom domain is not resolving](/learn/troubleshooting/custom-domain-not-resolving),
[DNS points to the wrong server](/learn/troubleshooting/dns-points-to-wrong-server),
[The root domain works but www does not](/learn/troubleshooting/root-domain-works-www-does-not),
[www works but the root domain does not](/learn/troubleshooting/www-works-root-domain-does-not),
and [SSL certificate is not working](/learn/troubleshooting/ssl-certificate-not-working).

See also [Connect a Custom Domain](/docs/custom-domain) and
[DNS Configuration](/docs/dns-configuration).

## The site was working and now is not

Check whether a recent deployment failed. A failed deployment leaves the previous release
serving, so the site should still be up — if it is not, the problem is more likely the
application than the deployment.

Rolling back to a recent healthy release is the fastest way to restore service while you
investigate. HelloDeploy keeps the three most recent.

If you are seeing a specific HTTP error: [502 Bad
Gateway](/learn/troubleshooting/502-bad-gateway) or [404 after
deployment](/learn/troubleshooting/404-after-deployment).

## When to ask for help

Some things are not fixable from your side: a domain the tunnel does not cover, provisioning
that has not completed, or a platform fault. When you ask, include your project address,
which deployment it concerns, the exact error text, and what you have already tried.

Never include passwords, API keys, tokens, deploy hook URLs, or secret environment variable
values in a support message.
