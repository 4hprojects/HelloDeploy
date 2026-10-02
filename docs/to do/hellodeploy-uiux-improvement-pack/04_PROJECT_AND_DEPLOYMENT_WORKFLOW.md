# Phase 4: Project Overview and Deployment Workflow

## Objective

Make the project page the command center for one application and make deployment progress understandable without manual refreshes.

## Preserve Existing Strengths

The current project overview already has:

- derived overview state
- primary recommended action
- milestones
- attention findings
- approval feedback
- recent deployment activity
- progressive disclosure for project details
- maintenance controls
- danger zone

Keep this structure. Improve consistency and real-time behavior around it.

## Project Header

Recommended content:

Project Name
Primary application URL
Status
Repository + branch

Primary action on right:
derived from current state

Secondary:
Settings

When live:
Primary = Open Application

When setup incomplete:
Primary = next setup step

When failed:
Primary = Review Failed Deployment

## Application URL

If available:

- make it visually prominent
- copy button
- external-open button
- custom domain shown as primary when active
- platform subdomain shown as fallback/secondary

Do not hide the live URL inside project details.

## Milestones

Current milestones are useful.

Enhance with:

- active/current step
- blocked step
- optional vs required distinction

Do not display a completed checklist forever after the first healthy deployment unless the user requests setup details.

## Attention Findings

Sort:

1. Blocking
2. Warning
3. Recommendation

Each finding must contain a direct fix link when a fix surface exists.

Example:

Fix required: Start command is missing
"HelloDeploy needs a command to start your Node.js application."
[Review App Setup]

## Deployment Creation

Deploy action must show:

- source branch
- short commit SHA
- commit message if available
- deployment mode
- cache option only under Advanced

If another deployment is active:
- disable deploy button
- explain what is running
- link to active deployment

## Deployment List

### Required Real-Time Behavior

When active deployment exists:

- poll lightweight status endpoint or consume event stream
- update row state in place
- update duration
- update final result
- stop updates when no active rows remain

Do not reload the whole page after completion.

### Columns

Desktop:
- number
- status
- source
- trigger
- started
- duration
- action

Mobile:
- deployment number + status
- branch/commit
- time
- action

## Deployment Detail

Information hierarchy:

### 1. Result

Examples:
Live
Failed
Cancelled
Replaced

### 2. Human Explanation

"Your application was built and published successfully."

or

"The application container started, but the health check did not pass."

### 3. Recommended Action

Contextual buttons.

### 4. Timeline

Stages:

Queued
Validating
Cloning
Building
Starting
Health checking
Routing
Live

Each stage:
- complete
- current
- failed
- skipped

### 5. Technical Logs

Collapsible or lower on page.

Provide:
- follow-live toggle
- copy visible logs
- download logs if supported
- search/filter when log volume grows

Do not auto-scroll against user intent after the user scrolls upward.

## Failure Presentation

Build a reusable failure-summary component.

Fields:

Title
Plain-language summary
Likely source
Recommended check
Retry eligibility
Technical code

Example:

Title:
Application did not become healthy

Summary:
"The build completed, but HelloDeploy could not confirm that the application was responding."

Check:
- start command
- configured port
- required environment variables
- health-check path

Technical details:
`HEALTH_CHECK_TIMEOUT`

## Retry

Retry should explicitly state:

- same commit or latest commit
- cache behavior
- whether settings changed since previous attempt

Recommended options:

Retry same commit
Deploy latest commit

Do not silently change source during retry.

## Rollback

Rollback UI must clearly identify:

Current:
Deployment #18, abc1234

Restore:
Deployment #16, def5678

Confirmation:
"Restore deployment #16? HelloDeploy will route traffic back to this previously healthy release."

After rollback:
label result as Replaced/Restored, not "new deployment succeeded" without context.

## Cancellation

Cancellation should be available only when meaningful.

Confirm:
"Cancel deployment #19? The current build/deploy attempt will stop. Your existing live release will remain active."

## Automatic Deploy

Project page should show whether auto-deploy is:

On
Off
Paused for review

If paused:
show why and direct manual-review action.

## Deployment History Filters

When history grows, add:

- All
- Live
- Failed
- Cancelled
- Rollbacks

Optional:
branch filter

## Accessibility

- live updates use `aria-live="polite"`
- status transitions include text
- log viewer is keyboard accessible
- timeline does not depend on color
- Retry/Rollback/Cancel controls have distinct labels
- focus remains stable during status updates

## Acceptance Criteria

- Deployment list updates without manual reload.
- Deployment detail shows human explanation before logs.
- Every failed deployment has a recommended next action when known.
- Retry makes source commit behavior explicit.
- Rollback identifies both current and target releases.
- Existing live release remains visually distinguished from failed candidates.
- Mobile deployment history remains readable without horizontal scrolling.
