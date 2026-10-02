# Phase 2: Authentication, Onboarding, and First Deploy

## Objective

Reduce the number of moments where a new user asks, "What should I do next?"

## Target Funnel

1. Visit landing page
2. Create account
3. Verify email
4. Sign in
5. Create project
6. Connect GitHub
7. Choose repository
8. Choose production branch
9. Detect application
10. Review detected settings
11. Add required environment variables
12. Resolve blockers
13. Submit for review if required
14. Deploy
15. Verify live application

## UX Requirement

At every step, the user must see:

- current step
- completion state
- reason the step matters
- blocker if incomplete
- one recommended next action

## Account Creation

### Required Improvements

Keep field-level validation.

Add a short pre-submit expectation panel:

"You will need:
- a verified email address
- access to a GitHub repository
- a supported web application"

Add direct link:
"Check supported applications"

### Password Guidance

Do not show requirements only after failure.

Show requirements next to the password field before submit.

Use validation messages that identify the specific unmet rule.

## Email Verification

### Page must answer

- Which email address received the code/link?
- How long is the verification valid?
- What should the user do if the email does not arrive?
- When can they resend?
- Can they change the email address?

### Resend Behavior

- countdown before repeated resend
- disabled state with readable explanation
- success message names destination address in masked form
- error state gives next step, not only a generic failure

## First Successful Login

Do not drop a brand-new user onto a generic dashboard without context.

If user has zero projects:

Show:
- short welcome heading
- one sentence explaining the deployment flow
- "Create your first project" primary CTA
- supported-app link
- optional "How deployment works" link

Do not show an empty table.

## New Project Form

Fields should be minimal.

Primary fields:
- project name
- slug

Do not ask for advanced deployment configuration during initial project creation.

### Slug UX

- auto-suggest from project name
- preview resulting subdomain
- validate availability before submit if feasible
- explain slug permanence if changing it later has consequences

Example preview:

`my-project.hellodeploy.online`

## Guided Project Setup

After creation, project overview becomes the setup guide.

Suggested milestone model:

1. Project created
2. GitHub connected
3. Repository selected
4. App detected
5. Required configuration complete
6. Project approved
7. First deployment complete

Milestones must link directly to the required action.

## Repository Connection

Separate two concepts:

- Connect GitHub account/app
- Select repository for this project

Users should not confuse GitHub authorization with repository assignment.

### Repository Picker

Requirements:
- search
- repository owner/name
- private/public indicator
- default branch
- clear permission error state
- refresh repositories action

## Branch Selection

Label:
"Production branch"

Hint:
"Pushes to this branch can trigger deployments when automatic deployment is enabled."

Do not assume all users understand production branch terminology.

## Detection Step

Detection output should be a review screen.

Show:

Detected:
- application type
- build command
- start command
- output directory
- port
- health path

For each value:
- detected value
- confidence/source when useful
- Edit action

Use "Advanced configuration" disclosure for overrides.

## Environment Variables

Before opening the environment page, readiness should say whether variables are required.

Examples:

"No required environment variables detected."

or

"2 environment variables still need values."

Never reveal stored secret values after save.

Provide:
- variable name
- status: Set / Missing
- optional description
- last updated date
- Update/Remove action

## Readiness Summary

Before approval/deployment, show one readiness block with:

Ready:
- repository connected
- application detected
- build settings valid
- required secrets present

Warnings:
- optional health check missing
- no custom domain

Blocking:
- no start command
- required secret missing
- unsupported runtime

Use:
Fix required
Recommendation
Ready

## Approval Step

If approval is required:

Explain:
"An administrator reviews this project once before it can deploy."

Show:
- submitted date
- status
- app purpose
- administrator note
- resubmit action when requested

Do not make approval feel like a deployment failure.

## First Deploy

Before the first deploy button:

Show a concise confirmation:

"HelloDeploy will build commit abc1234 from main and publish it to your project URL."

Advanced optional:
Deploy without cache

## Success State

After first successful deployment:

Primary:
Open Application

Secondary:
View Deployment Details

Next suggestions:
- Add custom domain
- Configure automatic deployment
- Invite teammate

These suggestions must not compete visually with Open Application.

## Failure State

Do not show raw logs as the first explanation.

Show:

What happened
Likely cause
What to check
Retry action
View technical logs

Example:

"Your application built successfully but did not become healthy."

"Check that your app listens on the configured port and starts with the configured command."

Buttons:
- Review app setup
- Retry
- View logs

## Funnel Events to Measure

Record anonymous/product analytics where appropriate:

- signup_started
- signup_completed
- verification_completed
- project_created
- github_connected
- repository_selected
- detection_completed
- readiness_blocked
- approval_submitted
- first_deploy_started
- first_deploy_failed
- first_deploy_succeeded

Do not log secrets, tokens, repository credentials, or private environment values.

## Acceptance Criteria

- New account with zero projects receives a dedicated empty-state onboarding experience.
- First-deploy milestones remain visible until first healthy deployment.
- Every incomplete milestone links to the correct action.
- Readiness distinguishes blocking items from recommendations.
- Detection defaults are understandable before advanced overrides are shown.
- First deploy clearly names branch/commit.
- First failure provides a plain-language recovery path.
- Technical logs remain available without being the only explanation.
