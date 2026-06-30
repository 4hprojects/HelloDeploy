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
4. Accept the required terms.
5. Verify your email when the verification message arrives.
6. Sign in at `/auth/sign-in`.

If you forget your password, use `/auth/forgot-password`. Password recovery uses three steps: email address, verification code, and new password.

## Create a Project

1. Go to **Projects**.
2. Select **New Project** or open `/projects/new`.
3. Enter a project name and slug.
4. Submit the project draft.

The slug is used for the platform subdomain. For example, a project with slug `my-app` is expected to use a platform-managed hostname such as `my-app.hellodeploy.online` after approval and routing.

New projects start as drafts. A draft must be configured and submitted for review before it can deploy.

## Connect GitHub

1. Open the project.
2. Go to **Repository**.
3. Select **Connect Repository**.
4. Install or authorize the HelloDeploy GitHub App when prompted.
5. Choose the repository.
6. Choose the production branch.
7. Save the repository connection.

HelloDeploy stores repository identifiers and installation details. It should not store personal access tokens.

## Run Detection

After connecting a repository:

1. Open the project.
2. Go to **Detection**.
3. Run detection.
4. Review the detected runtime, commands, output directory, port, and warnings.

Detection checks whether the project appears deployable. Unsupported runtimes, missing scripts, invalid package metadata, risky files, or unclear configuration can block deployment until corrected.

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

1. Complete repository connection, detection, and required configuration.
2. Open the project overview.
3. Select **Submit for review**.
4. Wait for an Admin or Super Admin decision.

An Admin can approve, reject, or return the project for revision. If the project is returned for revision, fix the reported issues and submit again.

## Deployment Modes

HelloDeploy supports three deployment modes:

- **Manual**: Default mode. GitHub pushes do not deploy automatically. An Owner or Maintainer starts deployments manually.
- **Automatic**: Pushes to the configured production branch can trigger deployment.
- **Approval Required**: Each deployment requires administrative approval.

Only the project Owner can change deployment mode.

## Deploy an Application

After approval:

1. Open the project.
2. Go to **Deployments**.
3. Select a deployment action, such as deploying the latest commit or redeploying the current commit.
4. Confirm the action if prompted.
5. Watch the deployment status and logs.

During deployment, HelloDeploy validates the project, prepares a controlled build context, builds the application, starts a candidate container, runs health checks, and switches routing only after the candidate is healthy.

If a deployment fails, the previous healthy release should remain active.

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
4. Follow the DNS verification instructions.
5. Request or wait for administrative approval.

Unverified domains do not receive active routing.

## Default Free Limits

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
