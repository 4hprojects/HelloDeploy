# Phase 3: Dashboard and Project Discovery

## Objective

Turn the dashboard into an operational home page instead of a smaller copy of the Projects page.

## Dashboard Questions

The dashboard should answer these questions in order:

1. Is anything broken or waiting for me?
2. Is anything deploying right now?
3. What applications are live?
4. What changed recently?
5. Where do I go next?

## Proposed Dashboard Layout

### A. Page Header

Title:
Dashboard

Subtitle:
"Your applications and deployment activity."

Primary CTA:
New Project

### B. Needs Attention

Only render if there are actionable items.

Examples:
- failed deployment
- project setup incomplete
- approval changes requested
- domain verification failed
- repository connection invalid
- deployment blocked by missing configuration

Each item contains:
- project name
- issue
- relative time
- direct CTA

Do not show informational items in this section.

### C. Active Deployments

Render only when one or more deployments are active.

Each row:
- project
- state
- current stage
- elapsed time
- branch/commit
- View Deployment

Status should update automatically.

### D. Project Health Summary

Cards or compact list:

- Live
- Needs attention
- Setup incomplete
- Archived

Counts should be clickable and filter the project list.

Avoid vanity metrics.

### E. Recent Activity

Show 5 to 10 meaningful events:

- deployment succeeded
- deployment failed
- rollback
- domain activated
- project approved
- teammate invited

Do not flood this with low-value audit events.

### F. Projects Snapshot

Keep a limited project list after the more useful operational blocks.

Columns:
- project
- live state
- last deployment
- domain
- role
- action

## Project List Improvements

### Search

Search by:
- project name
- slug
- repository name

### Filters

- All
- Live
- Deploying
- Needs attention
- Setup incomplete
- Archived

Optional role:
- Owner
- Maintainer
- Viewer

### Sort

- Recently updated
- Recently deployed
- Name A-Z
- Oldest

Default:
Recently updated

### Row Information

Recommended desktop columns:

Project
- name
- slug
- repository

Status
- Live / Failed / Setup / Archived

Last deploy
- relative timestamp
- short SHA

Domain
- primary application URL

Role

Action

### Mobile

Do not force all columns into a horizontal table.

Use stacked project cards below a mobile breakpoint:

Project name
Status
Repository
Last deployment
Open button

## Empty States

### Zero projects

Explain:
"You do not have a project yet."

Then:
"Create a project, connect a GitHub repository, and HelloDeploy will guide you through the setup."

Primary:
Create Project

Secondary:
View Supported Apps

### Search returns zero

Do not use generic "No projects".

Use:
"No projects match your current search and filters."

Actions:
Clear filters
Clear search

## Status Semantics

Use one canonical status copy source.

Project-level state should not simply mirror the database project enum if that enum does not describe the user's current situation.

Possible derived states:

- Live
- Deploying
- Deployment failed
- Setup incomplete
- Waiting for approval
- Changes requested
- Suspended
- Archived

## System Notices

Show user-relevant system notices only.

Examples:
- deployment queue temporarily paused
- scheduled maintenance
- GitHub integration degraded

Do not expose internal CPU/RAM metrics to normal users.

## Performance

Dashboard queries should be intentionally bounded.

Avoid loading:
- complete deployment history
- full audit history
- all members
- all domains

Use aggregated counts and recent records.

## Accessibility

- headings follow logical hierarchy
- status text does not depend on color
- dashboard counters are links only when they navigate somewhere
- live deployment updates use polite `aria-live`
- changing status does not steal focus

## Acceptance Criteria

- Dashboard contains information not duplicated by `/projects`.
- Actionable failures are visible without opening each project.
- Active deployment status updates automatically.
- Projects page supports search.
- Projects page supports meaningful status filters.
- Mobile project discovery does not require horizontal scrolling.
- Empty search state differs from zero-project state.
