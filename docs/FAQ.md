# HelloDeploy FAQ

## General

### What is HelloDeploy?

HelloDeploy is a self-hosted deployment platform for web applications. It connects to GitHub, builds supported projects, runs them in isolated containers, and routes traffic through administrator-controlled infrastructure.

### Who is HelloDeploy for?

It is for developers and project owners who need controlled hosting without manually configuring Linux, Docker, Nginx, ports, TLS, or Cloudflare Tunnel.

### Is HelloDeploy a cloud provider?

No. HelloDeploy is an application deployment platform running on administrator-controlled infrastructure. It is designed for controlled self-hosting and resource-constrained servers.

### Does HelloDeploy host databases?

No. Use external database providers such as MongoDB Atlas or Supabase. Store database connection strings as encrypted project environment variables.

### What applications are supported?

Version 1 targets static sites, Node.js, Express, React, Vue, and constrained Next.js applications.

### What applications are not supported?

Version 1 does not support Python, PHP, Java, Docker Compose submitted by users, arbitrary container images, privileged containers, game servers, public proxies, VPNs, cryptocurrency mining, or large media workloads.

## Accounts

### Where do I create an account?

Use `/auth/create-account`.

### What legal policies do I accept when creating an account?

The account creation form links to the Terms of Service, Privacy Policy, Cookie Policy, Acceptable Use Policy, and the consolidated Legal Policies page. You can review the full legal bundle at `/legal`.

### Where do I sign in?

Use `/auth/sign-in`.

### How do I reset my password?

Use `/auth/forgot-password`. Password recovery asks for your email address, a verification code, and a new password.

### Why can I not sign in?

Common causes are an unverified email address, a suspended account, invalid credentials, or an expired session.

## Projects

### What is a project?

A project is a deployable application configuration. It includes the name, slug, repository, production branch, detected runtime, environment variables, domains, members, and deployment history.

### What is a slug?

The slug is the URL-safe project identifier used for the platform subdomain. For example, `my-app` can map to a platform hostname such as `my-app.apps.hellodeploy.online`.

### Why does my first deployment need approval?

HelloDeploy runs user code on shared infrastructure. Initial approval lets an Admin review runtime, repository risk, resource needs, and acceptable-use concerns before deployment.

### Can I have more than one project?

The default free limit is one owned project. Admins can grant user-specific or project-specific quota overrides.

### Can I invite teammates?

Yes. Owners can invite members as Maintainers or Viewers. Maintainers can operate deployments. Viewers can inspect status and logs.

## GitHub

### Why does HelloDeploy need a GitHub App?

The GitHub App gives HelloDeploy scoped access to repositories you authorize. It avoids personal access token storage and supports signed webhooks.

### Does HelloDeploy deploy every push?

Only in Automatic mode, and only for the configured production branch. Manual mode is the default.

### What happens when I push to a non-production branch?

It should not trigger a production deployment.

### Can I change the production branch?

Yes, but production branch changes can require review because they affect deployment behavior.

## Deployment

### How do I deploy?

Open the project, go to **Deployments**, choose the deployment action, and confirm it. The project must be approved, and you must be the Owner or a Maintainer.

### What happens during deployment?

HelloDeploy validates the project, fetches the exact commit, prepares a safe build context, builds the application, starts a candidate container, runs health checks, and switches routing only after the candidate is healthy.

### What happens if deployment fails?

The failed stage and safe diagnostic output are recorded. Temporary build or candidate resources are cleaned up, and the previous active release should remain untouched.

### Can I cancel a deployment?

Owners and Maintainers can cancel queued or active deployments when cancellation is available.

### Can I retry a failed deployment?

Yes. Owners and Maintainers can retry failed or cancelled deployments.

### Can I roll back?

Yes. HelloDeploy retains three healthy rollback releases by default. Rollback starts the retained release, runs health checks, and switches routing only after it passes.

### Where do I view logs?

Open the project, go to **Deployments**, and open a deployment detail page. Logs are sanitized to avoid exposing secrets.

### Why is my deployment still queued?

The deployment queue may be busy, paused, or waiting for capacity. The default worker concurrency is intentionally conservative for low-resource servers.

## Configuration

### How do I add environment variables?

Open the project, go to **Environment**, and add each variable by name and value.

### Can I view a secret after saving it?

No. Secret values should be encrypted before storage and not displayed again. Replace the value if it needs to change.

### Do environment variable changes affect the running release immediately?

No. A redeployment or restart is required for changes to affect the running application.

### What files are considered high risk?

Examples include Dockerfiles, infrastructure manifests, platform deployment configuration, build command changes, start command changes, port changes, and storage or network policy changes.

## Domains

### Do I get a default domain?

Approved projects are intended to receive a platform-managed subdomain based on the project slug.

### Can I use a custom domain?

Yes. The default limit is one custom domain per project. Ownership must be verified and an Admin must approve activation.

### Can two projects claim the same domain?

No. Domain ownership must be unique.

## Limits and Safety

### What are the default free limits?

The default limits include one owned project, one running application, 256 MB memory, 0.25 CPU, 500 MB writable storage, 10 deployments per month, a 5-minute build timeout, one custom domain, three retained rollback releases, and 7-day log retention.

### Can limits be increased?

Yes. Admins or Super Admins can apply user-specific or project-specific overrides.

### Are deployments isolated?

Each deployed application is intended to run in its own restricted Docker container with CPU, memory, process, and storage controls.

### What content is prohibited?

The Acceptable Use Policy prohibits malware, phishing, credential theft, illegal content, cryptocurrency mining, public proxies, VPNs, network scanning, and other unsafe or abusive workloads.

### Are logs permanent?

No. Build and deployment logs are retained for 7 days by default.

## Automation and Operations

### Can I trigger deploys from CI or scripts?

Yes. Generate a deploy hook on the project's Deploy Hook page and POST to the shown URL with the token. The token is shown once at generation; revoke and regenerate it any time.

### Can I stop pushes to certain paths from triggering builds?

Yes. Build filters (Detection page) take included and ignored glob patterns, one per line. If a push only touches filtered-out paths, the build is skipped.

### What is maintenance mode?

A per-project switch on the overview page. Visitors see a maintenance page (optionally with your custom message) while the running container keeps running; disabling it restores traffic instantly.

### Do I get notified about deployment results?

Yes, by email when a deployment turns HEALTHY or FAILED. Choose all results, failures only, or none in the project's notification preference setting.

### What does "deploy without cache" do?

It runs the image build with `--no-cache`, ignoring Docker layer caches. Use it when a build picks up stale dependencies; expect it to be slower.

### What is the health check path for?

After each deploy, HelloDeploy polls this HTTP path (default `/`) on your app until it responds successfully; the release only goes live after the check passes. Set it on the Detection page if your app serves a dedicated endpoint like `/healthz`.

## Support

### What should I include when asking for help?

Include the project slug, deployment ID, timestamp, failure stage, and sanitized error text. Do not include secret values.

### What should I check before contacting an Admin?

Confirm your account is active, the project is approved, GitHub is connected, the production branch is correct, detection has passed, required environment variables exist, and your quota has not been exceeded.
