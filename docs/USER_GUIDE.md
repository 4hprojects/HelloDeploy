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
- Constrained Next.js applications

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

## Deploy a Website

The guided path is the default way to publish. From **Projects** or your dashboard,
select **Deploy a Website**.

1. **Where is your website?** Choose GitHub. Uploading a folder and starting from a
   template are listed but not yet available.
2. **Choose your website.** Search your GitHub projects and pick one. The branch is
   taken from the repository's default; changing it is under **Advanced options**.
   HelloDeploy only lists repositories your GitHub App installation can reach — if
   one is missing, grant access to it and return to the page.
3. **Check your project.** HelloDeploy analyses the code as soon as it is connected
   and reports what it found in plain language. When it is confident, continue.
   When it had to guess, it asks you to glance at the settings first. When something
   blocks it, the step says what and offers no way past until it is fixed.
4. **Name your website.** Both the name and the web address are suggested from the
   repository and both are editable. Availability is checked as you type. The name
   can change later; the address is fixed once you publish.
5. **Add your settings.** HelloDeploy reads your project's `.env.example` to work
   out which values it needs. Anything required and missing blocks publishing and is
   named. `PORT`, `NODE_ENV`, `HOST` and `HOSTNAME` are set by HelloDeploy and cannot
   be entered here — Advanced mode can override that if your app genuinely needs to.
6. **Publish.** The last step lists what was checked. Every item that is not ready
   links straight to the field that fixes it. If your website has never been
   reviewed, this step sends it for review instead of publishing.

The project is created when you pick a repository, so abandoning the flow part-way
leaves nothing behind but an unfinished website you can return to. Progress is
stored against the project, not your browser session: closing the page, refreshing,
or returning on another device resumes at the same step.

### Setting up a project by hand

`/projects/new/manual` creates an empty website with just a name. Use it when you
need to connect a public Git URL, which the guided path does not cover. It is
reachable from **Set it up myself** on the first guided screen.

## Simple and Advanced mode

Every account is in Simple mode by default. The switch is at the bottom of the
sidebar.

Simple mode shows Overview, Deployments, Domain, Environment, Usage and Settings.
Advanced mode adds Repository, Detection, Deploy Hook and Members, and reveals the
build command, start command, internal port, health-check path, deploy hook, raw
failure codes, DNS diagnostics and resource allocation.

Hiding is presentation only. Nothing is removed, no page stops working, and your
role still decides what you are allowed to do. A control hidden in Simple mode is
always reachable in Advanced mode.

## Use the Project Overview

The overview leads with your website: its name, whether it is live, your own domain
above the HelloDeploy address, when it was last published and from which branch,
and buttons to open it or publish again.

Below that, cards answer the questions you are most likely to have — whether the
website is online, whether the last publish worked, where the code comes from,
whether automatic publishing is on, whether your domain is connected, and whether
the connection is secure.

In Advanced mode the overview also keeps the raw **Project details** block:
repository, branch, app type, deployment mode, notification preference and the
current source version. Those values stay visible in Simple mode too while a
website is still being set up, when the cards have little to say.

Owners make configuration changes from **Project Settings**. Maintainers can publish
and retry releases; Viewers get read-only status and links.

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

Detection runs by itself the moment a repository is connected through the guided
path, and its result is what the **Check your project** step shows. You do not have
to trigger it.

To run it again — after changing build settings by hand, for example — open the
project and go to **Detection** (Advanced mode), then select **Check my app**. The
guided step also has a **Check again** button.

Each detected setting records how much evidence it rests on. A framework listed as
a dependency, or a script the project declares, is treated as certain and applied
without asking. A value filled in from a framework's convention, or a runtime
inferred only from the presence of a `start` script, is treated as a guess and the
guided step asks you to confirm it. Projects detected before HelloDeploy tracked
this are marked `LEGACY` and are never given a score after the fact.

Detection checks whether the project appears deployable. Unsupported runtimes, missing scripts, invalid package metadata, risky files, or unclear configuration can block deployment until corrected.

## Override Build Configuration

Detection fills in recommended values, which usually do not need changes. Owners can override them under **Advanced build settings** on the **Detection** or **Project Settings** page:

- **Build command** and **Start command**: Replace the auto-detected commands.
- **Output directory**: For static builds, where the built files are produced.
- **Application port**: The port your app listens on inside the container.
- **Health check path**: The HTTP path HelloDeploy polls after each deploy to confirm the app is healthy. Defaults to `/`. If your app has a dedicated endpoint such as `/healthz`, set it here — a deployment is only marked healthy after this path responds successfully.

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

Secret values are encrypted before storage. After saving, HelloDeploy should not show the raw value again. Update a value by replacing it.

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

## Automatic publishing

In Simple mode, **Project Settings** offers a straight choice: publish updates from
GitHub, or only when you choose. In Advanced mode the same setting appears as
Manual and Automatic deployment modes.

- **Only when I choose** (Manual) is the default. Pushing to GitHub changes nothing
  until you press **Publish again**.
- **Publish updates from GitHub** (Automatic) publishes every change you push to
  your chosen branch.

With automatic publishing on: a repeated delivery of the same push is ignored, each
publish records the commit and its message so you can tell which change caused what,
a second push while one is still publishing is refused rather than run alongside it,
and a change that fails to build never replaces your working website.

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

Opening a deployment shows an ordered list of what is happening, not a wall of logs:

1. **Prepare your files** — downloading your code and checking it is safe to build.
2. **Install and build** — fetching the packages your website needs, then building it.
3. **Set up your website** — reserving a slot and loading your settings.
4. **Start your website** — launching it for the first time.
5. **Check it responds** — confirming it answers before visitors are sent to it.
6. **Publish** — pointing your web address at the new version.

Install and build are one step because both happen inside a single build, and
separating them would mean guessing from build output.

Each step shows its state in words as well as a symbol, so nothing depends on
colour. A step that was never reached shows as not started rather than skipped,
because nothing was attempted. Technical logs are available under **View technical
logs** — open while a publish is running, collapsed once it has finished.

Status names differ by mode. Simple mode says Waiting to start, Checking setup,
Building, Publishing, Live, Did not publish, Cancelled and Replaced. Advanced mode
uses the platform's own terms: Queued, Validating, Building, Deploying, Healthy,
Failed, Cancelled and Rolled Back.

When a publish fails, the page leads with a plain-language explanation and offers
the steps that fit that particular failure — a lost GitHub connection sends you to
the repository, a missing value to your settings, a build error to the logs. No
failure is left without something to do. The failure code and the raw error stay
available: behind **Technical details** in Simple mode, shown directly in Advanced.

## Cancel, Retry, and Roll Back

Owners and Maintainers can:

- Cancel a publish that is still running.
- Try a failed or cancelled publish again.
- Restore an earlier working version.

Restoring is offered on each row of the publish history, next to the version you are
reading about, and the version currently serving visitors is marked **Live now**.

HelloDeploy keeps three working versions by default. Restoring one still runs the
health check before visitors are moved across, and the version being replaced stays
in the history.

A failed publish never replaces a working website. The live version only changes
after the new one has started and answered, so a broken change leaves your visitors
where they were.

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

## Custom Domains

Each project can request one custom domain by default.

1. Open the project.
2. Go to **Domains**.
3. Add the hostname.
4. Keep the resulting page open and copy the one-time TXT record name and value.
5. Add the TXT record with the provider that manages the domain's nameservers. For example, use Cloudflare when the nameservers are Cloudflare even if the domain was purchased from GoDaddy.
6. Wait for DNS propagation, then select **Check DNS record**.
7. HelloDeploy verifies ownership and prepares routing automatically when the project has a healthy active deployment.
8. Add the **CNAME record** shown under "Send your visitors to HelloDeploy". The TXT record only proves that the address is yours; this second record is what actually sends visitors to your app. It appears once an administrator has prepared the connection for your address.
9. Select **Check routing**. The page confirms the domain is live, or explains what is still wrong — DNS not pointing here yet, a disconnected connector, or another server answering for the address.

### Root and www addresses

Each domain you add covers exactly the address you typed and nothing else. `example.com` and
`www.example.com` are two separate addresses: adding one does not serve the other, and HelloDeploy
does not redirect between them.

To serve both, add each as its own domain and create the CNAME record for each. Visitors who type
the form you did not add will not reach your website.

### Where the record goes

The Domains page detects which service manages your DNS and names it, so you do not have to work
out whether to edit records at your registrar or elsewhere. Detection reads your domain's
authoritative nameservers; it never changes anything on your behalf. If the provider is not
recognised, the page falls back to generic guidance and the records shown are still correct.

In Advanced mode the page also shows the zone that answered, its nameservers, the last routing
check and the raw probe result.

A domain can show as connected inside HelloDeploy while the address still does not open for visitors. That means routing exists here but the CNAME record is missing or points elsewhere; **Check routing** distinguishes the two.

The TXT verification value is shown only once and is stored only as a hash afterward. If it is lost, first try **Check DNS record** if the value was already added. Otherwise, use **Remove and restart**, add the domain again, and copy the newly generated value.

If the project does not yet have a healthy deployment, the domain remains verified and is activated by the next successful deployment. The page refreshes while verification, activation, or removal is running and shows a retryable error when an operation cannot complete. Unverified domains do not receive active routing.

## Default Free Limits

The **Usage** page shows what you are using against your allowance, and warns you
before you reach a limit.

It shows an allowance only where HelloDeploy actually refuses to exceed it: websites
you own, and people per website. Your connected domains are reported as a plain
count, because the custom-domain limit below is configurable but is **not** checked
when a domain is added. The remaining values are configurable and equally unchecked,
so no meter is shown for them — a meter would imply something happens when you reach
the limit, and nothing would.

Default limits may be adjusted by an Admin or Super Admin.

| Resource                            |      Default |
| ----------------------------------- | -----------: |
| Owned projects                      |            1 |
| Simultaneously running applications |            1 |
| Project members                     | Owner plus 2 |
| Memory                              |       256 MB |
| CPU                                 |    0.25 core |
| Writable project storage            |       500 MB |
| Deployments per month               |           10 |
| Build timeout                       |    5 minutes |
| Custom domains                      |            1 |
| Retained rollback releases          |            3 |
| Log retention                       |       7 days |

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
