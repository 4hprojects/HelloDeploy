# HelloDeploy User Guide

This guide explains the normal user flow for deploying a web application with HelloDeploy.

## What HelloDeploy Does

HelloDeploy hosts supported web applications from GitHub repositories on administrator-controlled infrastructure. It handles repository access, project configuration, builds, container startup, health checks, routing, logs, and rollback.

HelloDeploy does not host user databases. If your application needs a database, use an external provider such as MongoDB Atlas or Supabase and store the connection values as project environment variables.

## Supported Applications

Version 1 is intended for:

- Static sites
- Node.js applications
- Express applications
- React static builds
- Vue static builds
- Legacy Next.js applications, plus allowlisted Next.js standard server, standalone,
  and static-export projects during the new-mode pilot

Version 1 does not support Python, PHP, Java, Docker Compose submitted by users, arbitrary container images, privileged containers, game servers, cryptocurrency mining, public proxies, VPNs, or large media workloads.

## Account Setup

1. Open HelloDeploy.
2. Select **Create Account** or go to `/auth/create-account`.
3. Enter your name, email address, and password.
4. Review and accept the required legal policies.
5. Verify your email when the verification message arrives.
6. Sign in at `/auth/sign-in`.

If you forget your password, use `/auth/forgot-password`. Password recovery uses three steps: email address, verification code, and new password.

The legal policy bundle is available at `/legal`. It links to the Terms of Service, Privacy Policy, Cookie Policy, Acceptable Use Policy, Service Limits, Data Processing Terms, Copyright Policy, and Security Policy.

## Create a Project

1. Go to **Projects**.
2. Select **New Project** or open `/projects/new`.
3. Enter a project name and slug.
4. Submit the project draft.

The slug is used for the platform subdomain. For example, a project with slug `my-app` is expected to use a platform-managed hostname such as `my-app.hellodeploy.online` after approval and routing.

New projects start as drafts. A draft must be configured and submitted for review before it can deploy.

## Use the Project Overview

The project overview presents the most important next step at the top of the page.

- During setup, it guides the Owner through connecting the source, checking the app, completing initial approval, and publishing the first deployment.
- While approval or deployment is in progress, it links to the current review or deployment details.
- After a healthy deployment, it shows the application address, the live release, recent deployment activity, and whether a newer source commit is available.
- While the app is live, it shows how long the app has been running (for example "Running for 3 days"), or warns "Your app isn't running right now" when the container has stopped.
- If setup or a deployment needs attention, it shows the blocking item or recommendation and the relevant action. Successful technical checks stay out of the way.

Repository, branch, app type, deployment mode, and notification values are available under **Project details**. Owners make configuration changes from **Project Settings**. Maintainers can deploy and retry releases, while Viewers receive read-only status and deployment links.

## Use Project Settings

Project Settings is available to the project Owner. It keeps the common choices easy to find while placing technical options inside advanced sections.

- Edit the project name, choose Manual or Automatic deployments, and set the deployment email preference directly in Settings.
- Use **Advanced build settings**, **Automatic deploy rules (optional)**, and **Working-page check** only when the detected recommendation does not fit the app.
- Follow the links from Settings to manage the repository, check the app, configure domains, manage a deploy hook, or control maintenance mode in their dedicated workflows.
- Archived projects are read-only. Their Settings page retains only the permanent deletion action in **Danger Zone**.

## Connect a Repository

1. Open the project.
2. Go to **Repository**.
3. For a public GitHub repository, paste its HTTPS URL, select **Check repository**, choose a verified branch, and connect it. This path does not require GitHub App installation and supports Manual deployment.
4. For a private repository or Automatic deployment, select **Connect GitHub**, install or authorize the HelloDeploy GitHub App, choose an authorized repository, and choose the production branch.
5. Save the repository connection, then run Detection before deploying.

HelloDeploy stores canonical source metadata. GitHub App sources retain installation identifiers; Public Git sources retain no repository credential. HelloDeploy does not ask for personal access tokens or accept credentials embedded in repository URLs.

## Run Detection

After connecting a repository:

1. Open the project.
2. Go to **Detection**.
3. Select **Check my app**.
4. Review the detected runtime, commands, output directory, port, and warnings.

For an allowlisted Next.js project, detection also recommends Standard server,
Standalone server, or Static export. Review and save that selection before deploying;
dynamic configuration is called out rather than executed by HelloDeploy.

Detection checks whether the project appears deployable. Unsupported runtimes, missing scripts, invalid package metadata, risky files, or unclear configuration can block deployment until corrected.

## Override Build Configuration

Detection fills in recommended values, which usually do not need changes. Owners can override them under **Advanced build settings** on the **Detection** or **Project Settings** page:

- **Build command** and **Start command**: Replace the auto-detected commands.
- **Output directory**: For static builds, where the built files are produced.
- **Application port**: The port your app listens on inside the container.
- **Health check path**: The HTTP path HelloDeploy polls after each deploy to confirm the app is healthy. Defaults to `/`. If your app has a dedicated endpoint such as `/healthz`, set it here — a deployment is only marked healthy after this path responds successfully.
- **Application root**: Use `.` for the repository root or a repository-relative POSIX
  folder such as `apps/web` for a monorepo. Absolute paths, traversal, and escaping
  symlinks are rejected.

The Next.js pilot is npm-only and requires both `package.json` and
`package-lock.json`. Only `NEXT_PUBLIC_*` environment values are available during
`next build`; private values remain runtime-only. P1 is single-instance hosting, so
ISR and cache data remain container-local and are not preserved across replacement or
rollback. Static export cannot use server routes, Server Actions, ISR, middleware, or
server-side image optimization.

Detection warns about Next.js settings that would otherwise fail after the build:

- **Standard server** runs `npm start`, so `package.json` needs `"start": "next start"`.
  Development dependencies are removed after the build, so `next` must be listed under
  `dependencies`, not `devDependencies`. Standalone and static export need neither.
- **Custom `distDir`** is not supported. HelloDeploy expects the default `.next` build
  folder and `out` export folder.

### Python apps (pilot)

Allowlisted projects can deploy Flask, FastAPI, and Django apps. Detection reads
`requirements.txt` (and `pyproject.toml`, to recognize the framework) and recommends one
of three modes:

| Framework | Server HelloDeploy starts | Detected application module                                         |
| --------- | ------------------------- | ------------------------------------------------------------------- |
| Flask     | gunicorn                  | `app:app` from `app.py`, `wsgi.py`, `main.py`, or `app/__init__.py` |
| FastAPI   | uvicorn                   | `main:app` from `main.py`, or `app.main:app` from `app/main.py`     |
| Django    | gunicorn                  | `mysite.wsgi:application` from the settings module in `manage.py`   |

Before the first Python deploy:

- **Confirm the application module** under **Advanced build settings** and save. It uses
  the `module:object` form; for an app factory, add a module-level object such as
  `app = create_app()` in `wsgi.py`.
- **Commit `requirements.txt`** with every package pinned with `==`, including `gunicorn`
  (Flask, Django) or `uvicorn` (FastAPI). Projects that only have `pyproject.toml` can
  export one with `uv export --format requirements-txt > requirements.txt` or
  `poetry export -f requirements.txt > requirements.txt`.
- **Choose the Python version** with a `.python-version` file containing `3.12` or `3.13`.
  Without one, HelloDeploy uses 3.13.
- **Packages must have Linux wheels.** The image has no compiler, so a package that has to
  be built from source fails the build.

The server listens on port 8000 inside the container and trusts the platform proxy's
forwarded headers, so apps see the public `https` scheme. The **build command** is optional
and runs after dependencies are installed.

For Django, add your HelloDeploy address to `ALLOWED_HOSTS` and keep `SECRET_KEY` in a
HelloDeploy environment variable. Use an external database; HelloDeploy never runs
migrations during a deploy, so run them yourself before deploying code that needs them. To
serve static files, add WhiteNoise and set the build command to
`python manage.py collectstatic --noinput`.

Background workers, schedulers, persistent disks, and Python versions other than 3.12 and
3.13 are not supported in the pilot.

### PHP and Laravel apps (pilot)

Allowlisted projects can deploy plain PHP sites and Laravel apps. HelloDeploy serves them
with the official PHP Apache image, so `.php` files run directly and FastCGI is never
exposed.

- **App type and document root.** Detection picks **Laravel** when `composer.json` requires
  `laravel/framework` and `artisan` exists; Laravel always serves `public/`. Other sites are
  **PHP site**, served from the repository root when `index.php` is there or from `public/`
  when only `public/index.php` exists.
- **PHP version.** HelloDeploy uses the newest supported version (8.3 or 8.4) that
  `require.php` in `composer.json` allows, or 8.3 without a constraint.
- **Composer.** A project with `composer.json` must commit `composer.lock`; packages
  install with `composer install --no-dev`. The `pdo_mysql` extension is added to the
  official image's built-in extensions.
- **Public files.** With the repository root as the document root, every file is reachable
  except dotfiles, `composer.json`, `composer.lock`, `auth.json`, and `vendor/`. Keep
  private files out of the repository or use a `public/` folder. Directory listings are
  off and `.htaccess` files are honored.
- **Laravel assets.** When `package.json` has a build script, the build command
  `npm run build` compiles them in a separate Node stage (it needs `package-lock.json`),
  and only `public/build` is copied into the image.

For Laravel, set `APP_KEY` (from `php artisan key:generate --show`) as a HelloDeploy
environment variable and use an external MySQL or MariaDB database. HelloDeploy never runs
migrations during a deploy, so run them yourself before deploying code that needs them.
Logs go to the deployment log (`LOG_CHANNEL=stderr`); `storage/` and `bootstrap/cache` are
writable but are reset on every deploy.

WordPress, queues, the scheduler, persistent uploads, and extensions other than the
official image's defaults plus `pdo_mysql` are not supported in the pilot. Apache runs at
most eight PHP workers per container to stay inside the memory and process limits.

### Java Spring Boot apps (pilot)

Allowlisted projects can deploy Spring Boot web apps built with Maven or Gradle.

- **Commit the build wrapper.** HelloDeploy builds with `mvnw` (and the `.mvn` folder) or
  `gradlew` (and `gradle/wrapper`), so every build uses the same tool version. Spring
  Initializr projects already include them.
- **Java version.** HelloDeploy reads `<java.version>` or `<maven.compiler.release>` from
  `pom.xml`, or the toolchain `languageVersion` or `sourceCompatibility` from the Gradle
  build, and supports 17, 21, and 25. Without one it uses 21.
- **One executable jar.** The build runs `clean package` (Maven) or `clean bootJar` (Gradle)
  with tests skipped and must produce exactly one Spring Boot executable jar. Multi-module
  builds are not supported yet.
- **Port and proxy.** The app listens on 8080 (`SERVER_PORT` overrides
  `application.properties`) and trusts the platform proxy's forwarded headers.
- **Health check.** With Spring Boot Actuator on the classpath, detection sets the health
  check to `/actuator/health`. Otherwise `/` must answer with a success status, or set a
  different path.
- **Memory.** The JVM heap is capped at 60% of the container memory. Spring Boot apps
  usually need at least 512 MB, so ask an administrator to raise the project quota when the
  default is lower.

Databases must be external. Application servers, WAR/EAR deployments, and background job
runners are not supported in the pilot.

### Your own Dockerfile or a prebuilt image (pilot)

Projects an administrator has added to the pilot see **Deploy from** under **Advanced
build settings**:

- **My Dockerfile** builds the Dockerfile at the given path, relative to the application
  root, on HelloDeploy's isolated builder.
- **A prebuilt image** deploys an image from Docker Hub or GitHub Container Registry. A tag
  is locked to its digest at each deploy, so a rollback returns to the exact image even if
  the tag moves. For a private image, save a read-only token under **Settings → Registry
  credentials**.

Both need the **App port** the container listens on, and both must:

- run as a non-root user (`USER 10001` or a named user in the final stage);
- declare no `VOLUME` and use base images from docker.io or ghcr.io only;
- avoid custom `# syntax` frontends, `RUN --network=host`, `RUN --security=insecure`, and
  SSH or secret mounts;
- pass a scan for fixable critical vulnerabilities and stay under the size limit.

Your `.dockerignore` can exclude more files, but it cannot re-include files HelloDeploy
always excludes, such as `.env` files. Private build-time secrets are not passed to the
build.

The new Next.js modes remain a nonproduction, allowlisted pilot until the real
BuildKit/GHCR acceptance matrix passes. A repository-local fixture or unit-test result
does not make a mode generally available.

Leave a field blank to use the detected recommendation. Values cannot contain line breaks.

## Build Filters

Build filters control which pushes trigger a build when automatic deployment is on. Configure them under **Automatic deploy rules (optional)** on the **Detection** or **Project Settings** page, one glob pattern per line:

- **Included paths**: If set, only changes matching these patterns trigger a build (for example `src/**`).
- **Ignored paths**: Changes matching these patterns never trigger a build (for example `docs/**` or `*.md`).

If a push only touches ignored or non-included paths, HelloDeploy skips the build entirely. Leave both lists empty to build on every push.

## Configure Environment Variables

If your app needs secrets or configuration:

1. Open the project.
2. Go to **Environment**.
3. Add each variable by name and value.
4. Save the variable.

Secret values are encrypted immediately and stay hidden. The Owner can select **Show all values** to see them on screen until they select **Hide values**, leave, or reload the page; every reveal is recorded in the project's audit log. Update a value by replacing it.

Do not add `PORT`. HelloDeploy sets it on every app container itself, and a variable with that name is ignored.

Common examples:

- `MONGODB_URI`
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SESSION_SECRET`

Do not commit secrets to your GitHub repository.

## Submit for Review

The first deployment requires administrative review.

1. Complete repository connection, a current successful app check, and required runtime configuration.
2. Open the project overview.
3. Briefly describe what the application does, then select **Submit for review**.
4. Wait for an Admin or Super Admin decision.

An Admin can **Approve** or **Request changes**. Requested changes and the administrator note appear on the project overview. Fix the reported issues, run the app check again, and resubmit. Repository commits or configuration changes after submission require a fresh submission before approval.

## Deployment Modes

HelloDeploy supports two deployment modes for new selections:

- **Manual**: Default mode. GitHub pushes do not deploy automatically. An Owner or Maintainer starts deployments manually.
- **Automatic**: Pushes to the configured production branch can trigger deployment.

Only the project Owner can change deployment mode.

The legacy **Approval Required** value remains readable for existing projects, but per-deployment approval is not implemented. An affected project must switch to Manual or Automatic before review or deployment.

## Deploy an Application

After approval:

1. Open the project.
2. Go to **Deployments**.
3. Select a deployment action, such as deploying the latest commit or redeploying the current commit.
4. Confirm the action if prompted.
5. Watch the deployment status and logs.

During deployment, HelloDeploy validates the project, prepares a controlled build context, builds the application, starts a candidate container, runs health checks, and switches routing only after the candidate is healthy.

If a deployment fails, the previous healthy release should remain active.

Selecting **Deploy without cache** rebuilds the image from scratch instead of reusing Docker layer cache. Use it when a dependency changed outside your lockfile or a cached layer appears stale. It is slower than a normal deploy.

## Deploy Hooks

A deploy hook is a secret URL that triggers a deployment with a single `POST` request — useful for CI pipelines and external integrations.

1. Open the project.
2. Go to **Deploy Hook**.
3. Select **Generate Deploy Hook**.
4. Copy the URL immediately — it is shown only once.

Trigger a deploy from a script or CI job:

```bash
curl -X POST "https://<your-hellodeploy-host>/api/deploy-hooks/<project-id>/<token>"
```

Keep the URL secret: anyone who has it can deploy your project. **Regenerate** replaces the token (the old URL stops working), and **Revoke** disables the hook entirely.

## Read Deployment Status

Deployment statuses explain where the release is in the pipeline:

- **Queued**: Waiting for the worker.
- **Validating**: Checking repository and project configuration.
- **Building**: Creating the application image.
- **Deploying**: Starting and checking the candidate release.
- **Healthy**: Running successfully.
- **Failed**: Deployment failed and the previous release was preserved.
- **Cancelled**: Deployment was cancelled.
- **Rolled Back**: A rollback deployment restored a retained release.

Open an individual deployment to view timeline events and logs.

## Cancel, Retry, and Roll Back

Owners and Maintainers can:

- Cancel queued or active deployments when cancellation is available.
- Retry failed or cancelled deployments.
- Roll back to a retained healthy release.

HelloDeploy retains three healthy rollback releases by default. Rollback still runs health checks before replacing the active route.

## Deployment Notifications

By default the project Owner is emailed after every deployment, whether it succeeds or fails. Owners can change this in **Project Settings**:

- **All**: Email on every deployment outcome.
- **Failures only**: Email only when a deployment fails.
- **None**: No deployment emails.

## Maintenance Mode

Owners can temporarily show visitors a maintenance page instead of the running app:

1. Open the project overview.
2. Expand **Maintenance mode** and optionally enter a custom message.
3. Select **Enable Maintenance**.

Visitors receive a 503 maintenance page. The running container is not stopped, so disabling maintenance instantly restores traffic — no redeploy needed.

## Archive or Delete a Project

Two options in Project Settings under **Danger Zone**, with very different consequences:

- **Archive**: Stops the application and makes the project read-only. Reversible by an Admin.
- **Delete** (project settings): Permanently stops the application and deletes all deployments, domains, environment variables, and membership records. You must type the project slug to confirm. **This cannot be undone.**

## Members and Permissions

Project roles:

- **Owner**: Full project authority, including settings, members, repository, environment, deployment mode, and ownership transfer.
- **Maintainer**: Can operate deployments and inspect logs.
- **Viewer**: Can view project status, deployment summaries, and sanitized logs.

Only the Owner can invite members, remove members, change member roles, and transfer ownership.

To add a member, open **Members** and enter their email address with a role:

- If the person already has a HelloDeploy account, they are added right away and receive an email telling them so.
- If not, they receive an invitation to sign up. The invitation is listed as **Invite pending**, expires after 14 days, and counts toward the project's member limit until it is accepted, revoked, or expires. The Owner can **Revoke** it at any time.

## Custom Domains

Each project can request one custom domain by default.

1. Open the project.
2. Go to **Domains**.
3. Add the hostname.
4. Keep the resulting page open and copy the one-time TXT record name and value.
5. Add the TXT record with the provider that manages the domain's nameservers. For example, use Cloudflare when the nameservers are Cloudflare even if the domain was purchased from GoDaddy.
6. Wait for DNS propagation, then select **Check DNS record**.
7. HelloDeploy verifies ownership and prepares routing automatically when the project has a healthy active deployment.
8. Get the **CNAME record** under "Send your visitors to HelloDeploy". Where available, select **Get my DNS record** and it appears right away, pointing at `customers.hellodeploy.online`, and works at any DNS provider. Otherwise, wait for it to appear. The TXT record only proves that the address is yours; this second record is what actually sends visitors to your app. It appears once an administrator has prepared the connection in the Cloudflare account that manages your domain. Until then, leave your existing records in place.
9. Open your domain's DNS records where the domain's DNS is managed (often where you bought it; in Cloudflare: select the domain, then **DNS** → **Records**) and **delete every A, AAAA or CNAME record named exactly your domain**. These usually point at your registrar's parking page or your old host, and while they exist visitors are sent there instead. Keep the `_hellodeploy-verify` TXT record, email (MX) records and other TXT records.
10. **Add** the CNAME record shown on the page: name `@` (or the part before your domain), the target shown on the page, TTL Auto. If your DNS is on Cloudflare, set proxy status as the page says: **DNS only** (grey cloud) for a `customers.hellodeploy.online` target, **Proxied** (orange cloud) for a `.cfargotunnel.com` target.
11. Wait 1–5 minutes, then select **Check routing**. The page confirms the domain is live, or explains in plain words what is still wrong: old records still sending visitors elsewhere, the connection not running yet, or another server answering for the address.

Once the domain is live, the page lists what to do next:

- **Make www work too.** `www.` + your domain does not open your app on its own. Redirect it to your main address where your DNS is managed (in Cloudflare: **Rules** → **Redirect Rules** → template **Redirect from WWW to root**; other providers call this domain forwarding or a URL redirect).
- **Keep your DNS records.** Deleting or changing the CNAME takes the address offline. The `_hellodeploy-verify` and `_cf-custom-hostname` records can stay.
- Your platform address (`<slug>.hellodeploy.online`) keeps serving the same app as a backup link.

If HelloDeploy has reached its limit of connectable custom domains, the page says it can't connect more right now. The domain stays verified and nothing is lost; contact support to have it connected.

A domain can show as connected inside HelloDeploy while the address still does not open for visitors. That means routing exists here but the CNAME record is missing or points elsewhere; **Check routing** distinguishes the two.

The TXT verification value is shown only once and is stored only as a hash afterward. If it is lost, first try **Check DNS record** if the value was already added. Otherwise, use **Remove and restart**, add the domain again, and copy the newly generated value.

If the project does not yet have a healthy deployment, the domain remains verified and is activated by the next successful deployment. The page refreshes while verification, activation, or removal is running and shows a retryable error when an operation cannot complete. Unverified domains do not receive active routing.

## Default Free Limits

Default limits may be adjusted by an Admin or Super Admin.

| Resource                            |      Default |
| ----------------------------------- | -----------: |
| Owned projects                      |            1 |
| Simultaneously running applications |            1 |
| Project members                     | Owner plus 2 |
| Memory                              |       256 MB |
| CPU                                 |    0.25 core |
| Build context (repository size)     |       500 MB |
| Deployments per month               |           10 |
| Build timeout                       |   10 minutes |
| Custom domains                      |            1 |
| Retained rollback releases          |            3 |
| Deployment log retention            |      30 days |

Premium accounts get unlimited deployments, and their projects are approved automatically once they pass every readiness check. An anonymized record of each finished deployment is kept indefinitely; see the Privacy Policy and the in-app **Service limits** page.

## Troubleshooting

If you cannot deploy:

1. Confirm your email is verified and your account is active.
2. Confirm the project is approved.
3. Confirm you are the Owner or a Maintainer.
4. Confirm the repository is connected.
5. Run detection again after repository changes.
6. Check whether the production branch is correct.
7. Check environment variables for missing external database or API values.
8. Open the failed deployment and read the failure stage and logs.
9. Ask an Admin if quota, queue, suspension, or approval status is blocking the deployment.

Do not share secret values in support messages. Share variable names, deployment IDs, timestamps, and sanitized error text instead.

## Admin Basics

Admins use `/admin` to review users, projects, approval requests, domains, server capacity, queue state, audit events, and quotas.

Admin actions are audited. Routine user deployments should go through the deployment queue, not direct server commands.
